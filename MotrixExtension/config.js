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
  ]
};
