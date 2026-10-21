# Third-party notices

DeskIsland 自身代码采用根目录的 [MIT License](LICENSE)。第三方依赖和数据保留各自的许可与权利。

## mihomo

加速器使用未修改的 mihomo 作为独立本地进程。内核二进制不提交到本仓库，Windows x64 安装包在构建时下载并打包固定的官方版本。

- 项目：https://github.com/MetaCubeX/mihomo
- 版本：v1.19.32
- 对应源码：https://github.com/MetaCubeX/mihomo/tree/v1.19.32
- 源码归档：https://github.com/MetaCubeX/mihomo/archive/refs/tags/v1.19.32.tar.gz
- 许可证：GNU GPL version 3，全文见 [mihomo-GPL-3.0.txt](src-tauri/resources/mihomo-GPL-3.0.txt)。根目录 MIT 许可证不改变 mihomo 的许可证。
- 下载文件和 SHA-256 校验值见 [prepare-core.mjs](scripts/prepare-core.mjs)。安装包中也包含内核的许可和来源说明。

## 数据和其他依赖

- 天气和城市查询由 [Open-Meteo](https://open-meteo.com/) 提供。
- 歌曲信息和歌词通过 QQ 音乐、网易云音乐的网络接口获取，相关内容的权利属于原权利人；本项目不分发歌曲音频或歌词数据库。
- React、Lucide、Tauri 及其他 npm / Rust 依赖保留其各自许可证，版本记录在 `package-lock.json` 和 `src-tauri/Cargo.lock` 中。
