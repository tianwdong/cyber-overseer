# cyber-overseer 技术路线调研

调研日期：2026-09-06。下文为最初调研，实施后的证据更新见下一节。

建议先做 macOS 桌面伴随程序：Electron + TypeScript 负责托盘、设置和透明动画，独立恢复核心负责事件判定与续跑，各工具通过专用适配器接入。Codex 优先验证运行中 App Server 的连接能力，Claude Code、Grok Build 优先验证 hooks 加定向终端输入。接入现有窗口和由督工启动的会话分开验收。


## 实施更新（同日）

用户已明确：网络和压缩异常必须自动恢复，不能每次依赖点击确认。目前已实现 Electron 原型与独立自动恢复核心，见 [README](../../README.md)。

实际接入采用两个独立通道：

1. 只读 `~/.codex/state_5.sqlite` 获取完整任务 ID 和 rollout 路径；核对日志首条身份后，提取 `task_started`、`task_complete` 和压缩生命周期。当前任务真实失败是带 error 的 `task_complete`，并非仅凭 UI 的重连文字。
2. 连接现有 `~/.codex/ipc/ipc.sock`，初始化后用 `thread-owner-discovery` 找到原任务持有者。通过 `thread-follower-start-turn` 定向投递 `continue`，通过 `thread-follower-compact-thread` 请求压缩。协议从实际安装包静态检查，真实 owner 探测已成功；发送流程使用模拟 socket 验证。

这是 Desktop 内部 IPC，不是另启一个 App Server，也不是全局键盘输入。已查版本为 Desktop `26.901.41123`、内置 Codex `0.153.3`，和 Homebrew CLI `0.146.1` 有差异。协议升级需复核。

恢复器在终止失败后自动处理，压缩成功后自动继续；明确拒绝会退避重试。提交结果不明时持续核对日志，不重复投递同一故障。任务正常运行、正常结束或用户停止时不触发。动画不参与是否允许恢复的判定。

真实原生日志的压缩 item 类型是 `ContextCompaction`，本任务已观测到 `item_completed`；不能只照搬 App Server 的 camelCase 示例。相关类型定义可查 [上游 TurnItem](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/items.rs)，压缩执行路径见 [compact_remote.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact_remote.rs)。

验证：29 项恢复／绑定／协议测试通过，Electron 演练通过，Swift 观察器编译通过。真实网络故障恢复、真实压缩异常恢复和真实 Codex 窗口坐标仍须分别验收；不能以模拟成功代替。

当前工具禁止访问 Codex 自身 UI，未通过其他手段绕过这一限制。原生观察器的实机 UI 验收因此未执行；后台自动恢复不依赖它。

## 以下为最初调研记录

## 本轮证据范围

- 项目当前只有 Git 元数据，没有现成应用代码或技术栈约束。
- 阅读 goodclaude 的 main.js、overlay.html、package.json，以及 OpenWhip 的 main.js、overlay.html、README。
- 阅读 OpenAI、Claude Code、xAI、Electron、Apple、tmux、node-pty、Tauri 的官方资料或上游源码。
- 本机只执行版本、帮助查询与 Codex 协议 schema 导出，没有发送模型请求、连接或操纵现有会话、安装 hooks、修改配置、调整网络或启动常驻服务。
- 本机版本：Codex CLI 0.146.1、Claude Code 2.1.63、Grok 1.0.13（5e9a58528b76）；存在 tmux、Swift。
- 官方最新文档与本机安装版本可能存在差异。Claude/Grok 的具体 hooks 必须通过本机能力测试确认。

## 参考项目的实际作用

| 参考 | 已查能力 | 对本项目的价值与边界 |
| --- | --- | --- |
| goodclaude | Electron 托盘、主屏透明置顶窗口、Canvas 魔法棒与粒子、macOS AppleScript / Windows 键盘模拟 | 适合参考桌面互动；没有会话监控、故障分类、定向恢复和成功回执 |
| OpenWhip | Canvas 鞭子、Verlet 积分、分段距离约束、鞭尖速度触发动作 | 与用户想要的挥鞭效果直接对应；动画触发频率不能直接决定恢复频率 |
| tmux | Control Mode 提供按 pane 标识的输出和控制命令 | 可对明确的终端 pane 输入，避免全局焦点依赖；只适用于 tmux 内会话 |
| node-pty | 在 Node.js 中创建伪终端、读取输出和写入输入 | 适合督工启动的 CLI；不等于能附着任意已经启动的终端进程 |

goodclaude 与 OpenWhip 的输入代码都先发送 Ctrl+C，再输入短语、回车，并通过 Cmd+Tab / Alt+Tab 尝试恢复先前应用焦点。无人值守模式应重新设计输入路径：这套宏可能打断正常执行或输入到其他窗口。

goodclaude 的 package.json 声明 MIT；本轮没有完成上游全部代码、图片与声音的授权清单核对，若复用文件需逐项保留和核对授权信息。

来源：[goodclaude main.js](https://github.com/ashley-ha/goodclaude/blob/main/main.js)、[overlay.html](https://github.com/ashley-ha/goodclaude/blob/main/overlay.html)、[package.json](https://github.com/ashley-ha/goodclaude/blob/main/package.json)、[OpenWhip 鞭子实现](https://github.com/GitFrog1111/OpenWhip/blob/main/overlay.html)、[tmux Control Mode](https://github.com/tmux/tmux/wiki/Control-Mode)、[node-pty](https://github.com/microsoft/node-pty)。

## 接入路线

### Codex

官方 App Server 提供 JSON-RPC，可读任务状态、接收 turn/item 事件、恢复已有任务并提交新输入；compaction 也有独立请求与事件。当前文档及本机帮助均将 App Server 标记为实验性能力，应锁定验证过的版本范围。

本机 schema 额外确认：

- ErrorNotification 包含 threadId、turnId、error、willRetry。willRetry 为 true 时应等待客户端自身恢复。
- 错误类型包括 responseStreamDisconnected、responseTooManyFailedAttempts、contextWindowExceeded、usageLimitExceeded、unauthorized 等，可优先按枚举分类。
- ThreadResumeParams 描述明确：同一 App Server 内正在运行的 threadId 会重新加入已有任务；非运行任务则加载保存的会话。
- TurnStartParams 有 clientUserMessageId，但本轮未确认其去重保证，不能仅凭该字段宣称 exactly-once。
- 本机帮助提供 `codex app-server proxy --sock <SOCKET_PATH>`，以及 Unix socket 连接入口。

关键待验证项是桌面应用是否暴露可用控制 socket、CLI 与桌面协议是否兼容、能否在同一服务实例读取并订阅目标任务，以及续跑是否在原界面一致呈现。启动另一个 App Server 再加载同名历史，不等于接管原应用的活跃会话。

Codex hooks 可作为事件补充，官方文档列有 UserPromptSubmit、Stop、Interrupt、PreCompact、PostCompact 等。本轮读取的事件表没有 Claude 式 StopFailure，不能跨工具假设事件完全相同。

来源：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[Codex hooks](https://learn.chatgpt.com/docs/hooks)。本机 schema 由 `codex app-server generate-json-schema --out <temporary-directory>` 生成，未请求模型。

### Claude Code

官方文档将正常 Stop 与 API 失败 StopFailure 分开；PreCompact/PostCompact 可提供压缩阶段信号。StopFailure 是通知事件，不能简单照搬正常 Stop 的阻止结束返回值实现恢复。

建议 hooks 将事件交给本地恢复核心，再由明确绑定的 tmux pane / 受管 PTY 发送续跑。无头模式与 Agent SDK 可用于督工创建的会话，CLI 支持指定 session ID 恢复及流式 JSON，但不能据此推断任意现有 TUI 都能被后台 SDK 接管。

当前本机 2.1.63 的帮助已确认 resume、input-format stream-json、output-format stream-json；StopFailure 等最新 hooks 是否支持尚未验证。

来源：[Claude hooks](https://code.claude.com/docs/en/hooks)、[程序化运行 Claude Code](https://code.claude.com/docs/en/headless)。

### Grok Build

官方提供 `grok agent stdio` 的 ACP 接口：通过 JSON-RPC 发送 session/prompt，通过 session/update 接收内容；另有指定会话恢复和 streaming-json 无头输出。

官方 hooks 文档列有 StopFailure、PreCompact、PostCompact；被动事件的 stdout 被忽略。因此，同样需要独立执行续跑的控制通道。不能因兼容 Claude 配置，就认为字段名称和决策语义一致；Grok 文档使用 sessionId/hookEventName 等字段。

建议受管会话用 ACP；保留原 TUI 体验的会话使用 hooks + 定向终端输入。现有任意 TUI 能否由 ACP 接管未证实。本机帮助存在 leader-socket 参数，但其存在不足以认定为可用的外部控制协议。

来源：[Grok Headless & Scripting](https://docs.x.ai/build/cli/headless-scripting)、[CLI reference](https://docs.x.ai/build/cli/reference)、[官方文档全文中的 Hooks 章节](https://docs.x.ai/llms.txt)。Hooks 独立页面本轮抓取失败，已从官方全文获取。

### 桌面和浏览器窗口

macOS 可通过 Accessibility 读取支持的 UI 属性、执行支持的动作，通过窗口信息确定动画位置。是否能读取输入框、区分任务、后台提交文本，必须逐应用测试；Apple 明确允许返回属性不支持、未实现或通信失败。

若没有稳定控制接口，先做“选定窗口 + 用户触发一次续跑”。自动模式需要进一步验证任务身份、输入框空白状态、焦点及提交结果。仅有窗口标题不能可靠区分同一个窗口里的多个任务。

浏览器版本留作独立适配器：优先页面结构和指定标签页身份，视觉识别作为补充。当前没有调研或验证 Grok/Claude 网页的具体 DOM，不承诺网页版首版可用。

来源：[Apple Accessibility 属性写入](https://developer.apple.com/documentation/applicationservices/1460434-axuielementsetattributevalue)、[窗口信息](https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo(_:_:))。

## 恢复核心建议

用确定性事件和状态机处理已知故障，首版不增加一个持续调用大模型的判断器。事件监听、错误分类与动画可在断网时继续工作；真正的续跑仍依赖原工具和上游恢复。

建议状态：running、compacting、internal_retry、recoverable_failure、cooldown、sending、verifying、completed、waiting_user、manual_stop、unknown。

| 场景 | 建议动作 |
| --- | --- |
| 客户端仍在内部重试 | 等待，不竞争发送 continue |
| 确认失败的网络请求或流中断 | 冷却后最多发起一次恢复，再检查实际运行状态 |
| 压缩期间临时网络失败 | 等待压缩终止，使用工具支持的重试/续跑路径验证 |
| contextWindowExceeded 或反复压缩失败 | 普通 continue 未必有效；采用单独压缩策略，仍失败交还用户 |
| 用量、会话预算耗尽或认证失效 | 不用 continue 绕过限制；等待恢复条件或用户处理 |
| 正常完成、等待决定、用户主动停止 | 保持暂停 |
| 只是长时间没有文字输出 | 标记不确定；不能单凭静默认定停工 |

首次建议采用 5、15、45 秒加随机扰动的有限退避，每个故障最多三次；这是待实验的初始参数，不是厂商要求。限流有明确 Retry-After 时优先遵循，整体断网时合并探测并错开多个任务的恢复。

每次动作绑定 provider、运行实例、session/thread ID、turn ID、pane/window 及进程代次，发送前复核状态。以同一故障事件建立去重记录；督工重启后先核对记录和最新会话状态。进程 ID、窗口 ID、pane ID 都可能复用。

提交超时属于“结果未知”：先读回是否已经收到输入，不直接重发。网络层 JSON-RPC id 是关联标识，不自动等同于服务端幂等键。人工输入或任务重启会取消旧的恢复计划。

成功应分三层呈现：指令已提交、任务已恢复执行、本轮已结束。HTTP 可访问、输入函数返回成功、出现一个 token 都不足以证明完整恢复；真实回合结果和再次压缩能力需要分别验收。

压缩请求返回成功仅表示请求被接受，应继续观察 compaction 完成或失败事件。恢复过程中保持原权限、模型和工作目录，默认不发 Ctrl+C、不清空上下文、不新建替代任务。

## 桌面与动画技术选择

| 路线 | 判断 |
| --- | --- |
| Electron + TypeScript + Canvas | 推荐首版；参考项目直接匹配，Node 易对接协议和终端；需实测后台资源占用 |
| Swift/AppKit + SpriteKit | 若长期限定 macOS，值得考虑；原生窗口及辅助功能接入直接，但跨平台需另做 |
| Tauri + Rust + Web UI | 可作后续候选；透明窗口在 macOS 涉及 macOSPrivateApi 配置，不能只按安装包大小选型 |

Electron 原生支持透明窗口、置顶及鼠标事件穿透。建议每个显示器一个无焦点动画层，静止时按需渲染，动画时启动帧循环；设置页与动画层分开。窗口移动、缩放和多屏坐标转换须验收。

轻量 Swift 辅助进程只负责窗口定位和需要的 Accessibility 操作，协议控制优先走直接通道。暂不需要 React、完整游戏引擎或持续全屏 OCR；Canvas 足以实现首版角色和鞭子。

来源：[Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)、[Tauri 配置](https://v2.tauri.app/ja/reference/config/)。框架优先级是本项目的工程判断，没有在本轮比较内存和 CPU。

## 创意如何与真实功能结合

建议把“窗口边缘的小督工”作为核心形象，动作表达实际状态：

- 正常执行：蹲在窗口角落，偶尔看工单。
- 网络失败但正在内置重试：检查断开的网线，显示等待动作。
- 可以外部续跑：靠近目标窗口，扬鞭，在指令提交时落鞭。
- 恢复执行：窗口边缘闪一次电流，督工记录复工。
- 恢复仍失败：收鞭、挂上故障牌，显示下次尝试或需要用户处理的原因。
- 正常完成：盖一个完工章；等待批准则举工单。

可以提供“手动抽一鞭”和“自动巡逻”。二者共用恢复规则和目标校验，动画事件不直接注入键盘。窗口不可见时显示托盘反馈，避免为了播放动画切换工作区或抢焦点。音效可关闭。

## 建议实施顺序与验收

1. **Codex 接入探针**：验证目标 App Server 的发现、版本、只读状态与事件订阅；确认是桌面现用实例。在单独测试会话验证准确一次续跑及原 UI 一致性。失败则明确采用受管 CLI 或窗口适配，不声称桌面已接通。
2. **终端恢复闭环**：选择 Claude Code 的一个明确 tmux pane，验证实际 hook 事件、输出读取、发送 continue、人工输入竞争和回执；之后接入 Grok，相同状态机、不同适配器。
3. **状态机与故障注入**：用模拟事件覆盖内部重试、断流、压缩失败、认证、限流、人工停止、等待批准、重复事件、提交后断开与恢复核心重启。对真实会话的断网实验使用隔离进程或测试代理，不改用户全机网络。
4. **角色动画闭环**：选定目标、位置跟随、扬鞭、提交、恢复与失败反馈；检验输入穿透、多屏、全屏和后台资源占用。

首版建议：macOS；Codex 优先；Claude Code/Grok Build 支持经测试的终端接入；一个角色、一套鞭子动作、托盘管理、按任务启停、有限重试、最近恢复记录。任意窗口自动接管、跨平台、网页版本和复杂角色商店不列为首版已承诺能力。

首轮原型的退出标准是：在两个目标同时存在的情况下，失败任务收到且只收到一次续跑，正常任务和用户输入不被干扰；能证明任务继续执行并准确标记后续成功或失败。随后再验证压缩恢复。

## 尚未完成的验证

- Codex Desktop 当前实例的控制 socket 可用性与协议兼容性。
- Claude Code 2.1.63、Grok 1.0.13 实际故障/压缩 hook 覆盖。
- 三个工具发送 continue 后，针对不同压缩错误的真实恢复行为。
- 任意现有终端、桌面输入框及后台窗口的定向操作能力。
- 多屏全屏动画、CPU/内存、打包签名和升级兼容性。

本轮成果是源码与文档支持的技术路线，不能视为以上能力已通过运行验收。
