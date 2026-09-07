# macOS App 与本地 DMG

当前打包目标为 Apple Silicon（arm64），产出本地 Alpha 预览。预览包见 [GitHub Releases](https://github.com/tianwdong/cyber-overseer/releases)。未完成 Developer ID 签名、公证或干净机器验收；Windows x64 安装包见 [Windows 打包说明](windows-support.md)；Intel Mac 安装包尚未提供。

## 构建

在 macOS arm64 安装项目开发依赖后运行：

```sh
npm run package:mac
```

需要 Node.js、npm 和用于编译可选窗口观察器的 Swift 工具链，以及首次下载 Python 运行时的网络。使用已安装 Electron 的固定版本，不另行下载 Electron。

产物：

- `release/mac-arm64/Cyber Overseer.app`
- `release/Cyber-Overseer-<version>-mac-arm64.dmg`
- 同名 `.dmg.sha256`

DMG 内有 App 和 Applications 快捷入口。安装后无需用户安装 Node.js 或 Python；仍需已登录的 Codex Desktop。构建脚本只替换项目里的生成目录，不覆盖 `/Applications` 中的应用。

## 图标

`assets/icon/icon.png` 与 `icon.icns` 使用界面现有琥珀色标记和深色圆角底板。源文件为 `scripts/build-icon.swift`，通过 AppKit 确定性绘制；运行 `npm run build:icon` 可重新生成完整尺寸集。图标嵌入 App 的资源和 Info.plist。

## 随包运行时

Python 来自 [python-build-standalone](https://github.com/astral-sh/python-build-standalone/blob/main/docs/running.rst) 的独立分发，版本、URL 和 SHA-256 固定在 `scripts/prepare-python.mjs`。下载后必须通过校验；不依赖本机 Python 路径。运行时保留自身许可证，来源记录放入 App 的 `Resources/licenses`。

应用优先使用随包 Python；显式的 `CYBER_OVERSEER_PYTHON` 仍可覆盖。执行采用隔离模式，避免宿主 Python 环境污染，禁止写入字节码缓存。随包提供角色、价格种子、统计脚本、原生观察器和 Electron／Chromium／smol-toml／CodeBurn 声明。

## 验证与限制

构建执行 ad-hoc 签名与深度签名校验，并验证随包 Python 的 SQLite 模块。ad-hoc 签名不代表 Apple Developer ID 签名或公证，其他机器下载后的 Gatekeeper 行为仍需验收。

可直接验证打包后的界面：

```sh
"release/mac-arm64/Cyber Overseer.app/Contents/MacOS/Cyber Overseer" --smoke
```

使用系统临时目录下的 `cyber-overseer-smoke` 保存独立配置和截图，不写 App 包，也不向真实任务发送消息；演练会断言 Python 确实来自包内。签名校验、模拟 UI 演练和当前机器启动不等同于干净机器验收或真实故障恢复。

源码采用 MIT，原创角色素材保留所有权利。正式版仍需完善版本身份和签名方案、完成干净机器及安装／卸载验收。公开预览不等于完成正式平台支持验收。

### 2026-09-07 本机验收

- 类型检查与 119 项测试通过；打包 App 从项目外工作目录启动完整 Electron 演练通过，已检查截图。
- 修复 Python 探测写入包内字节码导致签名失效的问题；重新打包后随包运行时断言通过，界面演练后深度签名校验仍通过。
- 双语界面与四角色左右贴边拖动复验通过；首次界面复验出现一次拖动事件不稳定，复跑通过，未将其视为已根治的交互问题。
- DMG 完整性校验通过，约 187 MiB。未安装到另一台干净 Mac，未验证下载隔离属性下的首次启动，也未进行新的真实故障恢复。

### 安装包精简

打包时仅对生成副本运行 `scripts/trim-package.mjs`，移除 Python 的 pip、ensurepip、IDLE、开发头文件、编译配置、帮助数据、字节码缓存与静态归档，以及桌面 App 不使用的 `watch.cjs`。源码测试和开发环境不受影响；保留解释器、标准运行模块、角色和必要许可证。

本机同口径磁盘占用：App 从 402,920 KiB 减至 388,356 KiB（约减少 14.2 MiB）；DMG 从 191,708 KiB 减至 181,636 KiB（约减少 9.8 MiB）。体积大头仍为 Electron。本轮使用精简包内的 Python 执行全部 119 项测试通过，包括 SQLite 与用量扫描用例。

### 默认下载压缩格式

DMG 默认采用 ULMO（LZMA）压缩，打包后自动执行 `hdiutil verify`，成功后生成 SHA-256 校验文件。同内容转换实测约 118.5 MiB，相比原先 UDZO 的 177.4 MiB 减少约 33%；安装占用不变。当前 Mac 已验证镜像挂载、App 签名和 1,089 个文件／链接内容一致。旧系统的挂载与启动兼容性尚未验收，不能据此扩大系统支持范围。

默认流程直接从 App 创建 ULMO DMG，最终产物实测 124.3 MiB（与前述已有镜像转换得到的 118.5 MiB 不是同一次构建）。相对原 177.4 MiB 约减少 30%，扩展名仍是 `.dmg`。新包通过镜像完整性、SHA-256 和 App 深度签名校验；普通用户仍按双击 DMG、拖入 Applications 的方式安装。
