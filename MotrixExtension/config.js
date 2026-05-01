// ============================================================
// Send to Motrix - 共享配置
// background.js 和 popup.js 共用，避免重复定义
// ============================================================

const DEFAULT_CONFIG = {
  rpcUrl: "http://127.0.0.1:16800/jsonrpc",
  rpcSecret: "",
  autoIntercept: false,
  interceptMinSize: 1,
  interceptExtensions: [
    "zip", "rar", "7z", "tar", "gz", "bz2", "xz",
    "iso", "img", "dmg",
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm",
    "mp3", "flac", "wav", "aac", "ogg", "wma",
    "exe", "msi", "deb", "rpm", "pkg", "appimage",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "apk", "ipa"
  ],

  // v2.0 新增：多服务器配置
  serverProfiles: [
    { name: "本地 Motrix", url: "http://127.0.0.1:16800/jsonrpc", secret: "" }
  ],
  activeProfileIndex: 0,

  // v2.0 新增：全局速度限制（字节/秒，0 = 不限）
  globalSpeedLimit: 0,

  // v2.0 新增：下载完成通知
  downloadCompleteNotify: true
};
