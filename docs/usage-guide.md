# 使用与兼容说明

[返回项目介绍](../README.md)

## 它什么时候会出手

督工根据持久日志中的失败证据判断，再核对任务的实时状态。安静思考、执行长命令、正常结束或等你批准，都不会被当作断线。

| 发生了什么 | 督工怎么做 |
| --- | --- |
| 网络或流请求明确失败，任务已结束 | 冷却后向原任务发送 `continue` |
| 出现 `Selected model is at capacity` | 在次数上限内退避重试，保留原模型 |
| 上下文超限或压缩失败 | 首次请求原任务压缩，确认成功后继续；若压缩明确失败，冷却后改发 `continue`，由 Codex 决定是否自动压缩 |
| 继续后又失败 | 按设置退避重试，默认共 **3 次，含首次** |
| Codex 仍在运行或自行重连 | 等待它处理 |
| 正常完成、人工停止、等待批准或输入 | 留给用户处理 |
| 明确的认证、权限或额度限制 | 停止无效续跑 |
| 已发出请求，但连接断开、回执不明 | 等待读回确认，避免盲目重复发送 |

每个任务独立计数，重启后保留。可以把上限设为 1–10 次、关闭再次重试、暂停单个任务，或一键暂停全部。短暂复工后再次失败不会立即清零；压缩和随后的继续合计一次恢复。

压缩失败后的回退从失败结束时计算冷却，默认后两次分别等待 30 秒、60 秒，共用原来的三次上限。仅有提交回执、尚未确认结果时不会重复发出 `continue`。这条本地策略通过模拟回执测试，不能据此保证远端压缩会成功。

**完整任务 ID 决定发送目标。** 督工不依赖标题匹配或当前键盘焦点，也不会为了发现任务而重新打开磁盘里的历史对话。


## 快速开始

已有本地 DMG 时，打开后将 **Cyber Overseer.app** 拖入 Applications。App 内置运行依赖，无需另装 Node.js 或 Python；可从 [GitHub Releases](https://github.com/tianwdong/cyber-overseer/releases/tag/v0.1.2) 下载。构建方式与签名状态见 [App 与 DMG 打包](packaging.md)。

以下为源码运行方式：

准备好 Node.js 24+、Python 3.9+（含 `sqlite3`），并启动已登录的 Codex Desktop。下载项目源码，在项目目录运行：

```sh
npm ci
npm start
```

首次启动默认开启自动看护。单击桌面角色打开面板，在设置中调整次数和语言；语言默认跟随 Codex，未指定时跟随系统。

关闭面板后仍在托盘运行。需要停止恢复时，选择「暂停全部」；需要结束程序时，从托盘退出。

**先看看角色：**

```sh
npm run dev
```

演练使用模拟任务，不向真实任务投递指令。

<details>
<summary>指定任务、无界面运行与可选窗口定位</summary>

优先发现指定任务，随后仍会自动发现其他已打开的任务；参数可重复：

```sh
npm start -- --watch-thread <thread-id>
```

无界面看护单个任务，按 Ctrl+C 停止：

```sh
npm run watch -- --thread <thread-id>
```

macOS 可选窗口观察器：

```sh
npm run build
npm run build:native
```

在面板启动窗口定位，需要辅助功能权限和可验证的完整任务 ID。定位只影响角色走到哪里，自动恢复不等待窗口定位。真实 Codex 窗口坐标绑定仍待验收。

</details>

Windows 环境变量、Python 和路径配置见 [Windows 支持说明](windows-support.md)。


## 数据留在哪里

程序只读 Codex 的任务数据库与 rollout，不修改历史记录、代理、任务模型或审批设置。自动判断故障不需要额外模型调用；实际恢复会让原任务继续执行，并使用原任务的额度。

本地配置、恢复记录和缓存保存在：

- macOS：`~/Library/Application Support/Cyber Overseer/`
- Windows：`%APPDATA%\Cyber Overseer\`

用量缓存保存计量元数据；值班记录最多保留 200 条事件；收工信箱最多保留 100 条结果，包含任务标题、目录与最多 1,600 字符的回复摘录。公开问题报告时，请先移除私密内容，避免直接附上原始数据库、rollout 或整个应用数据目录。


## 支持范围与验证

| 范围 | 当前状态 |
| --- | --- |
| 本机 Codex Desktop · macOS | 已有真实任务发现、状态读取和网络故障恢复证据 |
| 本机 Codex Desktop · Windows | 已做源码适配，真实恢复和桌面交互待验收 |
| Claude、Grok、远程主机任务 | 尚未接入 |
| macOS Apple Silicon App／DMG | 实验性预览，尚未公证；无自动更新 |

截至 2026-09-07，类型检查与 **119 项自动化测试**通过。Electron 演练覆盖双语面板、未读操作和角色交互；模拟协议测试与界面演练不等同于真实故障恢复或 Windows 真机验收。连续三次真实断网耗尽重试上限、真实压缩故障恢复仍需补充实测。

已检查的适配版本为 Codex Desktop `26.901.41123`、内置 Codex `0.153.3`。内部 IPC 不是稳定公开 API，桌面端升级后需要复核。用户手动继续与自动发送之间仍可能存在竞态；当前不承诺在所有崩溃、断电或协议异常下完全无人值守。


## 开发与参与

```sh
npm run typecheck       # 类型检查
npm test                # 核心与协议测试
npm run smoke           # Electron 演练，使用独立测试配置
npm run smoke:interface # 面板与交互演练
```

恢复核心位于 `src/core/watchdog.ts`，桌面协议适配位于 `src/main/codex-ipc.ts`，面板和角色绘制位于 `src/renderer/`。动画与恢复分开运行，新增角色无需改变发送逻辑。

当前最需要的帮助是 Windows 真机验收、Codex 版本兼容验证、恢复边界复现和角色动作打磨。反馈故障时，请附系统版本、Codex 版本、复现步骤以及脱敏后的错误文字。

- [收工信箱与已读规则](completion-inbox.md)
- [用量统计口径](usage-overview.md)
- [价格表维护](pricing.md)
- [恢复与接管](recovery-handoff.md)
- [技术路线与参考](research/2026-09-06-technical-route.md)
