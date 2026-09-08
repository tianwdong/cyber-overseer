# 原生 CLI 看护入口（本地开发）

Windows Codex 0.153.4 明确不支持 `app-server daemon` 生命周期命令。因此本次使用跨平台的官方远程 TUI 入口：由终端启动一个仅监听 `127.0.0.1` 的 app-server，然后启动原生 `codex --remote`。桌面端原有恢复路线保持独立。

## 使用与生命周期

面板点击“启动 CLI”，选择项目文件夹。macOS 打开 Terminal；Windows 打开 PowerShell。沿用当前 Codex 数据目录与认证，不改模型、审批、沙箱或账号配置。终端持有 app-server；退出督工不会停止终端工作。督工重开后读取自身的本机端点登记，重新发现已加载的根任务。

受控连接采用 capability token。令牌存放在当前用户的私有目录，通过环境变量提供给 TUI，通过 Authorization 头提供给督工；命令行和界面不显示令牌。Windows 会收紧该会话目录 ACL。启动脚本复制到真实文件系统，避免 Python 无法读取安装包 asar 内文件。

正常退出终端时删除端点和令牌，终止服务；服务不响应退出时再强制结束。macOS 终端挂断信号进入清理路径。异常断电或进程强杀后的残留目录不等于在线任务，仍必须完成认证及 loaded/root 检查。

## 自动恢复

只对已连接端点中已加载、完整 UUID 唯一归属的根任务启用。普通独立 CLI 不会通过新建 executor 接管；需要通过“启动 CLI”使用受控入口。同一个 ID 在多个端点出现时不发送。

读取 `thread/read` 与 `thread/turns/list`，明确失败后才允许 `thread/queue/add` 提交 continue。运行、等待用户、人工中断和正常完成不触发。压缩错误使用 continue，让原任务执行自身自动压缩。复用现有持久恢复记录、次数上限、冷却及不确定回执去重。队列回执仅表示提交被接收，新一轮任务状态才是恢复证据。

## 证据与边界

- 安装版本：本机 Codex CLI 0.153.4；参数与类型来自安装程序帮助及 `app-server generate-ts --experimental`。
- 真实只读探测：隔离空 CODEX_HOME 的认证 WebSocket 初始化、loaded list、HTTP readyz 均通过；没有模型调用。
- 协议模拟：精确任务 ID、认证头、忙碌/卸载拒绝、人工中断、队列回执丢失或不匹配不重发。
- 生命周期模拟：终端退出后删除端点与令牌；无响应服务终止超时后强制清理。
- 尚未验收：Windows 真机原生终端启动、真实网络故障自动恢复、真实审批交互，以及 CLI 终端的精确窗口定位。CLI 恢复不依赖窗口动画。
- 本地开发改动，尚未发布新安装包。不能把这次模拟测试描述为 Windows 完整恢复已验收。

官方协议参考：[Codex app-server](https://learn.chatgpt.com/docs/app-server)。接口为实验性适配，其他版本需要能力与协议验证。
