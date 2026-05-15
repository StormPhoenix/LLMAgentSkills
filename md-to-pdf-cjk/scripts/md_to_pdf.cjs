// scripts/md_to_pdf.cjs
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 将 Markdown 转为简易 HTML（支持 CJK）
 */
function mdToHtml(md, title) {
  let html = md;

  // 表格处理
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (match, header, sep, body) => {
    const headers = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`);
    const rows = body.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`);
      return `<tr>${cells.join('')}</tr>`;
    });
    return `<table><thead><tr>${headers.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  });

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
  });

  // 标题
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 加粗、斜体、行内代码
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;">$1</code>');

  // 列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // 水平线
  html = html.replace(/^---+$/gm, '<hr>');

  // 段落
  html = html.replace(/^(?!<[a-z])((?!<\/)[^\n]+)$/gm, '<p>$1</p>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title || 'Document'}</title>
<style>
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Hiragino Sans GB", sans-serif;
    font-size: 12pt;
    line-height: 1.6;
    max-width: 210mm;
    margin: 20mm auto;
    padding: 0 15mm;
    color: #333;
  }
  h1 { font-size: 22pt; margin-top: 20pt; border-bottom: 2px solid #333; padding-bottom: 6pt; }
  h2 { font-size: 18pt; margin-top: 16pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
  h3 { font-size: 14pt; margin-top: 12pt; }
  h4 { font-size: 12pt; margin-top: 10pt; }
  pre {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 10pt;
  }
  code { font-family: "Consolas", "Courier New", monospace; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }
  th { background: #f0f0f0; font-weight: bold; }
  ul, ol { padding-left: 24px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
  @media print {
    body { margin: 0; padding: 15mm; }
  }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

/**
 * 查找系统中可用的 Chrome/Edge 浏览器路径
 */
function findBrowser() {
  const candidates = [
    // Windows Edge
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Windows Chrome
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

async function execute(input, context) {
  const { inputPath, outputPath, title } = input;

  if (!inputPath) {
    return { success: false, error: '缺少必需参数 inputPath' };
  }

  // 解析路径
  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    return { success: false, error: `输入文件不存在: ${resolvedInput}` };
  }

  const resolvedOutput = outputPath
    ? path.resolve(outputPath)
    : resolvedInput.replace(/\.md$/i, '.pdf');

  // 读取 Markdown
  const mdContent = fs.readFileSync(resolvedInput, 'utf-8');

  // 提取标题
  let docTitle = title;
  if (!docTitle) {
    const h1Match = mdContent.match(/^# (.+)$/m);
    docTitle = h1Match ? h1Match[1] : path.basename(resolvedInput, '.md');
  }

  // 转换为 HTML
  const htmlContent = mdToHtml(mdContent, docTitle);

  // 写入临时 HTML 文件
  const tmpHtml = resolvedOutput.replace(/\.pdf$/i, '.tmp.html');
  fs.writeFileSync(tmpHtml, htmlContent, 'utf-8');

  try {
    // 查找浏览器
    const browser = findBrowser();
    if (!browser) {
      const htmlOut = resolvedOutput.replace(/\.pdf$/i, '.html');
      fs.renameSync(tmpHtml, htmlOut);
      return {
        success: true,
        result: `未找到 Chrome/Edge 浏览器，已生成 HTML 文件: ${htmlOut}`,
        outputPath: htmlOut,
      };
    }

    // 使用 headless 浏览器打印 PDF
    const fileUrl = `file://${tmpHtml.replace(/\\/g, '/')}`;
    const cmd = `"${browser}" --headless --disable-gpu --no-sandbox --print-to-pdf="${resolvedOutput}" --print-to-pdf-no-header "${fileUrl}"`;
    execSync(cmd, { timeout: 30000, stdio: 'pipe' });

    // 清理临时文件
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);

    const stats = fs.statSync(resolvedOutput);
    return {
      success: true,
      result: `PDF 生成成功: ${resolvedOutput} (${(stats.size / 1024).toFixed(1)} KB)`,
      outputPath: resolvedOutput,
      size: stats.size,
    };
  } catch (e) {
    if (fs.existsSync(tmpHtml)) {
      try { fs.unlinkSync(tmpHtml); } catch (_) {}
    }
    return { success: false, error: `PDF 生成失败: ${e.message}` };
  }
}

module.exports = { execute };
