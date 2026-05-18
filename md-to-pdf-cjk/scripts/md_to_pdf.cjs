// scripts/md_to_pdf.cjs
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

/**
 * 逐行状态机：Markdown → HTML body
 * 比正则链式替换更健壮，避免模式间相互干扰
 */
function mdToHtmlBody(src) {
  const lines = src.split(/\r?\n/);
  let html = '';
  let inCode = false, codeLang = '', codeBuf = [];
  let inList = false, listType = '';
  let inTable = false, tableRows = [], tableAlign = [];
  let para = [];

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inlineFmt(t) {
    t = escapeHtml(t);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return t;
  }

  const flushPara = () => {
    if (para.length) {
      html += `<p>${inlineFmt(para.join(' '))}</p>\n`;
      para = [];
    }
  };
  const flushList = () => {
    if (inList) { html += `</${listType}>\n`; inList = false; listType = ''; }
  };
  const flushTable = () => {
    if (!inTable) return;
    html += '<table>\n';
    tableRows.forEach((row, i) => {
      const tag = i === 0 ? 'th' : 'td';
      html += '<tr>' + row.map((c, j) => {
        const a = tableAlign[j] || '';
        const sty = a ? ` style="text-align:${a}"` : '';
        return `<${tag}${sty}>${inlineFmt(c)}</${tag}>`;
      }).join('') + '</tr>\n';
    });
    html += '</table>\n';
    inTable = false; tableRows = []; tableAlign = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      if (!inCode) {
        flushPara(); flushList(); flushTable();
        inCode = true; codeLang = fence[1]; codeBuf = [];
      } else {
        html += `<pre><code class="language-${codeLang}">${escapeHtml(codeBuf.join('\n'))}</code></pre>\n`;
        inCode = false; codeBuf = [];
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // 空行
    if (/^\s*$/.test(line)) { flushPara(); flushList(); flushTable(); continue; }

    // 标题 h1-h6
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList(); flushTable();
      html += `<h${h[1].length}>${inlineFmt(h[2])}</h${h[1].length}>\n`;
      continue;
    }

    // 引用块
    if (/^>\s?/.test(line)) {
      flushPara(); flushList(); flushTable();
      html += `<blockquote>${inlineFmt(line.replace(/^>\s?/, ''))}</blockquote>\n`;
      continue;
    }

    // 水平线
    if (/^[-*_]{3,}\s*$/.test(line)) { flushPara(); flushList(); flushTable(); html += '<hr/>\n'; continue; }

    // 表格
    if (line.includes('|') && line.trim().startsWith('|')) {
      const nextLine = lines[i + 1] || '';
      if (!inTable && /^\s*\|?\s*:?-{2,}.*\|/.test(nextLine)) {
        flushPara(); flushList();
        inTable = true; tableRows = [];
        tableRows.push(line.split('|').slice(1, -1).map(s => s.trim()));
        tableAlign = nextLine.split('|').slice(1, -1).map(s => {
          s = s.trim();
          const l = s.startsWith(':'), r = s.endsWith(':');
          if (l && r) return 'center';
          if (r) return 'right';
          if (l) return 'left';
          return '';
        });
        i++;
        continue;
      } else if (inTable) {
        tableRows.push(line.split('|').slice(1, -1).map(s => s.trim()));
        continue;
      }
    } else if (inTable) {
      flushTable();
    }

    // 无序列表
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara(); flushTable();
      const t = ul ? 'ul' : 'ol';
      if (!inList || listType !== t) { flushList(); html += `<${t}>\n`; inList = true; listType = t; }
      html += `<li>${inlineFmt((ul || ol)[1])}</li>\n`;
      continue;
    } else if (inList) {
      flushList();
    }

    // 普通段落
    para.push(line.trim());
  }

  if (inCode) { html += `<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>\n`; }
  flushPara(); flushList(); flushTable();
  return html;
}

/**
 * 生成完整 HTML 文档（含 A4 打印样式）
 */
function buildHtmlDoc(mdContent, title) {
  const body = mdToHtmlBody(mdContent);
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
body {
  font-family: "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", sans-serif;
  font-size: 11pt;
  line-height: 1.7;
  color: #222;
  max-width: 100%;
}
h1 { font-size: 22pt; border-bottom: 2px solid #333; padding-bottom: 6px; margin-top: 0.6em; }
h2 { font-size: 17pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 1.2em; }
h3 { font-size: 14pt; margin-top: 1em; }
h4 { font-size: 12pt; margin-top: 0.8em; }
p { margin: 0.6em 0; text-align: justify; }
code {
  font-family: "Cascadia Mono", "Consolas", monospace;
  background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 0.92em;
}
pre {
  background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px;
  padding: 12px; overflow-x: auto; font-size: 9.5pt; line-height: 1.45;
  page-break-inside: avoid;
}
pre code { background: none; padding: 0; }
blockquote {
  border-left: 4px solid #dfe2e5; color: #555; margin: 0.8em 0;
  padding: 0.2em 1em; background: #fafafa;
}
table {
  border-collapse: collapse; width: 100%; margin: 1em 0;
  page-break-inside: avoid; font-size: 10pt;
}
th, td { border: 1px solid #d0d7de; padding: 6px 10px; }
th { background: #f6f8fa; font-weight: 600; }
ul, ol { padding-left: 1.6em; }
li { margin: 0.2em 0; }
a { color: #0969da; text-decoration: none; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.2em 0; }
img { max-width: 100%; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * 查找系统中可用的 Chrome/Edge 浏览器路径
 * Chrome 优先（headless 兼容性更好），Edge 作为备用
 */
function findBrowserCandidates() {
  const candidates = [
    // Chrome 优先
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    // Edge 备用
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  return candidates.filter(p => p && fs.existsSync(p));
}

/**
 * 用指定浏览器将 HTML 打印为 PDF，使用独立 user-data-dir 避免与运行中浏览器冲突
 */
function printToPdf(browserExe, fileUrl, outputPath) {
  const tmpProfile = path.join(os.tmpdir(), `browser-pdf-profile-${Date.now()}`);
  try {
    execFileSync(browserExe, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${tmpProfile}`,
      '--print-to-pdf-no-header',
      `--print-to-pdf=${outputPath}`,
      fileUrl,
    ], { timeout: 120000, stdio: 'pipe' });
  } finally {
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
  }
}

async function execute(input) {
  const { inputPath, outputPath, title } = input;

  if (!inputPath) {
    return { success: false, error: '缺少必需参数 inputPath' };
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    return { success: false, error: `输入文件不存在: ${resolvedInput}` };
  }

  const resolvedOutput = outputPath
    ? path.resolve(outputPath)
    : resolvedInput.replace(/\.md$/i, '.pdf');

  const mdContent = fs.readFileSync(resolvedInput, 'utf-8');

  let docTitle = title;
  if (!docTitle) {
    const h1Match = mdContent.match(/^# (.+)$/m);
    docTitle = h1Match ? h1Match[1] : path.basename(resolvedInput, '.md');
  }

  const htmlContent = buildHtmlDoc(mdContent, docTitle);
  const tmpHtml = resolvedOutput.replace(/\.pdf$/i, '.tmp.html');
  fs.writeFileSync(tmpHtml, htmlContent, 'utf-8');

  const browsers = findBrowserCandidates();

  if (browsers.length === 0) {
    const htmlOut = resolvedOutput.replace(/\.pdf$/i, '.html');
    fs.renameSync(tmpHtml, htmlOut);
    return {
      success: true,
      result: `未找到 Chrome/Edge 浏览器，已降级生成 HTML 文件: ${htmlOut}`,
      outputPath: htmlOut,
    };
  }

  const fileUrl = `file:///${tmpHtml.replace(/\\/g, '/')}`;
  const errors = [];

  for (const browser of browsers) {
    try {
      printToPdf(browser, fileUrl, resolvedOutput);
      if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
      const stats = fs.statSync(resolvedOutput);
      return {
        success: true,
        result: `PDF 生成成功: ${resolvedOutput} (${(stats.size / 1024).toFixed(1)} KB)`,
        outputPath: resolvedOutput,
        size: stats.size,
      };
    } catch (e) {
      errors.push(`${path.basename(browser)}: ${e.message}`);
    }
  }

  if (fs.existsSync(tmpHtml)) {
    try { fs.unlinkSync(tmpHtml); } catch (_) {}
  }

  return {
    success: false,
    error: `所有浏览器均失败:\n${errors.join('\n')}`,
  };
}

module.exports = { execute };
