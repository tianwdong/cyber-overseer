# 应用更新 / App updates

0.1.2 的 macOS 和 Windows 安装包均包含更新提醒。旧版 0.1.0 macOS、0.1.1 Windows 安装包不包含此功能，需要先从 [发布页面](https://github.com/tianwdong/cyber-overseer/releases/tag/v0.1.2) 手动升级一次。

Both macOS and Windows installers for 0.1.2 include update reminders. Older 0.1.0 macOS and 0.1.1 Windows installers need a one-time manual upgrade from the [release page](https://github.com/tianwdong/cyber-overseer/releases/tag/v0.1.2).

- 启动后检查，并约每 6 小时检查一次；设置里的“立即检查”可手动刷新，连续请求至少间隔一分钟。可取消“自动检查应用更新”并保存。
- 显示当前版本、上次成功检查时间以及新版本入口。应用在后台时，同一版本的系统提醒只发送一次；面板内可选择稍后查看。网络失败不会显示“已是最新”，也不影响任务看护。
- 使用当前操作系统、CPU 架构和已上传的安装包匹配更新。当前项目包含预览版，因此同时检查预览版；忽略草稿、仅有源码的版本，以及其他系统的安装包。
- 发现新版本后自动下载当前设备的安装包，在应用内显示进度和失败重试。校验 SHA-256 后提供“打开安装包”；不会自动安装或重启。安装包保存在应用用户数据目录的 updates 子目录；重启后会重新校验已有文件再复用。
- 匿名请求公开的安装包、校验文件和 [GitHub Releases API](https://docs.github.com/en/rest/releases/releases#list-releases)，不传任务、对话、账号、额度或本地路径，不读取 GitHub 登录凭据。网络服务会像正常网页访问一样获得 IP 等连接信息。缓存仅保存在本机督工配置目录。

Checks run after launch and about every six hours. Settings provides a manual check and an automatic-check toggle; repeated requests are limited to once a minute. A failed check never claims the app is up to date. Background notifications are remembered per version across restarts.

Only published releases with an uploaded installer for the current OS and architecture qualify, including previews. Updates download automatically with progress and retry controls. SHA-256 verification must succeed before the app offers to open the installer. Installation is manual; no task content or account data is sent. GitHub receives normal connection metadata such as the IP address.

0.1.11 起支持应用内自动下载。0.1.10 及更早版本仍沿用原有更新入口，需要手动升级到 0.1.11 一次，此后更新会自动下载。

In-app downloads start with 0.1.11. Older versions retain their existing update link; upgrade to 0.1.11 once to receive automatic downloads for subsequent releases.
