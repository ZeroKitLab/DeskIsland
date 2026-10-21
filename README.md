# DeskIsland · Windows 灵动岛

基于 **Tauri 2、React 和 TypeScript** 的 Windows 桌面工具，常驻屏幕顶部，通过小岛展示状态，点击后展开功能面板。

A Windows desktop utility built with **Tauri 2, React, and TypeScript**. A compact island stays at the top of your screen, displays status at a glance, and opens a panel of tools when clicked.

## 功能 · Features

| 功能 · Feature | 中文介绍 | English |
| --- | --- | --- |
| 时间与工作信息 · Time & work | 默认时钟、悬停信息胶囊、天气温度、自定义上下班时间和下班倒计时。 | A compact clock, a hover information capsule, temperature, customizable working hours, and a countdown to the end of your workday. |
| 实时歌词 · Live lyrics | 通过 Windows 媒体会话读取 QQ 音乐 / 网易云音乐的播放状态，显示歌名和同步歌词，支持渐显与滚动。优先支持 QQ 音乐，兼容情况取决于播放器版本和媒体会话信息。 | Reads QQ Music / NetEase Cloud Music playback through Windows media sessions and displays track titles and synchronized lyrics with fades and scrolling. QQ Music is the primary target; compatibility depends on the player version and the media information it exposes. |
| 笔记 · Notes | 多条笔记，本机自动保存。 | Multiple notes with automatic local saving. |
| 待办 · Tasks | 添加、完成和删除事项。 | Add, complete, and delete tasks. |
| AI 对话 · AI chat | 流式输出，支持自行配置的 OpenAI 兼容接口。 | Streaming responses through a user-configured OpenAI-compatible API. |
| 天气 · Weather | 当前天气、体感温度、湿度、风速和未来七天预报。 | Current conditions, feels-like temperature, humidity, wind speed, and a seven-day forecast. |
| 通知中心 · Notifications | 应用内部通知及历史记录，在小岛中短暂展示。 | In-app notifications and history, with brief previews on the island. |
| 加速器 · Proxy controls | 使用 mihomo 管理订阅、本地代理、节点选择和 Windows 系统代理；Windows x64 安装包包含内核。 | Uses mihomo for subscriptions, local proxy connections, node selection, and Windows system proxy control. The Windows x64 installer includes the core. |
| 外观与尺寸 · Appearance & sizing | 纯黑面板，可分别调整默认岛、悬停岛、歌词岛和面板尺寸。 | A pure-black panel with separate size settings for the compact island, hover state, lyrics state, and expanded panel. |

## 操作 · Controls

- 鼠标移入小岛查看扩展信息，移出后恢复默认状态。<br>Hover over the island for additional information; move the pointer away to return to its compact state.
- 点击小岛打开功能面板，按住并拖动小岛可调整所在屏幕和位置。<br>Click to open the tools panel. Press and drag the island to reposition it or move it to another monitor.
- `Esc` 或鼠标后侧键返回上一级：功能页 → 功能选择页 → 默认岛。<br>Press `Esc` or the mouse back button to go back one level: feature page → tools menu → compact island.
- 音乐播放或收到应用内部通知时，小岛会展示对应内容。<br>The island displays relevant content during music playback or when an in-app notification arrives.

## 开发环境 · Development

目前面向 **Windows 10 / 11 x64** 开发和打包。<br>Development and packaging currently target **Windows 10 / 11 x64**.

| 环境要求 | Requirement |
| --- | --- |
| Node.js 22 或更新版本，包含 npm。 | Node.js 22 or newer, including npm. |
| Rust stable，使用 `x86_64-pc-windows-msvc` 工具链。 | Stable Rust with the `x86_64-pc-windows-msvc` toolchain. |
| Visual Studio Build Tools 的 C++ 桌面开发组件及 Windows SDK。 | Visual Studio Build Tools with Desktop development with C++ and the Windows SDK. |
| Microsoft Edge WebView2 Runtime。 | Microsoft Edge WebView2 Runtime. |

```powershell
git clone https://github.com/ZeroKitLab/DeskIsland.git
cd DeskIsland
npm ci
npm run desktop:dev
```

桌面开发模式会先准备 mihomo 内核资源，再启动 Vite 和 Tauri。首次缺少资源时需要联网下载；资源就绪后会校验并复用。

Desktop development mode prepares the mihomo core before starting Vite and Tauri. Missing resources are downloaded on the first run; existing resources are verified and reused.

仅预览前端：<br>To preview the frontend only:

```powershell
npm run dev
```

打开 http://localhost:1420。Windows 媒体会话、系统代理等桌面能力需要在 Tauri 中使用。

Open http://localhost:1420. Desktop features such as Windows media sessions and system proxy control require the Tauri app.

## 构建 Windows 安装包 · Build the Windows Installer

```powershell
npm run desktop:build
```

NSIS 安装包输出到 `src-tauri/target/release/bundle/nsis/`。<br>The NSIS installer is written to `src-tauri/target/release/bundle/nsis/`.

构建过程会下载并校验固定版本的官方 mihomo Windows x64 内核，将内核、GPLv3 许可证和来源说明一起放入安装包。终端用户无需单独下载内核。用户数据目录 `proxy/core/mihomo.exe` 中手动安装的内核仍优先使用。

The build downloads and verifies a pinned official mihomo Windows x64 release, then bundles the core, its GPLv3 license, and source information in the installer. End users do not need a separate core download. A manually installed core at `proxy/core/mihomo.exe` inside the application data directory takes precedence.

请使用 Tauri 构建命令生成桌面发行版本，保证前端资源正确嵌入。

Use the Tauri build command for desktop releases so that frontend assets are embedded correctly.

## 检查 · Checks

```powershell
npm run build:desktop
npm run check:playback
cd src-tauri
cargo check --locked
```

`check:playback` 检查播放时钟、歌词边界以及暂停、跳转和切歌等逻辑；实际 QQ 音乐 / 网易云音乐兼容性需要配合对应播放器确认。

`check:playback` checks the playback clock, lyric boundaries, pausing, seeking, and track changes. Actual QQ Music / NetEase Cloud Music compatibility must be checked with the corresponding player.

## 数据与当前限制 · Data & Current Limitations

- 笔记、待办、聊天、通知和设置保存在本机 WebView 的 `localStorage` 中，目前没有云同步或自动备份。<br>Notes, tasks, chats, notifications, and settings are stored in the local WebView's `localStorage`. Cloud sync and automatic backups are not available yet.
- AI API Key 当前也保存在本机 `localStorage` 中，尚未使用系统凭据加密。使用 AI 时，消息和 Key 会发送到设置中指定的服务地址。<br>The AI API key is also stored in local `localStorage` without OS credential encryption. When you use AI chat, messages and the key are sent to the service endpoint specified in settings.
- 天气与城市查询使用 Open-Meteo；自动定位会访问第三方 IP 定位服务。<br>Weather and city searches use Open-Meteo. Automatic location detection contacts third-party IP geolocation services.
- 通知目前来自应用内部，尚未接入系统通知监听或 Outlook / QQ / 163 邮件通知。<br>Notifications currently originate within the app. System notification monitoring and Outlook / QQ / 163 email notifications are not implemented yet.
- 歌词依赖播放器提供的媒体信息和第三方网络接口，可能受接口变化、歌曲匹配或网络情况影响。<br>Lyrics depend on media information from the player and third-party network APIs. API changes, track matching, and network conditions may affect results.
- 加速器需要用户自行提供有效订阅；本项目不提供订阅、节点或代理服务。<br>Proxy functionality requires a valid subscription supplied by the user. This project does not provide subscriptions, nodes, or proxy services.

## 项目结构 · Project Structure

| 路径 · Path | 中文说明 | English |
| --- | --- | --- |
| `src/components/` | 灵动岛、展开面板与图标 | Island, expanded panel, and icons |
| `src/pages/` | 功能页面 | Feature pages |
| `src/hooks/` | 应用状态与播放时钟 | Application state and playback clocks |
| `src/lib/` | 存储、天气、歌词、AI、代理与窗口工具 | Storage, weather, lyrics, AI, proxy, and window utilities |
| `src-tauri/src/` | Windows 媒体会话、窗口布局、代理与歌词请求 | Windows media sessions, window layout, proxy control, and lyric requests |
| `src-tauri/resources/` | 第三方许可说明及构建时下载的内核 | Third-party notices and the core downloaded during builds |
| `scripts/gen-icons.mjs` | 生成应用图标 | Generates application icons |
| `scripts/prepare-core.mjs` | 下载、校验 mihomo 内核和许可证 | Downloads and verifies the mihomo core and license |
| `scripts/check-playback.mjs` | 播放逻辑检查 | Playback logic checks |

## 反馈与贡献 · Feedback & Contributing

欢迎通过 [Issues](https://github.com/ZeroKitLab/DeskIsland/issues) 反馈问题或提交 Pull Request。报告界面或播放器问题时，请附上 Windows 版本、显示缩放比例、播放器版本和复现步骤。

Bug reports and pull requests are welcome. Please use [Issues](https://github.com/ZeroKitLab/DeskIsland/issues) and include your Windows version, display scaling, player version, and reproduction steps when reporting UI or playback problems.

请勿在 Issue、日志或提交中包含 API Key、邮箱授权码、代理订阅地址等私人信息。

Keep API keys, email authorization codes, proxy subscription URLs, and other private information out of issues, logs, and commits.

## 许可证 · License

DeskIsland 自身代码采用 [MIT License](LICENSE)。第三方依赖保留各自许可证，其中随安装包分发的 mihomo 内核采用 GPLv3，详见 [第三方说明](THIRD_PARTY_NOTICES.md)。

DeskIsland's own code is licensed under the [MIT License](LICENSE). Third-party dependencies retain their respective licenses. The mihomo core distributed with the installer is licensed under GPLv3; see [Third-party notices](THIRD_PARTY_NOTICES.md).
