# Windows 支持状态

Windows x64 提供实验性安装包；真实 Codex 恢复仍待 Windows 真机验收，不代表正式支持。

## 已接入

- 配置、值班记录、任务锁、重试状态和宠物位置使用 `%APPDATA%\Cyber Overseer`。macOS 继续使用原目录，不迁移已有设置。
- 任务索引、语言和用量读取统一遵循 `CODEX_HOME`；未指定时读取用户目录下的 `.codex`。数据库保持只读。
- Windows 使用本机命名管道 `\\.\pipe\codex-ipc`；macOS 保留 Unix socket 及文件属主检查。恢复仍根据完整任务 ID 寻找持有者，不依赖窗口焦点。
- 安装包优先使用内置 Python 3.13.15／SQLite；源码运行可自动尝试 `py -3`、`python`、`python3`。显式 `CYBER_OVERSEER_PYTHON` 保留最高优先级；子进程不弹控制台。
- Codex 用量服务优先发现 `%LOCALAPPDATA%\OpenAI\Codex\bin\<版本>\codex.exe`，按文件修改时间先尝试较新版本；随后尝试常见独立安装目录、运行中 Codex 的资源目录、当前用户 Store 包以及 PATH 中的 `codex.exe`。启动被拒绝或程序失效时继续下一候选；服务启动后的额度接口错误不会触发盲目切换。也可明确指定可执行文件路径。读取失败会显示原因并约 30 秒后重试，不伪造余额。
- Windows 使用标准窗口标题栏和固定通知应用标识。
- 窗口观察器只在 macOS 编译，其他平台明确返回不可定位；自动恢复不因此被禁用。
- CI 配置包含 macOS 和 Windows：类型检查、测试、构建、双语界面冒烟截图。管道协议测试在 Windows 上创建独立随机命名管道，不连接真实任务。

Windows 管道地址参考 [OpenAI Codex 官方源码](https://github.com/openai/codex/blob/main/codex-rs/tui/src/ide_context/ipc.rs)。该源码只能证明共享传输入口；不能证明 Windows Desktop 当前版本支持全部私有恢复方法。Windows 管道服务端身份/ACL 尚未实机核验，不能宣称已有 POSIX 属主检查的同等保障。

## 安装与打包

[下载 Windows x64 预览版](https://github.com/tianwdong/cyber-overseer/releases/tag/v0.1.7)，运行 `Cyber-Overseer-0.1.7-windows-x64-setup.exe`。默认按当前用户安装，提供中英文引导、应用图标、开始菜单／桌面快捷方式和卸载入口；卸载保留个人配置。安装包未签名，可能触发 SmartScreen 信誉提示。

在 Windows x64 开发机上构建：

```powershell
npm ci
npm run package:win
```

输出位于 `release/windows`。Python 固定下载版本并校验 SHA-256；项目、角色和第三方授权文件随包携带。打包配置见 `electron-builder.win.json`。

`Windows installer` Actions 可手动触发：构建后在含中文及空格的目录安装，移除 PATH 中开发 Python，再运行安装后程序的界面演练，最后验证卸载并生成 SHA-256 文件。此过程使用模拟任务，不连接真实 Codex。

## 当前源码运行方式

先安装 Node.js 24+ 和 Python 3.9+（含 sqlite3），运行并登录 Windows 原生 Codex Desktop。在 PowerShell 中进入项目目录：

```powershell
npm ci
npm start
```

需要覆盖自动发现时，在启动前设置完整路径；下列为示例，必须替换为本机实际存在的路径：

```powershell
$env:CYBER_OVERSEER_PYTHON = 'C:\Python312\python.exe'
$env:CYBER_OVERSEER_CODEX = 'C:\实际安装位置\codex.exe'
$env:CODEX_HOME = 'D:\CodexData'
npm start
```

`CYBER_OVERSEER_CODEX` 只用于读取账户额度；自动恢复使用运行中的 Desktop IPC。支持当前用户 Store 包与用户目录服务发现。CLI 通过浏览器登录 ChatGPT 时，额度服务沿用当前 CODEX_HOME；只运行 CLI 不代表存在 Desktop 的定向恢复入口。不要用 WSL 路径代替 Windows 原生数据目录；跨 WSL 看护不在当前支持范围内。

## 正式支持的验收门槛

以下全部通过并记录 Windows、Codex、督工版本和测试结果后，才可标记正式支持：

- Windows 11 原生环境完成干净安装；安装包解决 Python 依赖，用户无需自行补环境。
- 多任务自动发现，包含中文/空格路径和自定义 CODEX_HOME；只恢复对应完整 ID 的故障任务。
- 真实网络断连耗尽 Codex 自重连后自动 continue；再次断连遵循设置的次数上限。真实压缩异常恢复后验证新 turn 已运行。
- 人工停止、正常结束、等审批、额度耗尽都不误续跑；不确定是否接收的请求不重复发送。
- 重启保留全局开关、单任务排除、重试次数及宠物位置；同时运行的实例不重复恢复。
- 托盘关闭与退出行为、透明宠物点击/拖动/任意摆放、多屏和 125%/150% 缩放正常；通知实际送达并打开对应任务。
- 真实额度读取、双语界面和语言跟随正确；定位功能有 Windows 实现或产品明确标注不支持。
- 检查真实管道身份和恢复方法兼容性；打包产物通过 Windows Defender 检查及启动验收。

本机证据：macOS 类型检查、119 项测试与构建通过。Windows CI 状态以仓库 Actions 为准；CI 不代表真实 Windows 恢复验收，真机证据仍为空缺。

安装与卸载 CI 已通过，记录见 [验证记录](validation.md#windows-安装包--windows-installer--v011)。这不改变上述真实 Codex 恢复的验收边界。
