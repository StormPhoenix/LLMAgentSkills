---
name: json-formatter
description: 将 JSON 文件按标准格式（2 空格缩进）格式化并写回，支持自定义缩进和另存为新路径
---

# JSON Formatter — JSON 格式化工具 🗂️

将 JSON 文件内容解析后以规范格式重新写入，适合整理压缩 JSON、统一缩进风格或在提交前格式化配置文件。

## 使用场景

- "格式化这个 json 文件" → `format_json_file({ inputPath: "data.json" })`
- "把 config.json 格式化，用 4 空格缩进" → `format_json_file({ inputPath: "config.json", indent: 4 })`
- "格式化 input.json 并另存为 output.json" → `format_json_file({ inputPath: "input.json", outputPath: "output.json" })`

## 注意事项

- 若 JSON 内容不合法，会报告解析错误，**不会修改**原文件
- 默认使用 2 空格缩进，输出末尾追加换行符
- `outputPath` 未指定时覆盖原文件；指定后原文件保持不变
- riskLevel 为 MODERATE，因为会写入文件系统
