# Contributing

Source code is MIT licensed; character artwork is separately reserved. Read [LICENSE](LICENSE) and [asset terms](assets/ASSET-LICENSE.md) before redistributing a build.

For a bug report, include OS and Codex versions, reproduction steps, and redacted error text. Keep full task identity intact within implementation; never use titles or global keyboard focus to select a recovery target. Codex databases and rollout logs must remain read-only.

Run `npm run typecheck` and `npm test` for code changes. For UI changes, run `npm run smoke`, inspect screenshots, and distinguish simulations from real recovery evidence. Windows support requires Windows validation. Document known limitations rather than changing recovery rules to make a test pass.

角色素材不随源码授予 MIT 权利。提交代码前请运行相应检查，保持任务完整 ID 定位、Codex 数据只读，并将模拟验收与实机证据分开记录。
