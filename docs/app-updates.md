# 应用更新 / App updates

源码版本 0.1.2 增加更新提醒。已经发布的 0.1.0 macOS、0.1.1 Windows 安装包不包含此功能，需要先安装后续提供更新提醒的版本，或从源码运行。本次源码推送不等于发布了新安装包。

The feature is included in source version 0.1.2. Existing 0.1.0 macOS and 0.1.1 Windows installers do not include it. Install a later build with this feature, or run from source. A source push alone does not publish new installers.

- 启动后检查，并约每 6 小时检查一次；设置里的“立即检查”可手动刷新，连续请求至少间隔一分钟。可取消“自动检查应用更新”并保存。
- 显示当前版本、上次成功检查时间以及新版本入口。应用在后台时，同一版本的系统提醒只发送一次；面板内可选择稍后查看。网络失败不会显示“已是最新”，也不影响任务看护。
- 使用当前操作系统、CPU 架构和已上传的安装包匹配更新。当前项目包含预览版，因此同时检查预览版；忽略草稿、仅有源码的版本，以及其他系统的安装包。
- 点击入口打开本项目 GitHub Release 的更新说明与下载页。程序不自动下载、安装或重启。
- 只匿名请求公开的 [GitHub Releases API](https://docs.github.com/en/rest/releases/releases#list-releases)，不传任务、对话、账号、额度或本地路径，不读取 GitHub 登录凭据。网络服务会像正常网页访问一样获得 IP 等连接信息。缓存仅保存在本机督工配置目录。

Checks run after launch and about every six hours. Settings provides a manual check and an automatic-check toggle; repeated requests are limited to once a minute. A failed check never claims the app is up to date. Background notifications are remembered per version across restarts.

Only published releases with an uploaded installer for the current OS and architecture qualify, including previews. The download button opens this project's release page. Installation is manual; no task content or account data is sent. GitHub receives normal connection metadata such as the IP address.
