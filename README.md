# ⚡ Send to Motrix

**一键发送下载链接到 Motrix，支持自动拦截浏览器下载**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=google-chrome)](https://github.com/Qing060325/Motrix-link)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![Aria2 RPC](https://img.shields.io/badge/Aria2-RPC-orange)](https://aria2.github.io/)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

---

## ✨ 功能特性

### v2.0 新增
- **🏷️ 角标显示** — 扩展图标实时显示活跃下载数量
- **🖥️ 多服务器配置** — 保存多个 RPC 服务器，一键切换（家庭/公司/远程）
- **📦 批量下载** — 粘贴多个链接，一次性全部发送到 Motrix
- **⚡ 全局速度限制** — 预设速度档位（1/5/10/50 MB/s），一键限速
- **📤📥 导出/导入配置** — JSON 格式备份与迁移设置
- **⌨️ 快捷键** — `Alt+Shift+M` 快速切换自动拦截

### 核心功能
- **🖱️ 右键下载** — 在任意链接/图片/视频上右键，选择「使用 Motrix 下载」
- **🔄 自动拦截** — 开启后自动拦截浏览器下载请求，转发到 Motrix（可配置最小文件大小和文件后缀）
- **📋 任务管理** — 在扩展内查看下载进度、暂停/继续/移除任务，支持自动刷新
- **📜 历史记录** — 记录所有操作（右键发送、自动拦截、批量下载），方便回溯
- **⚙️ 灵活配置** — 支持自定义 RPC 地址、Secret、拦截规则
- **🌙 深色主题** — 精心设计的深色 UI，护眼且美观
- **🔒 安全可靠** — 所有用户输入均经过 HTML 转义，防止 XSS

---

## 📦 安装

### 1. 启动 Aria2 / Motrix RPC 服务

**方式一：使用 Aria2**
```bash
aria2c --enable-rpc --rpc-listen-port=16800 --rpc-allow-origin-all
```

**方式二：使用 Motrix 桌面客户端**
直接打开 Motrix 应用（默认启用 RPC 服务，监听 `127.0.0.1:16800`）。

### 2. 加载浏览器扩展

1. 下载本仓库代码
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启 **开发者模式**（右上角切换开关）
4. 点击 **加载已解压的扩展程序**，选择 `MotrixExtension` 目录
5. 点击扩展图标，确认状态显示「已连接」

---

## 🔧 配置说明

### 基础配置

| 选项 | 默认值 | 说明 |
|------|--------|------|
| **RPC 地址** | `http://127.0.0.1:16800/jsonrpc` | Aria2 / Motrix 的 RPC 接口地址 |
| **RPC Secret** | 留空 | 如果 RPC 设置了密钥，填入此处 |
| **自动拦截** | 关闭 | 是否自动拦截浏览器下载请求 |
| **最小文件大小** | 1 MB | 低于此大小的文件不拦截 |
| **文件后缀** | 见下表 | 只拦截匹配后缀的文件 |
| **下载完成通知** | 开启 | 任务完成时显示详细通知 |

### v2.0 新增配置

| 选项 | 说明 |
|------|------|
| **服务器配置** | 保存多个 RPC 服务器，点击切换 |
| **全局速度限制** | 预设 5 档：不限 / 1 / 5 / 10 / 50 MB/s |
| **导出配置** | 将所有设置导出为 JSON 文件 |
| **导入配置** | 从 JSON 文件恢复设置 |
| **快捷键** | `Alt+Shift+M` 切换自动拦截开关 |

### 默认拦截文件类型

| 类型 | 后缀 |
|------|------|
| **压缩包** | zip, rar, 7z, tar, gz, bz2, xz |
| **光盘镜像** | iso, img, dmg |
| **视频** | mp4, mkv, avi, mov, wmv, flv, webm |
| **音频** | mp3, flac, wav, aac, ogg, wma |
| **安装包** | exe, msi, deb, rpm, pkg, appimage |
| **文档** | pdf, doc, docx, xls, xlsx, ppt, pptx |
| **移动应用** | apk, ipa |

### 配置示例

#### 示例 1：本地 Motrix（默认配置）
```
RPC 地址: http://127.0.0.1:16800/jsonrpc
RPC Secret: （留空）
自动拦截: 开启
最小文件大小: 1 MB
```

#### 示例 2：远程 Aria2 服务器（带密钥）
```
RPC 地址: http://192.168.1.100:6800/jsonrpc
RPC Secret: your-secret-token
自动拦截: 开启
最小文件大小: 10 MB
```

#### 示例 3：仅拦截视频和音乐
1. 打开设置
2. 清空所有后缀
3. 添加后缀：mp4, mkv, mp3, flac

---

## 📁 项目结构

```
MotrixExtension/
├── manifest.json          # 扩展配置（Manifest V3）
├── config.js              # 共享配置（background + popup 共用）
├── background.js          # 后台服务（RPC 通信、拦截逻辑、任务管理、角标）
├── popup.html             # 弹窗界面（深色主题）
├── popup.js               # 弹窗逻辑（四标签页：设置/任务/批量/历史）
└── icons/                 # 图标资源
    ├── icon16.png         # 16x16 图标
    ├── icon48.png         # 48x48 图标
    ├── icon128.png        # 128x128 图标
    └── icon-error.png     # 错误状态图标
```

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+Shift+M` | 切换自动拦截开关 |

可在 `chrome://extensions/shortcuts` 中自定义。

---

## 🐛 故障排除

### 问题 1：扩展显示「连接失败」

**原因分析：**
- Aria2 / Motrix 服务未启动
- RPC 地址配置错误
- 防火墙阻止连接

**解决方案：**
1. 确保 Aria2 或 Motrix 已启动
   ```bash
   # 检查 Aria2 是否运行
   netstat -an | grep 16800
   ```
2. 验证 RPC 地址是否正确
   - 本地：`http://127.0.0.1:16800/jsonrpc`
   - 远程：确保地址和端口正确
3. 检查防火墙设置，允许 Chrome 访问 RPC 端口
4. 如配置了 RPC Secret，确保已填入

### 问题 2：自动拦截不工作

**原因分析：**
- 自动拦截功能未开启
- 文件大小或后缀不匹配
- 浏览器下载设置冲突

**解决方案：**
1. 打开扩展设置，确认「自动拦截」已启用
2. 检查「最小文件大小」设置（默认 1 MB）
3. 确认要下载的文件后缀在拦截列表中
4. 检查浏览器下载设置：
   - Chrome → 设置 → 隐私设置和安全性 → 网站设置 → 其他内容设置 → 下载内容
   - 确保未选择「下载前询问每个文件的保存位置」

### 问题 3：右键菜单不显示

**解决方案：**
1. 打开 `chrome://extensions/`
2. 找到「Send to Motrix」扩展
3. 点击「刷新」按钮
4. 重新加载网页（Ctrl+R 或 Cmd+R）

### 问题 4：发送失败，提示「发送失败」

**解决方案：**
1. 点击设置页的「测试连接」按钮，检查连接状态
2. 重启 Aria2 / Motrix 服务
3. 检查网络连接
4. 查看浏览器控制台（F12）的错误日志

### 问题 5：多服务器切换后连接失败

**解决方案：**
1. 确认目标服务器的 Aria2/Motrix 已启动
2. 检查该服务器的 RPC 地址和端口
3. 如有 Secret，确认已正确填写
4. 使用「测试」按钮验证连接

---

## 🔌 API 文档

### RPC 方法

本扩展使用 Aria2 JSON-RPC 2.0 协议。以下是常用方法：

| 方法 | 功能 |
|------|------|
| `aria2.addUri` | 添加下载任务 |
| `aria2.tellActive` | 获取正在下载的任务 |
| `aria2.tellWaiting` | 获取等待中的任务 |
| `aria2.tellStopped` | 获取已停止的任务 |
| `aria2.pause` | 暂停任务 |
| `aria2.unpause` | 继续任务 |
| `aria2.remove` | 移除任务 |
| `aria2.forceRemove` | 强制移除任务 |
| `aria2.getVersion` | 获取 Aria2 版本 |
| `aria2.changeGlobalOption` | 修改全局选项（如速度限制） |
| `aria2.getGlobalOption` | 获取全局选项 |

详见 [Aria2 RPC 文档](https://aria2.github.io/manual/en/html/aria2c.html#rpc-interface)。

---

## 🔐 安全性

### 输入验证
- ✅ RPC URL 使用 URL 构造函数验证
- ✅ 文件后缀使用正则表达式验证（仅允许字母、数字、下划线）
- ✅ 最小文件大小验证为非负数
- ✅ 导入配置时进行结构验证

### XSS 防护
- ✅ 所有用户输入在显示前进行 HTML 转义
- ✅ 使用 `textContent` 而非 `innerHTML` 处理不可信数据
- ✅ 动态生成的 HTML 中的变量均使用 `esc()` 函数转义

### 隐私保护
- ✅ 所有数据存储在本地（`chrome.storage.local`）
- ✅ 不收集用户信息
- ✅ 不上传任何数据到远程服务器
- ✅ 配置导出仅包含设置，不含历史记录

---

## 📝 开发指南

### 本地开发

1. **克隆仓库**
   ```bash
   git clone https://github.com/Qing060325/Motrix-link.git
   cd Motrix-link
   ```

2. **加载扩展**
   - 打开 `chrome://extensions/`
   - 启用「开发者模式」
   - 点击「加载已解压的扩展程序」，选择 `MotrixExtension` 目录

3. **修改代码后**
   - 在 `chrome://extensions/` 中点击扩展的「刷新」按钮
   - 重新加载网页查看效果

### 代码结构

- **config.js** — 默认配置常量，被 background.js 和 popup.js 共用
- **background.js** — 后台服务，处理：
  - 右键菜单事件（单链接 + 批量）
  - 自动拦截逻辑
  - RPC 通信和重试
  - 任务历史管理
  - 角标更新
  - 快捷键处理
  - 消息路由
- **popup.js** — 弹窗逻辑，处理：
  - 标签页切换（设置/任务/批量/历史）
  - 服务器配置管理
  - 设置加载/保存/验证
  - 任务列表刷新和操作
  - 批量下载
  - 历史记录显示
  - 配置导出/导入

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 报告 Bug
- 描述问题现象
- 提供重现步骤
- 附加浏览器控制台错误信息（F12）

### 提交改进
- Fork 本仓库
- 创建特性分支 (`git checkout -b feature/amazing-feature`)
- 提交更改 (`git commit -m 'Add amazing feature'`)
- 推送到分支 (`git push origin feature/amazing-feature`)
- 开启 Pull Request

---

## 📄 License

[MIT](LICENSE)

---

## 🙏 致谢

- [Aria2](https://aria2.github.io/) — 开源下载管理器
- [Motrix](https://motrix.app/) — 美观的下载管理应用
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/) — 官方文档

---

## 📞 联系方式

- **GitHub Issues** — 报告 Bug 或提出建议
- **GitHub Discussions** — 讨论功能和改进

**最后更新**：2026-05-02  
**版本**：2.0.0
