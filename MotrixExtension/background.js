// ============================================================
// Send to Motrix - Background Service Worker
// 功能：右键菜单 + 自动拦截浏览器下载 + 任务管理
// ============================================================

importScripts("config.js");

// ---------- 常量 ----------
const RPC_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const TASK_HISTORY_MAX = 50;

// ---------- 工具函数 ----------
async function getConfig() {
  const stored = await chrome.storage.local.get("config");
  return { ...DEFAULT_CONFIG, ...(stored.config || {}) };
}

/**
 * 从 URL 中提取文件扩展名（忽略 query/hash）
 * @param {string} url - 文件 URL
 * @returns {string} - 扩展名（不含点）
 */
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

/**
 * 检查文件扩展名是否匹配拦截列表
 * @param {string} url - 文件 URL
 * @param {Array<string>} extensions - 拦截扩展名列表
 * @returns {boolean} - 是否匹配
 */
function matchExtension(url, extensions) {
  if (!extensions || extensions.length === 0) return true;
  const ext = getExtension(url);
  return ext ? extensions.includes(ext) : false;
}

/**
 * 将字节转换为 MB
 * @param {number} bytes - 字节数
 * @returns {number} - MB 数值
 */
function sizeInMB(bytes) {
  return bytes / (1024 * 1024);
}

/**
 * 格式化字节大小
 * @param {number} bytes - 字节数
 * @returns {string} - 格式化后的字符串（如 "1.5 MB"）
 */
function formatBytes(bytes) {
  if (bytes <= 0) return "未知";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + " " + units[i];
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "—";
  return formatBytes(bytesPerSec) + "/s";
}

/**
 * 简单 HTML 转义，防止 XSS
 */
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- 任务历史 ----------
async function addToHistory(entry) {
  const { taskHistory = [] } = await chrome.storage.local.get("taskHistory");
  taskHistory.unshift({
    ...entry,
    time: Date.now()
  });
  await chrome.storage.local.set({
    taskHistory: taskHistory.slice(0, TASK_HISTORY_MAX)
  });
}

async function getHistory() {
  const { taskHistory = [] } = await chrome.storage.local.get("taskHistory");
  return taskHistory;
}

async function clearHistory() {
  await chrome.storage.local.set({ taskHistory: [] });
}

// ---------- Motrix RPC 调用（带重试） ----------
async function rpcCall(method, params = [], config) {
  config = config || await getConfig();

  const payload = {
    jsonrpc: "2.0",
    id: "motrix-ext-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    method,
    params: config.rpcSecret
      ? ["token:" + config.rpcSecret, ...params]
      : params
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

      const response = await fetch(config.rpcUrl, {
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

async function sendToMotrix(url, config) {
  return rpcCall("aria2.addUri", [[url], {}], config);
}

async function getActiveTasks(config) {
  return rpcCall("aria2.tellActive", [], config);
}

async function getWaitingTasks(config) {
  return rpcCall("aria2.tellWaiting", [0, 50], config);
}

async function getStoppedTasks(config) {
  return rpcCall("aria2.tellStopped", [0, 20], config);
}

async function pauseTask(gid, config) {
  return rpcCall("aria2.pause", [gid], config);
}

async function resumeTask(gid, config) {
  return rpcCall("aria2.unpause", [gid], config);
}

async function removeTask(gid, config) {
  return rpcCall("aria2.remove", [gid], config);
}

async function forceRemoveTask(gid, config) {
  return rpcCall("aria2.forceRemove", [gid], config);
}

async function getVersion(config) {
  return rpcCall("aria2.getVersion", [], config);
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

// ---------- 右键菜单 ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "download-with-motrix",
    title: "使用 Motrix 下载",
    contexts: ["link", "image", "video", "audio"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "download-with-motrix") return;

  const url = info.linkUrl || info.srcUrl;
  if (!url) return;

  const config = await getConfig();

  try {
    const taskId = await sendToMotrix(url, config);
    notify("已发送到 Motrix", `任务 ID: ${taskId}`);
    await addToHistory({
      url,
      gid: taskId,
      status: "sent",
      source: "context-menu"
    });
  } catch (err) {
    console.error("发送失败:", err);
    notify("发送失败", err.message, true);
    await addToHistory({
      url,
      status: "failed",
      error: err.message,
      source: "context-menu"
    });
  }
});

// ---------- 自动拦截下载 ----------
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const config = await getConfig();

  if (!config.autoIntercept) return;

  const url = downloadItem.url;

  // 跳过非 http(s) URL（data:、blob:、filesystem: 等不拦截）
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;

  // 文件大小过滤（totalBytes 可能为 -1 表示未知）
  if (downloadItem.totalBytes > 0) {
    const mb = sizeInMB(downloadItem.totalBytes);
    if (mb < config.interceptMinSize) return;
  }

  // 文件后缀过滤
  if (!matchExtension(url, config.interceptExtensions)) return;

  // 发送到 Motrix
  try {
    const taskId = await sendToMotrix(url, config);
    // 取消浏览器原生下载
    try {
      await chrome.downloads.cancel(downloadItem.id);
    } catch (_) {
      // 下载可能已完成或不存在，忽略
    }
    try {
      await chrome.downloads.erase(downloadItem.id);
    } catch (_) {}
    notify("已拦截并发送到 Motrix", downloadItem.filename || url);
    await addToHistory({
      url,
      filename: downloadItem.filename,
      fileSize: downloadItem.totalBytes,
      gid: taskId,
      status: "intercepted",
      source: "auto-intercept"
    });
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

// ---------- 监听来自 popup 的消息 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case "getTasks": {
          const config = await getConfig();
          const [active, waiting, stopped] = await Promise.all([
            getActiveTasks(config).catch(() => []),
            getWaitingTasks(config).catch(() => []),
            getStoppedTasks(config).catch(() => [])
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
          await pauseTask(msg.gid);
          sendResponse({ ok: true });
          break;
        }
        case "resumeTask": {
          await resumeTask(msg.gid);
          sendResponse({ ok: true });
          break;
        }
        case "removeTask": {
          await removeTask(msg.gid);
          sendResponse({ ok: true });
          break;
        }
        case "forceRemoveTask": {
          await forceRemoveTask(msg.gid);
          sendResponse({ ok: true });
          break;
        }
        case "testConnection": {
          const config = await getConfig();
          const result = await getVersion(config);
          sendResponse({ ok: true, version: result.version });
          break;
        }
        default:
          sendResponse({ error: "Unknown action" });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true; // 保持 sendResponse 异步
});

// ---------- 监听配置变更 ----------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) {
    console.log("[Send to Motrix] 配置已更新");
  }
});
