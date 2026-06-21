---
name: xlsx-tools
description: Excel 电子表格（.xlsx）读取与创建。支持读取表格数据，以及从结构化数据生成新的 Excel 文件。
metadata:
  toolbox:
    type: skill
---

# Excel 工具 📊

读取 Excel 文件（.xlsx）的内容，或从结构化数据创建新的电子表格。

## 使用场景

- "帮我读取这个 Excel 表格" → `read_xlsx({ filePath: "文件路径" })`
- "读取表格的前 50 行" → `read_xlsx({ filePath: "文件路径", pages: "1-50" })`
- "根据以下数据创建一个 Excel 文件" → `create_xlsx({ filePath: "输出路径", data: [["姓名","年龄"],["张三",25]] })`

## 注意事项

- 读取返回纯文本形式的表格内容
- 创建表格时传入二维数组，第一行作为表头
- 示例数据格式：`[["姓名", "年龄"], ["张三", 25], ["李四", 30]]`
- `create_xlsx` 风险级别为 MODERATE，会覆盖已有文件
