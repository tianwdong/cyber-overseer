# CodeBurn 本地源码深入核查

日期：2026-09-07。对象：`codeburn-main（本地源码快照）`，package.json 版本 0.9.19。结论仅针对这份本地快照，不代表远端最新版本。

## 结论

适合借鉴统计分层、时间周期切换、历史保留和可解释的数据覆盖提示；不建议整套调用其 CLI 作为督工统计后端。Codex 计量存在已复现的边界问题，且其部分产品指标与自动看护目标不同。

本轮未修改 CodeBurn 或督工业务代码。新增研究文档和隔离探针；没有扫描用户聊天正文做内容分析，没有修改 Codex 数据库或 rollout。

## 读过的链路

1. `src/providers/codex.ts`：发现 sessions 与 archived_sessions，解析 session_meta、turn_context、token_count、工具调用和编辑行数；输出标准调用记录。
2. `src/codex-cache.ts`：按路径、mtime、size 缓存整文件解析结果，版本 7，临时文件、fsync、rename 写入。
3. `src/parser.ts`：跨文件去重、通用会话缓存、调用归轮次、项目归一、缓存读回重新计价。
4. `src/session-cache.ts`：dev/ino/mtime/size 文件指纹，解析版本失效，完整扫描标记及增量协调。
5. `src/day-aggregator.ts`、`src/daily-cache.ts`、`src/usage-aggregator.ts`：日期归属、模型/项目/provider 分布，持久日统计和部分扫描保护。
6. `src/models.ts`：内置价格快照、网络价格缓存、别名、覆盖规则、未知模型提示。
7. `src/menubar-json.ts`、`src/overview.ts`、`src/web-dashboard.ts`、`app/renderer/sections/Overview.tsx`：统一展示载荷、费用/Token/缓存指标、趋势及产品评分。
8. 定向阅读 tests/providers/codex.test.ts、tests/codex-cache-invalidation.test.ts，以及日统计相关测试和配置；未声称完整阅读所有测试。

## 值得采用的实现

- 统计库存与监看库存分开：归档任务仍应参与历史用量，但不能因此开启自动恢复。
- 原始计量事实与价格解耦：通用缓存保存 Token、模型等事实，读回时计价（parser.ts:2504）；价格变化不必重新扫描原聊天。CodeBurn provider 层同时还缓存了费用，不能只复用其中一层。
- 分层缓存：未变化的文件不解析；按日物化统计；UI 只取聚合载荷。首次扫描与刷新均可显示进度。
- 历史保留：daily-cache 支持源文件已消失的历史贡献，标记 carried；部分扫描不覆盖较完整的旧数据；时区和配置变化触发重算。回填 365 天，保留 3650 天，这些期限不必照搬。
- 多口径展示：计价覆盖率、估算部分、缺价格模型与总费用同时解释，避免一个金额掩盖数据缺口。
- 缓存版本联动：修改 provider 解析不能只升级 codex-results 缓存版本，还要使外层 session-cache 失效。已有测试专门检查这个问题。

## 不能照搬的细节

### 1. Codex 并非按字节续读

codex-cache.ts:57 按 mtime/size 命中；providers/codex.ts:370 未命中后从头流式解析文件。通用 parseProviderSources（parser.ts:2785）把变更的 Codex 文件交回 provider。session-cache.ts:641 的 appended/readFromOffset 在 Claude 路径有具体消费（parser.ts:1986），不能因此推断 Codex 也实现了追加解析。

对督工：可以先用变更文件重算并放在后台；若长期大任务开销过大，再为 Codex 做携带累计基线、当前模型和完整行边界的检查点。不能仅保存字节 offset。

### 2. 两条不同的 last-only 记录被合并：已运行复现

providers/codex.ts:588 缺 total_token_usage 时累计值统一为 0，第二条只要也是 0 就跳过，无论 last_token_usage 是否不同。

探针输入分别为 500+200、100+50 Token，预期两条共 850，实际一条共 700。

tests/providers/codex.test.ts:463 的注释说两条应保留，但断言只要求长度 >=1，未覆盖这个漏计。相邻测试验证的是两条相同数据去重，不能替代不同数据的测试。

### 3. reasoning 输出计价口径：已运行复现并核对本机统计结构

providers/codex.ts:657 和 parser.ts:2506 都将 Codex outputTokens + reasoningTokens 用于输出计价。

隔离样例 input=100、output=50、reasoning=20 时，原解析器费用 0.000825；同一价格表只对 output=50 计价为 0.000625。这里仅比较公式，不主张该价格是当前官方价格。

本机当前任务只读结构检查：842 条累计快照全部满足 total_tokens=input_tokens+output_tokens，835 条 reasoning>0。对这份当前日志，reasoning 应作为输出内部拆分，不能再次加到费用。不能外推所有历史 Codex 版本都相同，适配器需明确支持的 schema。

### 4. 累计回退出现负用量：已运行复现

只有 cumulative、无 last 的样例从 input/output=100/50 回退到 10/5，原解析器第二条产生 input=0、output=-45。calculateCost 把负值截为 0，但标准调用记录仍有负 Token，聚合可能受影响。

应区分计数重置与新事件，缺少可靠增量时标为不完整；不能把负差值直接喂给排行。

### 5. 分叉去重依赖身份格式：条件性复现

providers/codex.ts:425 只取 session_id，否则用文件名；不读取 id。分叉 dedup 又使用 forked_from_id 命名空间。

用“只含 id 的父任务 + forked_from_id 指向这个 id”的样例，父事件和分叉重放事件没有碰撞，重复计入。当前本机所查任务同时含 session_id 与 id，因此这不是对当前所有会话已重复计费的断言。

此外分叉前 5 秒的时间窗口跳过属于启发式：不能作为可靠事实去重的唯一依据。应按实际版本的分叉关系、共享事件或累计基线核验，无法区分时显示不完整。

### 6. 日统计口径是整轮归属

day-aggregator.ts:86 把整轮调用归到该轮 timestamp 所在本地日期；session 数归到 firstTimestamp。跨午夜会导致下一天发生的消耗仍计入前一天。

这是一种可选产品口径，不是必然 bug。但我们若写“今日消耗”，建议按用量事件实际时间切日；所有卡片、趋势和排行必须一致。任务数则标注“当天有活动的任务”，不要混同“当天新建任务”。

### 7. 未计价不应是免费；综合效率分不等于质量

models.ts:779 在找不到价格时返回 0，其他层再标记 unpriced。我们应继续使用 null/未计价，并给出价格覆盖范围，避免消费者遗漏附带标记。

Overview.tsx:60 的效率分是 45% one-shot + 30% 缓存比例 + 25% 重试惩罚。它是手设权重，无法证明代码质量或目标完成，不建议搬进督工。

## 建议的督工统计结构

UsageEvent：完整 threadId、turnId（可用时）、事件时间、模型、非缓存输入、缓存输入、输出、reasoning 子项、计量来源与完整性、稳定去重身份。只取元数据。

FileCheckpoint：文件身份、完整行 offset、累计基线、当前模型、解析版本；变化不明时重算该文件，不能叠加旧贡献。

DailyUsage：统一时区与日期口径，按项目/模型可下钻，记录覆盖范围。UI 只消费聚合结果。已有任务恢复服务不等待统计扫描。

Pricing：继续使用督工独立价格表；保留版本和未计价列表；明确是按表估算，不能与订阅额度互相换算。

首批面板：今日用量（输入/输出/缓存）+ 近 7 天趋势 + 项目排行；随后模型分布、缓存占比、计价覆盖提示。不先上效率分、节省时间、自动换模型或配置优化。

## 运行证据与边界

- `artifacts/codeburn-audit/probe.mts` 通过本项目既有 tsx 直接导入 CodeBurn 原 provider，临时样例与缓存位于 mkdtemp，结束清理。
- `artifacts/codeburn-audit/probe.json` 保存上述四组计算结果。没有安装依赖、没有修改 CodeBurn。
- CodeBurn 本地没有 node_modules/.bin/vitest，本轮未运行其完整 Vitest 套件，也未运行完整桌面/CLI 扫描。本轮证据为源码追踪、相关测试审阅、原解析器隔离执行和本机日志数值结构检查。
- 本地 LICENSE 为 MIT；若后续复制代码，应保留相应版权许可文本。本轮未复制其实现到督工业务模块。
