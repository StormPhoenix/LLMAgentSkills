---
name: stock-data
description: 查询 A 股/港股/美股的实时行情、K 线、财务数据、资金流向、涨跌排行，纯 HTTP 只读查询，数据源为东方财富与腾讯证券
---

# Stock Data — 股票数据查询 📈

纯 HTTP 实现，无外部依赖。数据源：东方财富（A 股）+ 腾讯证券（港股/美股）。所有功能均为**只读查询**。

## 股票代码格式

市场前缀必须带上：沪市 `sh600519`、深市 `sz000001`、港股 `hk00700`、美股 `usAAPL`

## 查询命令参考

调用形式：`stock_query({ command, args })`。

### search — 搜索股票
用户提到股票名称时，先 search 获取代码，再用代码查询。
- `search 茅台` / `search 腾讯`

### quote — 实时行情
- `quote sh600519` / `quote hk00700,usAAPL`（逗号分隔多只）

### kline — K 线数据
格式：`kline <代码> [周期] [数量] [复权]`
- 周期：day/week/month/season/year/m1/m5/m15/m30/m60/m120
- 复权：qfq(前复权)/hfq(后复权)，默认不复权
- 例：`kline sh600519 day 20 qfq`

### minute — 分时数据
- `minute sh600519`

### finance — 财务数据（仅 A 股）
- `finance sh600519 summary` — 基本面摘要（PE/PB/ROE/毛利率等）
- `finance sh600519 income` — 利润表
- `finance sh600519 balance` — 资产负债表
- `finance sh600519 cashflow` — 现金流量表

### profile — 公司简况（仅 A 股）
- `profile sh600519`

### news — 新闻资讯（仅 A 股）
- `news sh600519` / `news sh600519 1 10`

### fund — 资金流向（仅 A 股）
- `fund sh600519` / `fund sh600519 10`（最近 10 天主力资金）

### rank — 涨跌排行
- `rank up 20` — 涨幅前 20
- `rank down 10` — 跌幅前 10
- `rank volume 20` / `rank amount 20`

## 使用原则

1. 用户说股票名称时，先 `search` 获取代码，再用代码查询
2. 查到的数据直接分析总结，不创建临时脚本
3. 简洁呈现，涨用红色描述、跌用绿色描述
4. 数据来自非官方公开接口，若查询失败或返回异常，坦诚告知用户"暂时查不到"，**不要编造行情数据**
