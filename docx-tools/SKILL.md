---
name: docx-tools
description: Word 文档（.docx）读取与创建。支持按段落分段读取文档，以及从 Markdown 生成新的 Word 文档。
metadata:
  craft:
    type: skill
---

# Word 工具 📃

读取 Word 文档（.docx）的文本内容，或从 Markdown 创建新的 Word 文档。

## 使用场景

- "帮我读取这个 Word 文档" → `read_docx({ filePath: "文件路径" })`
- "读取文档的前 20 段" → `read_docx({ filePath: "文件路径", pages: "1-20" })`
- "根据以下内容创建一个 Word 文档" → `create_docx({ filePath: "输出路径", content: "Markdown内容" })`

## 注意事项

- 对大文档建议先用 `pages: "1-20"` 读取开头段落
- 读取返回纯文本，原始排版可能有损失
- 创建文档时输入 Markdown 格式，支持标题、列表、加粗/斜体
- `create_docx` 风险级别为 MODERATE，会覆盖已有文件
