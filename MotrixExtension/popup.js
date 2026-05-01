// ============================================================
// Send to Motrix - Popup UI Logic v2.0
// 标签页：设置 / 任务 / 批量 / 历史
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

  if (taskRefreshTimer) {
    clearInterval(taskRefreshTimer);
    taskRefreshTimer = null;
  }

  if (name === "tasks") {
    refreshTasks();
    taskRefreshTimer = setInterval(refreshTasks, 3000);
  }
  if (name === "history") refreshHistory();
}

$$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.panel)));

// ══════════════════════════════════════════
//  MESSAGE HELPER
// ══════════════════════════════════════════
function sendMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
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
//  SERVER PROFILES
// ══════════════════════════════════════════
let serverProfiles = [];
let activeProfileIndex = 0;

async function loadProfiles() {
  const resp = await sendMsg({ action: "getServerProfiles" });
  if (resp.ok) {
    serverProfiles = resp.profiles;
    activeProfileIndex = resp.activeIndex;
  }
  renderProfiles();
}

function renderProfiles() {
  const box = $("#profileList");
  if (serverProfiles.length === 0) {
    box.innerHTML = `<div class="empty" style="padding:16px"><div class="msg">暂无服务器配置</div></div>`;
    return;
  }

  box.innerHTML = serverProfiles.map((p, i) => {
    const isActive = i === activeProfileIndex;
    return `
      <div class="profile-card ${isActive ? "active" : ""}" data-index="${i}">
        <span class="profile-dot"></span>
        <div class="profile-info">
          <div class="profile-name">${esc(p.name)}</div>
          <div class="profile-url">${esc(p.url)}</div>
        </div>
        <div class="profile-actions">
          ${!isActive ? `<button class="delete" data-delete="${i}" title="删除">🗑</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  // 点击切换
  box.querySelectorAll(".profile-card").forEach(card => {
    card.addEventListener("click", async (e) => {
      if (e.target.closest(".delete")) return;
      const idx = parseInt(card.dataset.index);
      if (idx === activeProfileIndex) return;

      const resp = await sendMsg({ action: "switchProfile", index: idx });
      if (resp.ok) {
        activeProfileIndex = idx;
        renderProfiles();
        loadConfig(); // 刷新输入框
        testConnection();
        showToast("✅ 已切换到: " + serverProfiles[idx].name);
      } else {
        showToast("❌ 切换失败: " + (resp.error || "未知错误"));
      }
    });
  });

  // 删除
  box.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.delete);
      serverProfiles.splice(idx, 1);
      if (activeProfileIndex >= serverProfiles.length) {
        activeProfileIndex = Math.max(0, serverProfiles.length - 1);
      }
      await saveProfiles();
      renderProfiles();
      showToast("已删除服务器配置");
    });
  });
}

async function saveProfiles() {
  const cfg = { ...currentConfig, serverProfiles, activeProfileIndex };
  await chrome.storage.local.set({ config: cfg });
  currentConfig = cfg;
}

async function addProfile() {
  const name = prompt("服务器名称:", "远程 Aria2");
  if (!name) return;
  const url = prompt("RPC 地址:", "http://192.168.1.100:6800/jsonrpc");
  if (!url) return;
  const secret = prompt("RPC Secret (可留空):", "") || "";

  serverProfiles.push({ name, url, secret });
  await saveProfiles();
  renderProfiles();
  showToast("✅ 已添加: " + name);
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

  // 从当前活跃 profile 获取 RPC 信息
  const idx = Math.min(currentConfig.activeProfileIndex || 0, (currentConfig.serverProfiles || []).length - 1);
  const profile = (currentConfig.serverProfiles || [])[idx] || {};

  $("#rpcUrl").value = profile.url || currentConfig.rpcUrl;
  $("#rpcSecret").value = profile.secret || currentConfig.rpcSecret;
  $("#autoIntercept").checked = currentConfig.autoIntercept;
  $("#downloadCompleteNotify").checked = currentConfig.downloadCompleteNotify !== false;
  $("#minSize").value = currentConfig.interceptMinSize;
  renderExtTags(currentConfig.interceptExtensions);

  // 速度限制预设
  renderSpeedPresets(currentConfig.globalSpeedLimit || 0);
}

function renderSpeedPresets(current) {
  $$(".speed-preset").forEach(btn => {
    const speed = parseInt(btn.dataset.speed);
    btn.classList.toggle("active", speed === current);
  });
}

async function saveConfig() {
  const rpcUrl = $("#rpcUrl").value.trim() || DEFAULT_CONFIG.rpcUrl;
  try { new URL(rpcUrl); } catch {
    showToast("❌ RPC 地址格式不正确");
    return;
  }

  // 更新当前活跃 profile 的 RPC 信息
  const idx = Math.min(currentConfig.activeProfileIndex || 0, (currentConfig.serverProfiles || []).length - 1);
  if (currentConfig.serverProfiles && currentConfig.serverProfiles[idx]) {
    currentConfig.serverProfiles[idx].url = rpcUrl;
    currentConfig.serverProfiles[idx].secret = $("#rpcSecret").value.trim();
  }

  currentConfig.rpcUrl = rpcUrl;
  currentConfig.rpcSecret = $("#rpcSecret").value.trim();
  currentConfig.autoIntercept = $("#autoIntercept").checked;
  currentConfig.downloadCompleteNotify = $("#downloadCompleteNotify").checked;

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
  await loadProfiles();
  showToast("已恢复默认设置");
  testConnection();
}

function addExtension() {
  const ext = $("#newExt").value.trim().toLowerCase().replace(/^\./, "");
  if (!ext) { showToast("❌ 请输入文件后缀"); return; }
  if (!/^[a-z0-9_]+$/.test(ext)) { showToast("❌ 后缀格式不正确"); return; }
  if (currentConfig.interceptExtensions.includes(ext)) { showToast("❌ 该后缀已存在"); return; }
  if (currentConfig.interceptExtensions.length >= 50) { showToast("❌ 最多添加 50 个后缀"); return; }
  currentConfig.interceptExtensions.push(ext);
  renderExtTags(currentConfig.interceptExtensions);
  $("#newExt").value = "";
  showToast("✅ 已添加后缀: " + ext);
}

// ── Test connection ──
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
//  SPEED LIMIT
// ══════════════════════════════════════════
async function setSpeedLimit(bytesPerSec) {
  const resp = await sendMsg({ action: "setSpeedLimit", bytesPerSec });
  if (resp.ok) {
    currentConfig.globalSpeedLimit = bytesPerSec;
    renderSpeedPresets(bytesPerSec);
    showToast(bytesPerSec > 0 ? `限速: ${formatSpeed(bytesPerSec)}` : "已取消限速");
  } else {
    showToast("❌ 设置失败: " + (resp.error || "未知错误"));
  }
}

// ══════════════════════════════════════════
//  TASKS
// ══════════════════════════════════════════
let tasksConnected = false;

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
  waiting.forEach(t => {
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

  let name = "";
  if (t.files && t.files[0]) {
    if (t.files[0].path) name = t.files[0].path.split("/").pop();
    if (!name && t.files[0].uris && t.files[0].uris[0]) {
      name = truncateUrl(t.files[0].uris[0].uri || "");
    }
  }
  name = name || "未知文件";

  const statusLabels = {
    active: "下载中", waiting: "等待中", paused: "已暂停",
    complete: "已完成", error: "失败", removed: "已删除"
  };

  let actions = "";
  if (status === "active") {
    actions = `
      <button data-action="pause" data-gid="${esc(t.gid)}">⏸ 暂停</button>
      <button data-action="remove" data-gid="${esc(t.gid)}" class="danger">✕ 移除</button>
    `;
  } else if (status === "waiting") {
    actions = `<button data-action="remove" data-gid="${esc(t.gid)}" class="danger">✕ 移除</button>`;
  } else if (status === "paused") {
    actions = `
      <button data-action="resume" data-gid="${esc(t.gid)}">▶ 继续</button>
      <button data-action="remove" data-gid="${esc(t.gid)}" class="danger">✕ 移除</button>
    `;
  } else if (status === "error" || status === "removed" || status === "complete") {
    actions = `<button data-action="forceRemove" data-gid="${esc(t.gid)}" class="danger">✕ 清除</button>`;
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
//  BATCH DOWNLOAD
// ══════════════════════════════════════════
async function batchSend() {
  const text = $("#batchUrls").value.trim();
  if (!text) {
    showToast("❌ 请输入链接");
    return;
  }

  // 解析 URL：按行、空格、逗号分割，过滤有效 HTTP(S) 链接
  const raw = text.split(/[\n\r\s,;]+/).map(s => s.trim()).filter(Boolean);
  const urls = raw.filter(u => /^https?:\/\//i.test(u));

  if (urls.length === 0) {
    showToast("❌ 未找到有效链接");
    return;
  }

  const resultBox = $("#batchResult");
  resultBox.className = "batch-result show";
  resultBox.style.background = "var(--amber-dim)";
  resultBox.style.color = "var(--amber)";
  resultBox.textContent = `正在发送 ${urls.length} 个链接…`;

  const resp = await sendMsg({ action: "batchSend", urls });

  if (resp.ok) {
    resultBox.className = "batch-result show ok";
    resultBox.textContent = `✅ 成功 ${resp.success} 个` + (resp.failed > 0 ? `，失败 ${resp.failed} 个` : "");
    showToast(`批量完成: ${resp.success} 成功`);
  } else {
    resultBox.className = "batch-result show err";
    resultBox.textContent = "❌ " + (resp.error || "发送失败");
  }
}

function clearBatch() {
  $("#batchUrls").value = "";
  const resultBox = $("#batchResult");
  resultBox.className = "batch-result";
  resultBox.textContent = "";
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
    const sourceLabel = {
      "context-menu": "右键发送",
      "auto-intercept": "自动拦截",
      "batch-download": "批量下载",
      "batch": "批量下载",
      "manual": "手动输入"
    };
    const statusLabel = {
      "sent": "已发送",
      "intercepted": "已拦截",
      "failed": "发送失败",
      "intercept-failed": "拦截失败"
    };
    const detail = (sourceLabel[h.source] || h.source) + " · " + (statusLabel[h.status] || h.status);

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
//  EXPORT / IMPORT
// ══════════════════════════════════════════
async function exportConfig() {
  const resp = await sendMsg({ action: "exportConfig" });
  if (!resp.ok) {
    showToast("❌ 导出失败");
    return;
  }

  const blob = new Blob([JSON.stringify(resp.config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "motrix-link-config-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("✅ 配置已导出");
}

function triggerImport() {
  $("#importFile").click();
}

async function importConfig(file) {
  try {
    const text = await file.text();
    const config = JSON.parse(text);
    const resp = await sendMsg({ action: "importConfig", config });
    if (resp.ok) {
      showToast("✅ 配置已导入");
      await loadConfig();
      await loadProfiles();
      testConnection();
    } else {
      showToast("❌ " + (resp.error || "导入失败"));
    }
  } catch (err) {
    showToast("❌ 文件格式错误");
  }
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
$("#btnAddProfile").addEventListener("click", addProfile);
$("#btnBatchSend").addEventListener("click", batchSend);
$("#btnBatchClear").addEventListener("click", clearBatch);
$("#btnExport").addEventListener("click", exportConfig);
$("#btnImport").addEventListener("click", triggerImport);
$("#importFile").addEventListener("change", (e) => {
  if (e.target.files[0]) importConfig(e.target.files[0]);
  e.target.value = "";
});

// 速度限制预设
$$(".speed-preset").forEach(btn => {
  btn.addEventListener("click", () => {
    setSpeedLimit(parseInt(btn.dataset.speed));
  });
});

// popup 关闭时清理定时器
window.addEventListener("unload", () => {
  if (taskRefreshTimer) clearInterval(taskRefreshTimer);
});

// 启动
loadConfig().then(() => {
  loadProfiles();
  testConnection();
});
