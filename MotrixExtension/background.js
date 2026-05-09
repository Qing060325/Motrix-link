// ============================================================
// Send to Motrix - Background Service Worker
// 功能：右键菜单 + 自动拦截浏览器下载 + 任务管理
//       + 角标显示 + 批量下载 + 速度限制 + 快捷键
// ============================================================

importScripts("config.js");

// ---------- 常量 ----------
const RPC_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const TASK_HISTORY_MAX = 50;
const BADGE_REFRESH_INTERVAL = 5000; // 角标刷新间隔
const COMPLETION_CHECK_INTERVAL = 10000; // 完成通知检查间隔
const KEEPALIVE_ALARM = "motrix-keepalive";

// ---------- 工具函数 ----------
async function getConfig() {
  const stored = await chrome.storage.local.get("config");
  const cfg = { ...DEFAULT_CONFIG, ...(stored.config || {}) };
  // 兼容旧版：如果没有 serverProfiles，从 rpcUrl 构建
  if (!cfg.serverProfiles || cfg.serverProfiles.length === 0) {
    cfg.serverProfiles = [{ name: "默认", url: cfg.rpcUrl, secret: cfg.rpcSecret }];
    cfg.activeProfileIndex = 0;
  }
  return cfg;
}

/**
 * 获取当前活跃的 RPC 连接信息
 */
async function getActiveRpc() {
  const cfg = await getConfig();
  const profiles = cfg.serverProfiles || [];
  if (profiles.length === 0) {
    return { rpcUrl: cfg.rpcUrl, rpcSecret: cfg.rpcSecret };
  }
  const idx = Math.min(cfg.activeProfileIndex, profiles.length - 1);
  const profile = profiles[idx];
  return {
    rpcUrl: profile?.url || cfg.rpcUrl,
    rpcSecret: profile?.secret || cfg.rpcSecret
  };
}

function getExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const seg = pathname.split("/").pop() || "";
    const dot = seg.lastIndexOf(".");
    return dot > 0 ? seg.slice(dot + 1) : "";
  } catch {
    return "";
  }
}

function matchExtension(url, extensions) {
  if (!extensions || extensions.length === 0) return true;
  const ext = getExtension(url);
  return ext ? extensions.includes(ext) : false;
}

function sizeInMB(bytes) {
  return bytes / (1024 * 1024);
}

// ---------- 任务历史 ----------
let _historyQueue = Promise.resolve();
async function addToHistory(entry) {
  const promise = _historyQueue.then(async () => {
    const { taskHistory = [] } = await chrome.storage.local.get("taskHistory");
    taskHistory.unshift({ ...entry, time: Date.now() });
    await chrome.storage.local.set({
      taskHistory: taskHistory.slice(0, TASK_HISTORY_MAX)
    });
  }).catch(() => {});
  _historyQueue = promise;
  await promise;
}

async function getHistory() {
  const { taskHistory = [] } = await chrome.storage.local.get("taskHistory");
  return taskHistory;
}

async function clearHistory() {
  await chrome.storage.local.set({ taskHistory: [] });
}

// ---------- Motrix RPC 调用（带重试） ----------
async function rpcCall(method, params = [], rpcConfig) {
  const rpc = rpcConfig || await getActiveRpc();

  const payload = {
    jsonrpc: "2.0",
    id: "motrix-ext-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    method,
    params: rpc.rpcSecret
      ? ["token:" + rpc.rpcSecret, ...params]
      : params
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

      const response = await fetch(rpc.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`${data.error.message} (code: ${data.error.code})`);
      }
      return data.result;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

async function sendToMotrix(url, rpcConfig, options = {}) {
  return rpcCall("aria2.addUri", [[url], options], rpcConfig);
}

async function getActiveTasks(rpcConfig) {
  return rpcCall("aria2.tellActive", [], rpcConfig);
}

async function getWaitingTasks(rpcConfig) {
  return rpcCall("aria2.tellWaiting", [0, 50], rpcConfig);
}

async function getStoppedTasks(rpcConfig) {
  return rpcCall("aria2.tellStopped", [0, 20], rpcConfig);
}

async function pauseTask(gid, rpcConfig) {
  return rpcCall("aria2.pause", [gid], rpcConfig);
}

async function resumeTask(gid, rpcConfig) {
  return rpcCall("aria2.unpause", [gid], rpcConfig);
}

async function removeTask(gid, rpcConfig) {
  return rpcCall("aria2.remove", [gid], rpcConfig);
}

async function forceRemoveTask(gid, rpcConfig) {
  return rpcCall("aria2.forceRemove", [gid], rpcConfig);
}

async function getVersion(rpcConfig) {
  return rpcCall("aria2.getVersion", [], rpcConfig);
}

/**
 * 设置全局速度限制
 * @param {number} bytesPerSec - 速度限制（字节/秒），0 表示不限
 */
async function setGlobalSpeedLimit(bytesPerSec, rpcConfig) {
  const limit = bytesPerSec > 0 ? String(bytesPerSec) : "0";
  await rpcCall("aria2.changeGlobalOption", [{ "max-overall-download-limit": limit }], rpcConfig);
}

// ---------- 批量发送（带并发控制） ----------
const BATCH_CONCURRENCY = 5;

async function batchSendUrls(urls, rpcConfig, source) {
  let success = 0, failed = 0, errors = [];

  for (let i = 0; i < urls.length; i += BATCH_CONCURRENCY) {
    const batch = urls.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          const taskId = await sendToMotrix(url, rpcConfig);
          await addToHistory({ url, gid: taskId, status: "sent", source });
          return { ok: true };
        } catch (err) {
          await addToHistory({ url, status: "failed", error: err.message, source });
          return { ok: false, error: err.message };
        }
      })
    );

    for (const r of results) {
      if (r.ok) success++;
      else { failed++; errors.push(r.error); }
    }
  }

  return { success, failed, errors };
}

// ---------- 角标管理 & 完成通知 ----------
let badgeTimer = null;
let completionTimer = null;

async function updateBadge() {
  try {
    const rpcConfig = await getActiveRpc();
    const active = await getActiveTasks(rpcConfig).catch(() => []);
    const count = active.length;

    if (count > 0) {
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    chrome.action.setBadgeText({ text: "" });
  }
}

function startBadgeTimer() {
  stopBadgeTimer();
  badgeTimer = setInterval(updateBadge, BADGE_REFRESH_INTERVAL);
  completionTimer = setInterval(checkCompletedTasks, COMPLETION_CHECK_INTERVAL);
  updateBadge();
  checkCompletedTasks();
}

function stopBadgeTimer() {
  if (badgeTimer) {
    clearInterval(badgeTimer);
    badgeTimer = null;
  }
  if (completionTimer) {
    clearInterval(completionTimer);
    completionTimer = null;
  }
  chrome.action.setBadgeText({ text: "" });
}

// ---------- 通知 ----------
function notify(title, message, isError = false) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: isError ? "icons/icon-error.png" : "icons/icon128.png",
      title,
      message
    });
  } catch (e) {
    console.warn("通知发送失败:", e);
  }
}

// ---------- 下载完成通知 ----------
async function checkCompletedTasks() {
  try {
    const config = await getConfig();
    if (!config.downloadCompleteNotify) return;

    const rpcConfig = await getActiveRpc();
    const stopped = await getStoppedTasks(rpcConfig);
    if (!stopped || stopped.length === 0) return;

    const { notifiedGids = [] } = await chrome.storage.local.get("notifiedGids");
    const notifiedSet = new Set(notifiedGids);
    let updated = false;

    for (const task of stopped) {
      if (notifiedSet.has(task.gid)) continue;
      notifiedSet.add(task.gid);
      notifiedGids.push(task.gid);
      updated = true;

      let name = "";
      if (task.files && task.files[0]) {
        if (task.files[0].path) name = task.files[0].path.split("/").pop();
        if (!name && task.files[0].uris && task.files[0].uris[0]) {
          try {
            name = new URL(task.files[0].uris[0].uri).pathname.split("/").pop() || "";
          } catch {}
        }
      }
      name = name || "未知文件";

      if (task.status === "complete") {
        notify("下载完成", name);
      } else if (task.status === "error") {
        notify("下载失败", name, true);
      }
    }

    if (updated) {
      if (notifiedGids.length > 100) notifiedGids.splice(0, notifiedGids.length - 100);
      await chrome.storage.local.set({ notifiedGids });
    }
  } catch (e) {
    console.warn("完成通知检查失败:", e);
  }
}

// ---------- 右键菜单 ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });

  // 单链接下载
  chrome.contextMenus.create({
    id: "download-with-motrix",
    title: "使用 Motrix 下载",
    contexts: ["link", "image", "video", "audio"]
  });

  // 批量下载：选中文本中的链接
  chrome.contextMenus.create({
    id: "batch-download-motrix",
    title: "批量下载选中链接 (%s)",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const rpcConfig = await getActiveRpc();

  if (info.menuItemId === "download-with-motrix") {
    const url = info.linkUrl || info.srcUrl;
    if (!url) return;

    try {
      const taskId = await sendToMotrix(url, rpcConfig);
      notify("已发送到 Motrix", `任务 ID: ${taskId}`);
      await addToHistory({ url, gid: taskId, status: "sent", source: "context-menu" });
      updateBadge();
    } catch (err) {
      console.error("发送失败:", err);
      notify("发送失败", err.message, true);
      await addToHistory({ url, status: "failed", error: err.message, source: "context-menu" });
    }
  }

  if (info.menuItemId === "batch-download-motrix") {
    const text = info.selectionText || "";
    const urls = extractUrls(text);

    if (urls.length === 0) {
      notify("批量下载", "选中文本中未找到有效链接", true);
      return;
    }

    const { success, failed } = await batchSendUrls(urls, rpcConfig, "batch-download");
    notify("批量下载完成", `成功 ${success} 个，失败 ${failed} 个`);
    updateBadge();
  }
});

/**
 * 从文本中提取所有 URL
 */
function extractUrls(text) {
  const urlPattern = /https?:\/\/[^\s<>"'`{}\[\]|\\^]+/g;
  const matches = text.match(urlPattern) || [];
  const seen = new Set();
  const urls = [];
  for (let raw of matches) {
    raw = raw.replace(/[.,;:!?]+$/, "");
    try {
      new URL(raw);
      if (!seen.has(raw)) {
        seen.add(raw);
        urls.push(raw);
      }
    } catch {}
  }
  return urls;
}

// ---------- 自动拦截下载 ----------
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const config = await getConfig();

  if (!config.autoIntercept) return;

  const url = downloadItem.url;

  if (!url.startsWith("http://") && !url.startsWith("https://")) return;

  if (downloadItem.totalBytes > 0) {
    const mb = sizeInMB(downloadItem.totalBytes);
    if (mb < config.interceptMinSize) return;
  }

  if (!matchExtension(url, config.interceptExtensions)) return;

  const rpcConfig = await getActiveRpc();

  try {
    const taskId = await sendToMotrix(url, rpcConfig);
    try { await chrome.downloads.cancel(downloadItem.id); } catch (_) {}
    try { await chrome.downloads.erase({ id: downloadItem.id }); } catch (_) {}
    notify("已拦截并发送到 Motrix", downloadItem.filename || url);
    await addToHistory({
      url,
      filename: downloadItem.filename,
      fileSize: downloadItem.totalBytes,
      gid: taskId,
      status: "intercepted",
      source: "auto-intercept"
    });
    updateBadge();
    console.log(`拦截下载 → Motrix 任务 ID: ${taskId}`, url);
  } catch (err) {
    console.error("自动拦截失败，浏览器将继续下载:", err);
    await addToHistory({
      url,
      filename: downloadItem.filename,
      fileSize: downloadItem.totalBytes,
      status: "intercept-failed",
      error: err.message,
      source: "auto-intercept"
    });
  }
});

// ---------- 快捷键处理 ----------
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-intercept") {
    const config = await getConfig();
    config.autoIntercept = !config.autoIntercept;
    await chrome.storage.local.set({ config });

    notify(
      "Send to Motrix",
      config.autoIntercept ? "自动拦截已开启" : "自动拦截已关闭"
    );
  }
});

// ---------- 保持服务工作线程活跃 ----------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    updateBadge();
    checkCompletedTasks();
    if (!badgeTimer) startBadgeTimer();
  }
});

// ---------- 监听来自 popup 的消息 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.action !== "string") {
    sendResponse({ error: "Invalid message" });
    return;
  }
  (async () => {
    try {
      const rpcConfig = await getActiveRpc();

      switch (msg.action) {
        case "getTasks": {
          const [active, waiting, stopped] = await Promise.all([
            getActiveTasks(rpcConfig).catch(() => []),
            getWaitingTasks(rpcConfig).catch(() => []),
            getStoppedTasks(rpcConfig).catch(() => [])
          ]);
          sendResponse({ active, waiting, stopped });
          break;
        }
        case "getHistory": {
          const history = await getHistory();
          sendResponse({ history });
          break;
        }
        case "clearHistory": {
          await clearHistory();
          sendResponse({ ok: true });
          break;
        }
        case "pauseTask": {
          await pauseTask(msg.gid, rpcConfig);
          sendResponse({ ok: true });
          break;
        }
        case "resumeTask": {
          await resumeTask(msg.gid, rpcConfig);
          sendResponse({ ok: true });
          break;
        }
        case "removeTask": {
          await removeTask(msg.gid, rpcConfig);
          sendResponse({ ok: true });
          break;
        }
        case "forceRemoveTask": {
          await forceRemoveTask(msg.gid, rpcConfig);
          sendResponse({ ok: true });
          break;
        }
        case "testConnection": {
          // 支持测试指定 profile 或当前活跃 profile
          let testRpc = rpcConfig;
          if (msg.profile) {
            testRpc = { rpcUrl: msg.profile.url, rpcSecret: msg.profile.secret };
          }
          const result = await getVersion(testRpc);
          sendResponse({ ok: true, version: result.version });
          break;
        }
        case "sendUrl": {
          // 单个 URL 发送（popup 中手动输入）
          const taskId = await sendToMotrix(msg.url, rpcConfig);
          await addToHistory({ url: msg.url, gid: taskId, status: "sent", source: "manual" });
          updateBadge();
          sendResponse({ ok: true, gid: taskId });
          break;
        }
        case "batchSend": {
          const urls = msg.urls || [];
          const result = await batchSendUrls(urls, rpcConfig, "batch");
          updateBadge();
          sendResponse({ ok: true, ...result });
          break;
        }
        case "setSpeedLimit": {
          await setGlobalSpeedLimit(msg.bytesPerSec, rpcConfig);
          // 同步保存到配置
          const cfg = await getConfig();
          cfg.globalSpeedLimit = msg.bytesPerSec;
          await chrome.storage.local.set({ config: cfg });
          sendResponse({ ok: true });
          break;
        }
        case "getGlobalSpeedLimit": {
          try {
            const options = await rpcCall("aria2.getGlobalOption", [], rpcConfig);
            sendResponse({ ok: true, limit: options["max-overall-download-limit"] || "0" });
          } catch (err) {
            sendResponse({ ok: false, error: err.message });
          }
          break;
        }
        case "exportConfig": {
          const cfg = await getConfig();
          sendResponse({ ok: true, config: cfg });
          break;
        }
        case "importConfig": {
          const imported = msg.config;
          if (!imported || typeof imported !== "object") {
            sendResponse({ ok: false, error: "无效的配置数据" });
            break;
          }
          // 合并配置，保留默认值作为 fallback
          const merged = { ...DEFAULT_CONFIG, ...imported };
          await chrome.storage.local.set({ config: merged });
          sendResponse({ ok: true });
          break;
        }
        case "getServerProfiles": {
          const cfg = await getConfig();
          sendResponse({
            ok: true,
            profiles: cfg.serverProfiles,
            activeIndex: cfg.activeProfileIndex
          });
          break;
        }
        case "switchProfile": {
          const cfg = await getConfig();
          if (msg.index >= 0 && msg.index < cfg.serverProfiles.length) {
            cfg.activeProfileIndex = msg.index;
            await chrome.storage.local.set({ config: cfg });
            // 测试新连接
            const profile = cfg.serverProfiles[msg.index];
            try {
              const result = await getVersion({ rpcUrl: profile.url, rpcSecret: profile.secret });
              sendResponse({ ok: true, version: result.version });
            } catch (err) {
              sendResponse({ ok: false, error: err.message });
            }
          } else {
            sendResponse({ ok: false, error: "无效的配置索引" });
          }
          break;
        }
        default:
          sendResponse({ error: "Unknown action" });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true;
});

// ---------- 监听配置变更 ----------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) {
    console.log("[Send to Motrix] 配置已更新");
    // 配置变更时刷新角标
    updateBadge();
  }
});

// ---------- 启动 ----------
startBadgeTimer();
