---
name: deep-research
description: |
  结构化深度调研工作流。支持学术调研、Benchmark 对比、技术选型、市场分析、尽职调查等场景。 通过 /research 生成调研大纲，/research-deep 并行搜索收集数据，/research-report 汇总报告。 当用户需要深度调研某个话题时使用此 Skill。
---
# Deep Research — 结构化深度调研工作流

提供人机协作的结构化调研能力，适用于需要系统性调研的场景。

## 核心命令

| 命令 | 说明 |
|------|------|
| `/research <topic>` | 初步调研，生成 outline.yaml + fields.yaml |
| `/research-deep` | 并行深度搜索，逐项收集数据 |
| `/research-report` | 汇总生成 Markdown 报告 |
| `/research-add-items` | 追加调研条目 |
| `/research-add-fields` | 追加调研字段 |

## 工作流程

```
/research "AI Agent 2025"
    ↓ 生成大纲（items + fields）
    ↓ 用户确认/修改
/research-deep
    ↓ 使用 web_search 逐项搜索
    ↓ 结果写入 results/
/research-report
    ↓ 汇总为 report.md
```

## 适用场景

- **学术调研**：论文综述、Benchmark 对比
- **技术选型**：框架评估、工具对比
- **市场调研**：竞品分析、行业趋势
- **尽职调查**：公司研究、投资分析

### 示例对话

- "帮我调研一下 2025 年主流 AI Agent 框架" → `/research "AI Agent 2025"`
- "深度调研一下特斯拉的商业模式" → `/research "Tesla 商业模式"`
- "对比一下 React 和 Vue 的优劣" → `/research "React vs Vue"`

## 注意事项

- 单次调研建议不超过 20 个条目，避免搜索时间过长
- 深度搜索阶段每个条目需 2-3 次 web_search，总耗时与条目数成正比
- 搜索失败的条目会标注 `[数据不足]`，不会阻断整个流程
- 断点续传：如果中途中断，重新执行 `/research-deep` 会跳过已完成的条目

## /research 流程

### Step 1: 内部知识生成框架
基于 topic，利用已有知识生成：
- 该领域的主要研究对象/items 列表
- 建议的调研字段框架
- 询问用户确认：items 列表是否需要增减？字段框架是否满足需求？

### Step 2: Web Search 补充
询问用户时间范围（如：最近 6 个月、2024 年至今、不限）。
使用 web_search 搜索补充最新 items 和推荐调研字段。

### Step 3: 生成 Outline
合并所有信息，生成两个文件：
- **outline.yaml**：items 列表 + execution 配置（batch_size、items_per_agent、output_dir）
- **fields.yaml**：字段分类和定义（每个字段含 name、description、detail_level）

保存到 `./{topic_slug}/` 目录。

## /research-deep 流程

1. 自动定位当前目录下的 `*/outline.yaml`
2. 断点续传：跳过已完成的 items
3. 对每个 item 使用 web_search 逐项深度搜索
4. 按 fields.yaml 定义的字段输出结构化 JSON 到 `results/` 目录
5. 不确定的字段值标注 `[不确定]`

## /research-report 流程

1. 读取 `results/` 下所有 JSON
2. 询问用户目录中需要显示哪些摘要字段
3. 使用 exec 生成 Python 转换脚本
4. 输出 `report.md`：目录（带锚点 + 摘要字段）+ 详细内容

## 输出结构

```
{topic_slug}/
├── outline.yaml    # 调研条目 + 执行配置
├── fields.yaml     # 字段定义
├── results/        # 逐项搜索结果 JSON
│   ├── item_1.json
│   └── ...
└── report.md       # 最终报告
```
