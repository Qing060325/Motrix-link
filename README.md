# ⚡ Send to Motrix

**一键发送下载链接到 Motrix，支持自动拦截浏览器下载**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=google-chrome)](https://github.com/Qing060325/Motrix-link)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![Aria2 RPC](https://img.shields.io/badge/Aria2-RPC-orange)](https://aria2.github.io/)

---

## ✨ 功能特性

- **🖱️ 右键下载** — 在任意链接/图片/视频上右键，选择「使用 Motrix 下载」
- **🔄 自动拦截** — 开启后自动拦截浏览器下载请求，转发到 Motrix（可配置最小文件大小和文件后缀）
- **📋 任务管理** — 在扩展内查看下载进度、暂停/继续/移除任务
- **📜 历史记录** — 记录所有操作（右键发送、自动拦截），方便回溯
- **⚙️ 灵活配置** — 支持自定义 RPC 地址、Secret、拦截规则
- **🌙 深色主题** — 精心设计的深色 UI，护眼且美观

## 📦 安装

### 1. 启动 Aria2 / Motrix RPC 服务

```bash
aria2c --enable-rpc --rpc-listen-port=16800 --rpc-allow-origin-all
```

或直接打开 Motrix 桌面客户端（默认启用 RPC）。

### 2. 加载浏览器扩展

1. 下载本仓库代码
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择 `MotrixExtension` 目录
5. 点击扩展图标，确认状态显示「已连接」

## 🔧 配置说明

| 选项 | 默认值 | 说明 |
|------|--------|------|
| RPC 地址 | `http://127.0.0.1:16800/jsonrpc` | Aria2 / Motrix 的 RPC 接口地址 |
| RPC Secret | 留空 | 如果 RPC 设置了密钥，填入此处 |
| 自动拦截 | 关闭 | 是否自动拦截浏览器下载请求 |
| 最小文件大小 | 1 MB | 低于此大小的文件不拦截 |
| 文件后缀 | zip, rar, 7z, mp4, mp3... | 只拦截匹配后缀的文件 |

## 📁 项目结构

```
MotrixExtension/
├── manifest.json      # 扩展配置（Manifest V3）
├── background.js      # 后台服务（RPC 通信、拦截逻辑、任务管理）
├── popup.html         # 弹窗界面（深色主题）
├── popup.js           # 弹窗逻辑（三标签页：设置/任务/历史）
└── icons/             # 图标资源
```

## 📄 License

[MIT](LICENSE)
