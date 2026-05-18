---
name: md-to-pdf-cjk
description: 将 Markdown 文件转换为专业 PDF 文档，完整支持中日韩字符渲染，无需 LaTeX 或 wkhtmltopdf
---

# MD to PDF — Markdown转PDF 📄

将 Markdown 文件转换为专业 PDF 文档，完整支持中日韩字符。

## 使用场景

- "把这个 md 文件转成 PDF" → `convert_md_to_pdf({ inputPath: "文件路径" })`
- "帮我把 report.md 导出为 PDF" → `convert_md_to_pdf({ inputPath: "report.md" })`
- "生成一个标题是'周报'的 PDF" → `convert_md_to_pdf({ inputPath: "weekly.md", title: "周报" })`

## 注意事项

- 使用系统中已安装的 Chrome 或 Edge（headless 模式）生成 PDF，无需额外安装
- Windows 优先使用 Edge，macOS/Linux 使用 Chrome
- 中文字体：Windows 使用微软雅黑，macOS 使用 PingFang SC，无需手动配置
- riskLevel 为 MODERATE，因为会写入文件系统
- 如果系统未找到 Chrome/Edge，会降级输出 HTML 文件
