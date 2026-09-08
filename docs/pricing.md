# 独立价格表

补给卡中的「价格表」按钮会在 Finder 中定位运行时价格表：

`~/Library/Application Support/Cyber Overseer/pricing.json`

保存后约 5 秒内热加载，无须重新编译或重启。模型按完整 ID 精确匹配，新增模型直接在 `models` 中增加一项。用量数据与价格分离，更新价格会按新表重新折算已有用量；这表示当前标准 API 单价下的等价估算，不是历史实际账单，也不是订阅额度。

```json
{
  "version": 1,
  "currency": "USD",
  "unit": "per_million_tokens",
  "updatedAt": "2026-09-07",
  "models": {
    "gpt-6-astra": {
      "input": 10,
      "cached": 1,
      "cacheWrite": 12.5,
      "output": 50,
      "source": "https://developers.openai.com/api/docs/models/gpt-6-astra",
      "longContext": {
        "above": 272000,
        "input": 2,
        "cached": 2,
        "cacheWrite": 2,
        "output": 1.5
      }
    }
  }
}
```

金额单位都是美元／百万 token。`input` 对应未缓存、未写入缓存的普通输入；`cached` 对应缓存读取；`cacheWrite` 对应缓存写入；`output` 已包含日志中的推理输出，不能再加一次推理 token。`longContext` 是请求输入超过 `above` 时的倍率，超过才应用，而非任务累计 token 超过门槛。

原有模型应保留，只增加或修改需要维护的项。模型别名也必须显式添加，程序不会按前缀、版本号或名称相似度猜价格。有未定价用量的任务不展示虚假的完整费用。没有请求明细时无法精确恢复特殊计价；显示采用标准 API 文本 token 口径，不包含工具费用、Fast、Batch、Flex、区域加价及订阅实际扣费。

总览按事件保留已计价小计。`codex-auto-review` 等缺价模型不计入费用，Token、调用数和任务数仍保留，并在金额旁列明遗漏；全部记录都缺价时显示未计价，不伪装为零。用量约每两分钟增量更新，价格表刷新与用量扫描是两条独立链路。

无效 JSON、负数、非数值、错误单位、超过 1 MB 的表会被拒绝；程序及重启后都沿用 `pricing.json.last-good`，并在卡片显示价格表异常。程序不覆盖用户正在编辑的文件。初次启动才用仓库 `data/pricing.json` 创建种子表；之后运行时文件独立维护。升级程序不会覆盖运行时价格表。

本轮更新已核对官方页面：

- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models/gpt-5.6-sol
- https://developers.openai.com/api/docs/models/gpt-5.6-terra
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/models/gpt-5.5
- https://developers.openai.com/api/docs/models/gpt-5.4

其余旧模型保留 CodeBurn 数据来源；来源和更新时间不代表所有历史价格都经过此次官方复核。没有加入自动抓网页改价，避免网页布局变化静默污染价格表。
