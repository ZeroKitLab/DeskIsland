# DeskIsland · Windows 灵动岛

基于 **Tauri 2、React 和 TypeScript** 的 Windows 桌面工具，常驻屏幕顶部，通过小岛展示状态，点击后展开功能面板。

## 功能

- **时间与工作信息**：默认时钟、悬停信息胶囊、天气温度、自定义上下班时间和下班倒计时。
- **实时歌词**：通过 Windows 媒体会话读取 QQ 音乐 / 网易云音乐的播放状态，显示歌名和同步歌词，支持歌词渐显与滚动。优先支持 QQ 音乐，兼容情况取决于播放器版本和媒体会话信息。
- **笔记**：多条笔记，本机自动保存。
- **待办**：添加、完成和删除事项。
- **AI 对话**：流式输出，支持用户自行配置的 OpenAI 兼容接口。
- **天气**：当前天气、体感温度、湿度、风速和未来七天预报。
- **通知中心**：应用内部通知及历史记录，在小岛中短暂展示。
- **加速器**：使用 mihomo 管理订阅、本地代理、节点选择和 Windows 系统代理；Windows x64 安装包包含内核。
- **外观与尺寸**：纯黑面板，可分别调整默认岛、悬停岛、歌词岛和面板尺寸。

## 操作

- 鼠标移入小岛查看扩展信息，移出后恢复默认状态。
- 点击小岛打开功能面板，按住并拖动小岛可调整所在屏幕和位置。
- `Esc` 或鼠标后侧键返回上一级：功能页 → 功能选择页 → 默认岛。
- 音乐播放或收到应用内部通知时，小岛会展示对应内容。

## 开发环境

目前面向 **Windows 10 / 11 x64** 开发和打包。

- Node.js 22 或更新版本，包含 npm。
- Rust stable，使用 `x86_64-pc-windows-msvc` 工具链。
- Visual Studio Build Tools 的 C++ 桌面开发组件及 Windows SDK。
- Microsoft Edge WebView2 Runtime。

```powershell
git clone https://github.com/ZeroKitLab/DeskIsland.git
cd DeskIsland
npm ci
npm run desktop:dev
```

桌面开发模式会先准备 mihomo 内核资源，再启动 Vite 和 Tauri。首次缺少资源时需要联网下载；资源就绪后会校验并复用。

仅预览前端：

```powershell
npm run dev
```

打开 http://localhost:1420。Windows 媒体会话、系统代理等桌面能力需要在 Tauri 中使用。

## 构建 Windows 安装包

```powershell
npm run desktop:build
```

NSIS 安装包输出到 `src-tauri/target/release/bundle/nsis/`。

构建过程会下载并校验固定版本的官方 mihomo Windows x64 内核，将内核、GPLv3 许可证和来源说明一起放入安装包。终端用户无需单独下载内核。用户数据目录 `proxy/core/mihomo.exe` 中手动安装的内核仍优先使用。

请使用 Tauri 构建命令生成桌面发行版本，保证前端资源正确嵌入。

## 检查

```powershell
npm run build:desktop
npm run check:playback
cd src-tauri
cargo check --locked
```

`check:playback` 检查播放时钟、歌词边界以及暂停、跳转和切歌等逻辑；实际 QQ 音乐 / 网易云音乐兼容性需要配合对应播放器确认。

## 数据与当前限制

- 笔记、待办、聊天、通知和设置保存在本机 WebView 的 `localStorage` 中，目前没有云同步或自动备份。
- AI API Key 当前也保存在本机 `localStorage` 中，尚未使用系统凭据加密。使用 AI 时，消息和 Key 会发送到设置中指定的服务地址。
- 天气与城市查询使用 Open-Meteo；自动定位会访问第三方 IP 定位服务。
- 通知目前来自应用内部，尚未接入系统通知监听或 Outlook / QQ / 163 邮件通知。
- 歌词依赖播放器提供的媒体信息和第三方网络接口，可能受接口变化、歌曲匹配或网络情况影响。
- 加速器需要用户自行提供有效订阅；本项目不提供订阅、节点或代理服务。

## 项目结构

```text
src/
  components/       灵动岛、展开面板与图标
  pages/            功能页面
  hooks/            应用状态与播放时钟
  lib/              存储、天气、歌词、AI、代理与窗口工具
src-tauri/
  src/              Windows 媒体会话、窗口布局、代理与歌词请求
  resources/        第三方许可说明及构建时下载的内核
scripts/
  gen-icons.mjs     生成应用图标
  prepare-core.mjs  下载、校验 mihomo 内核和许可证
  check-playback.mjs 播放逻辑检查
```

## 反馈与贡献

欢迎通过 [Issues](https://github.com/ZeroKitLab/DeskIsland/issues) 反馈问题或提交 Pull Request。报告界面或播放器问题时，请附上 Windows 版本、显示缩放比例、播放器版本和复现步骤。

请勿在 Issue、日志或提交中包含 API Key、邮箱授权码、代理订阅地址等私人信息。

## 许可证

DeskIsland 自身代码采用 [MIT License](LICENSE)。第三方依赖保留各自许可证，其中随安装包分发的 mihomo 内核采用 GPLv3，详见 [第三方说明](THIRD_PARTY_NOTICES.md)。
