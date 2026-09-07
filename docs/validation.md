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
