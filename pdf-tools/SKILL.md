---
name: pdf-tools
description: PDF 文件读取工具。支持按页范围分段读取 PDF 内容，适用于文档阅读、信息提取等场景。
metadata:
  craft:
    type: skill
---

# PDF 工具 📕

读取 PDF 文件的文本内容，支持按页范围分段读取。

## 使用场景

- "帮我读取这个 PDF 文件" → `read_pdf({ filePath: "文件路径" })`
- "读取 PDF 的前 5 页" → `read_pdf({ filePath: "文件路径", pages: "1-5" })`
- "读取 PDF 的全部内容" → `read_pdf({ filePath: "文件路径", pages: "all" })`

## 注意事项

- 对大文档建议先用 `pages: "1-10"` 读取开头，再按需读取
- PDF 中以图片形式存在的文本无法提取
- 仅支持读取，不支持创建或编辑 PDF
