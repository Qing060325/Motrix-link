// ============================================================
// Send to Motrix - Popup UI Logic
// ============================================================

// ── DOM helpers ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Toast ──
function showToast(msg, ms = 1800) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), ms);
}

// ── HTML 转义（防 XSS） ──
function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ── Format helpers ──
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "—";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + " " + u[i];
}

function formatSpeed(bps) {
  if (!bps || bps <= 0) return "—";
  return formatBytes(bps) + "/s";
}

function formatTime(sec) {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m " + (sec % 60) + "s";
  return Math.floor(sec / 3600) + "h " + Math.floor((sec % 3600) / 60) + "m";
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    const name = u.pathname.split("/").pop() || u.hostname;
    return decodeURIComponent(name);
  } catch {
    return url.slice(0, 40);
  }
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return "刚刚";
  if (d < 3600000) return Math.floor(d / 60000) + " 分钟前";
  if (d < 86400000) return Math.floor(d / 3600000) + " 小时前";
  return Math.floor(d / 86400000) + " 天前";
}

// ══════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════
let currentTab = "settings";
let taskRefreshTimer = null;

function switchTab(name) {
  currentTab = name;
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.panel === name));
  $$(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + name));

  // 清除任务自动刷新
  if (taskRefreshTimer) {
    clearInterval(taskRefreshTimer);
    taskRefreshTimer = null;
  }

  if (name === "tasks") {
    refreshTasks();
    // 每 3 秒自动刷新任务列表
    taskRefreshTimer = setInterval(refreshTasks, 3000);
  }
  if (name === "history") refreshHistory();
}

$$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.panel)));

// ══════════════════════════════════════════
//  MESSAGE HELPER
// ══════════════════════════════════════════
/**
 * 发送消息到 background service worker
 * @param {Object} msg - 消息对象
 * @returns {Promise<Object>} - 响应对象
 */
function sendMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      // 检查是否有运行时错误
      if (chrome.runtime.lastError) {
        console.error("Message error:", chrome.runtime.lastError);
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(resp || {});
      }
    });
  });
}

// ══════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════
let currentConfig = { ...DEFAULT_CONFIG };

function renderExtTags(exts) {
  const box = $("#extTags");
  box.innerHTML = "";
  exts.forEach(ext => {
    const tag = document.createElement("span");
    tag.className = "ext-tag";
    tag.innerHTML = `${esc(ext)}<span class="remove" data-ext="${esc(ext)}">×</span>`;
    box.appendChild(tag);
  });
  box.querySelectorAll(".remove").forEach(btn => {
    btn.addEventListener("click", () => {
      currentConfig.interceptExtensions = currentConfig.interceptExtensions.filter(e => e !== btn.dataset.ext);
      renderExtTags(currentConfig.interceptExtensions);
    });
  });
}

async function loadConfig() {
  const stored = await chrome.storage.local.get("config");
  currentConfig = { ...DEFAULT_CONFIG, ...(stored.config || {}) };

  $("#rpcUrl").value = currentConfig.rpcUrl;
  $("#rpcSecret").value = currentConfig.rpcSecret;
  $("#autoIntercept").checked = currentConfig.autoIntercept;
  $("#minSize").value = currentConfig.interceptMinSize;
  renderExtTags(currentConfig.interceptExtensions);
}

/**
 * 保存配置
 */
async function saveConfig() {
  // 验证 RPC URL
  const rpcUrl = $("#rpcUrl").value.trim() || DEFAULT_CONFIG.rpcUrl;
  try {
    new URL(rpcUrl);
  } catch (err) {
    showToast("❌ RPC 地址格式不正确");
    return;
  }

  currentConfig.rpcUrl = rpcUrl;
  currentConfig.rpcSecret = $("#rpcSecret").value.trim();
  currentConfig.autoIntercept = $("#autoIntercept").checked;
  
  // 验证最小文件大小
  const minSize = parseFloat($("#minSize").value);
  if (isNaN(minSize) || minSize < 0) {
    showToast("❌ 最小文件大小必须为正数");
    return;
  }
  currentConfig.interceptMinSize = minSize || DEFAULT_CONFIG.interceptMinSize;

  await chrome.storage.local.set({ config: currentConfig });
  showToast("✅ 设置已保存");
  testConnection();
}

async function resetConfig() {
  currentConfig = { ...DEFAULT_CONFIG };
  await chrome.storage.local.set({ config: currentConfig });
  await loadConfig();
  showToast("已恢复默认设置");
  testConnection();
}

/**
 * 添加文件后缀
 */
function addExtension() {
  const ext = $("#newExt").value.trim().toLowerCase().replace(/^\./, "");
  if (!ext) {
    showToast("❌ 请输入文件后缀");
    return;
  }
  // 验证后缀格式（只允许字母、数字、下划线）
  if (!/^[a-z0-9_]+$/.test(ext)) {
    showToast("❌ 后缀格式不正确");
    return;
  }
  if (currentConfig.interceptExtensions.includes(ext)) {
    showToast("❌ 该后缀已存在");
    return;
  }
  if (currentConfig.interceptExtensions.length >= 50) {
    showToast("❌ 最多添加 50 个后缀");
    return;
  }
  currentConfig.interceptExtensions.push(ext);
  renderExtTags(currentConfig.interceptExtensions);
  $("#newExt").value = "";
  showToast("✅ 已添加后缀: " + ext);
}

// ── Test connection ──
/**
 * 测试与 Aria2/Motrix 的连接
 */
async function testConnection() {
  const bar = $("#statusBar");
  const text = $("#statusText");
  bar.className = "status-bar pending";
  text.textContent = "连接中…";

  try {
    const resp = await sendMsg({ action: "testConnection" });

    if (resp.ok) {
      bar.className = "status-bar ok";
      text.textContent = `已连接 — Aria2 v${resp.version}`;
    } else {
      bar.className = "status-bar err";
      text.textContent = resp.error || "连接失败";
    }
  } catch (err) {
    bar.className = "status-bar err";
    text.textContent = "连接异常: " + err.message;
  }
}

// ══════════════════════════════════════════
//  TASKS
// ══════════════════════════════════════════
let tasksConnected = false;

/**
 * 刷新任务列表
 * 注意: aria2 的 waiting 列表可能包含暂停的任务，需要根据 status 字段判断
 *
 * 任务状态说明:
 * - active: 正在下载
 * - waiting: 等待中（未开始）
 * - paused: 已暂停（可能在 waiting 列表中）
 * - complete: 已完成
 * - error: 下载失败
 * - removed: 已删除
 */
async function refreshTasks() {
  const bar = $("#taskStatusBar");
  const text = $("#taskStatusText");
  const list = $("#taskList");

  bar.className = "status-bar pending";
  text.textContent = "正在获取任务…";

  const resp = await sendMsg({ action: "getTasks" });

  if (resp.error) {
    bar.className = "status-bar err";
    text.textContent = resp.error;
    list.innerHTML = `<div class="empty"><div class="icon">⚠️</div><div class="msg">${esc(resp.error)}</div></div>`;
    tasksConnected = false;
    return;
  }

  tasksConnected = true;
  const active = resp.active || [];
  const waiting = resp.waiting || [];
  const stopped = resp.stopped || [];
  const total = active.length + waiting.length + stopped.length;

  bar.className = "status-bar ok";
  text.textContent = `运行中 ${active.length} · 等待 ${waiting.length} · 已结束 ${stopped.length}`;

  if (total === 0) {
    list.innerHTML = `<div class="empty"><div class="icon">📭</div><div class="msg">暂无任务</div></div>`;
    return;
  }

  let html = "";
  active.forEach(t => { html += renderTask(t, "active"); });
  // 处理 waiting 列表中的暂停任务
  waiting.forEach(t => {
    // aria2 中暂停的任务 status 为 "paused"，即使在 waiting 列表中
    const status = t.status === "paused" ? "paused" : "waiting";
    html += renderTask(t, status);
  });
  stopped.forEach(t => {
    let status = "complete";
    if (t.status === "error") status = "error";
    else if (t.status === "removed") status = "removed";
    html += renderTask(t, status);
  });

  list.innerHTML = html;

  // 绑定操作按钮
  list.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const gid = btn.dataset.gid;
      const actionMap = {
        pause: "pauseTask",
        resume: "resumeTask",
        remove: "removeTask",
        forceRemove: "forceRemoveTask"
      };
      const msgAction = actionMap[action];
      if (!msgAction) return;

      btn.disabled = true;
      const r = await sendMsg({ action: msgAction, gid });
      if (r.error) {
        showToast("操作失败: " + r.error);
      } else {
        showToast("✅ 已执行");
        setTimeout(refreshTasks, 300);
      }
    });
  });
}

function renderTask(t, status) {
  const total = parseInt(t.totalLength) || 0;
  const completed = parseInt(t.completedLength) || 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const speed = parseInt(t.downloadSpeed) || 0;

  // 安全提取文件名
  let name = "";
  if (t.files && t.files[0]) {
    if (t.files[0].path) {
      name = t.files[0].path.split("/").pop();
    }
    if (!name && t.files[0].uris && t.files[0].uris[0]) {
      name = truncateUrl(t.files[0].uris[0].uri || "");
    }
  }
  name = name || "未知文件";

  const statusLabels = {
    active: "下载中",
    waiting: "等待中",
    paused: "已暂停",
    complete: "已完成",
    error: "失败",
    removed: "已删除"
  };

  let actions = "";
  if (status === "active") {
    actions = `
      <button data-action="pause" data-gid="${esc(t.gid)}">⏸ 暂停</button>
      <button data-action="remove" data-gid="${esc(t.gid)}" class="danger">✕ 移除</button>
    `;
  } else if (status === "waiting") {
    actions = `
      <button data-action="remove" data-gid="${esc(t.gid)}" class="danger">✕ 移除</button>
    `;
  } else if (status === "paused") {
    actions = `
      <button data-action="resume" data-gid="${esc(t.gid)}">▶ 继续</button>
      <button data-action="remove" data-gid="${esc(t.gid)}" class="danger">✕ 移除</button>
    `;
  } else if (status === "error" || status === "removed" || status === "complete") {
    actions = `
      <button data-action="forceRemove" data-gid="${esc(t.gid)}" class="danger">✕ 清除</button>
    `;
  }

  return `
    <div class="task-item">
      <div class="task-top">
        <span class="task-name" title="${esc(name)}">${esc(name)}</span>
        <span class="task-status ${status}">${statusLabels[status] || status}</span>
      </div>
      <div class="task-progress">
        <div class="task-progress-bar" style="width: ${percent}%"></div>
      </div>
      <div class="task-meta">
        <span>${formatBytes(completed)} / ${formatBytes(total)} (${percent}%)</span>
        <span>${status === "active" ? formatSpeed(speed) + " · 剩余 " + formatTime(t.eta) : ""}</span>
      </div>
      <div class="task-actions">${actions}</div>
    </div>
  `;
}

// ══════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════
async function refreshHistory() {
  const box = $("#historyList");
  const resp = await sendMsg({ action: "getHistory" });
  const items = resp.history || [];

  if (items.length === 0) {
    box.innerHTML = `<div class="empty"><div class="icon">📋</div><div class="msg">暂无历史记录</div></div>`;
    return;
  }

  box.innerHTML = items.map(h => {
    const isOk = h.status === "sent" || h.status === "intercepted";
    const name = h.filename || truncateUrl(h.url || "");
    const detail = h.status === "intercepted" ? "自动拦截"
      : h.status === "sent" ? "右键发送"
      : h.status === "failed" ? "发送失败"
      : h.status === "intercept-failed" ? "拦截失败"
      : h.status;

    return `
      <div class="history-item">
        <div class="history-icon ${isOk ? "ok" : "fail"}">${isOk ? "✓" : "✕"}</div>
        <div class="history-info">
          <div class="history-name" title="${esc(name)}">${esc(name)}</div>
          <div class="history-detail">${esc(detail)} · ${timeAgo(h.time)}</div>
        </div>
      </div>
    `;
  }).join("");
}

async function clearHistory() {
  await sendMsg({ action: "clearHistory" });
  refreshHistory();
  showToast("历史已清空");
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
$("#btnTest").addEventListener("click", testConnection);
$("#btnSave").addEventListener("click", saveConfig);
$("#btnReset").addEventListener("click", resetConfig);
$("#btnAddExt").addEventListener("click", addExtension);
$("#newExt").addEventListener("keydown", e => { if (e.key === "Enter") addExtension(); });
$("#btnRefresh").addEventListener("click", refreshTasks);
$("#btnClearHistory").addEventListener("click", clearHistory);

// popup 关闭时清理定时器
window.addEventListener("unload", () => {
  if (taskRefreshTimer) clearInterval(taskRefreshTimer);
});

loadConfig().then(() => testConnection());
