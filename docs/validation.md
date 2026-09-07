# 验证记录 / Validation record

更新 / Updated: 2026-09-07

| 范围 / Scope | 证据 / Evidence |
| --- | --- |
| 类型与测试 / Types and tests | 类型检查与 119 项测试通过；119 tests and type checking passed. |
| macOS 实机 / Real macOS | 已验证任务发现、实时状态读取和一次真实网络故障恢复；task discovery, live status, and one real network-failure recovery verified. |
| App / DMG | 包内 Python／SQLite、界面演练、镜像完整性、签名结构校验通过；bundled runtime, UI exercises, image integrity, and signature structure checked. |
| 适配版本 / Adapter versions | Desktop `26.901.41123`, bundled Codex `0.153.3`. |

仍待验收：Windows、干净 Mac、旧系统、真实压缩故障，以及连续三次真实断网耗尽重试上限。贴边拖动演练出现过偶发失败，复跑通过，尚未认定根治。

Still pending: Windows, clean Macs, older systems, real compaction failures, and three consecutive real network failures exhausting the retry limit. Edge-dragging exercises have intermittently failed and passed on rerun; the issue is not considered resolved.

内部 IPC 不属于稳定公开 API。用户手动继续与自动发送存在竞态边界，不承诺完全无人值守。Ad-hoc 签名不等于 Apple 公证。

Internal IPC is not a stable public API. Manual continuation can race with automatic dispatch; fully unattended operation is not guaranteed. Ad-hoc signing is not Apple notarization.

## README 演示 / README demo

`recovery-zh.gif` 与 `recovery-en.gif` 是 12 秒模拟流程，复用实际角色绘制代码。任务卡片和状态时间线为文档演示，不连接 Codex，不发送恢复指令，也不是实际窗口定位或故障恢复的录像。截图中的任务、额度和结果同样来自演练数据。

The 12-second GIFs reuse the app’s character renderer with a simulated task card and timeline. They do not connect to Codex or send requests and are not recordings of real window location or recovery. Dashboard and inbox screenshots also use demo data.

重新生成 / Regenerate (requires project dependencies, Electron and ffmpeg):

```sh
node scripts/build-readme-visuals.mjs
```

CI 界面演练使用离屏 Chromium，隔离真实鼠标与模拟事件，检查渲染和模拟交互。它不覆盖原生窗口鼠标捕获、跨应用焦点或实际桌面拖动验收。Windows 单元测试不把 POSIX 权限位当作 ACL 证明。

CI UI exercises use offscreen Chromium to isolate native pointer input. They validate rendering and simulated interaction, not native capture, cross-app focus, or real desktop dragging. POSIX mode assertions are not Windows ACL validation.

## 首版发布检查 / Initial release checks

[macOS 与 Windows CI](https://github.com/tianwdong/cyber-overseer/actions/runs/34113291268) 在代码版本 `90ea0a5` 上通过：类型检查、119 项测试、构建与界面演练。Windows 真机 Codex 恢复仍未验收。

Both CI platforms passed type checking, 119 tests, builds and UI exercises at `90ea0a5`. Real Windows Codex recovery remains unverified.

额度卡遮挡贴边拖动区域已修复，四角色双侧拖出与残影检查通过。本机原生窗口完整演练此前通过，但最新复跑停在移动轨迹检查；原生动作演练稳定性仍待改进。

The quota card no longer covers edge drag handles; all four characters passed both-edge dragging and stale-pixel checks. The full native exercise passed earlier, but the latest rerun failed the travel-trajectory check. Native animation exercise stability remains pending.

## Windows 安装包 / Windows installer — v0.1.1

[Windows 安装流水线](https://github.com/tianwdong/cyber-overseer/actions/runs/34115707925) 已通过：119 项测试、NSIS x64 构建、中文及空格目录安装、移除开发 Python 后启动安装版、内置 Python 路径检查、双语界面及角色拖动演练、卸载和 SHA-256 生成。

The Windows pipeline passed 119 tests, NSIS x64 packaging, installation to a Unicode path with spaces, installed-app startup without developer Python on PATH, bundled-runtime verification, bilingual UI and simulated character dragging, uninstallation, and SHA-256 generation.

安装程序未代码签名。CI 使用 Windows 托管构建机和模拟任务，不覆盖用户 Windows 11 干净机器、真实 Codex IPC、真实故障恢复、Defender 或多屏缩放验收。

The installer is unsigned. Hosted Windows CI uses simulated tasks; it does not validate a clean user Windows 11 system, real Codex IPC/recovery, Defender, or multi-monitor scaling.
