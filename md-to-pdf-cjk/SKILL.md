---
name: md-to-pdf-cjk
description: 将 Markdown 文件转换为专业 PDF 文档，完整支持中日韩字符渲染，无需 LaTeX 或 wkhtmltopdf
metadata:
  clawpet:
    builtin: false
    version: "1.0.0"
    emoji: "📄"
    displayName: "Markdown转PDF"
    tools:
      - name: convert_md_to_pdf
        description: |
          将 Markdown 文件转换为 PDF 文档，支持中日韩文字。
          支持标题、加粗、斜体、列表、表格、代码块等 Markdown 元素。
          自动使用系统 Edge/Chrome 浏览器生成高质量 PDF。
        inputSchema:
          type: object
          properties:
            inputPath:
              type: string
              description: "输入的 Markdown 文件路径"
            outputPath:
              type: string
              description: "输出的 PDF 文件路径（可选，默认与输入同名 .pdf）"
            title:
              type: string
              description: "PDF 文档标题（可选，默认从 Markdown 第一个 H1 提取）"
          required:
            - inputPath
        riskLevel: MODERATE
        scriptEntry: scripts/md_to_pdf.cjs
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
