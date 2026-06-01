'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MIN = 2200;
const DEFAULT_MAX = 2800;

/**
 * 统计文本中的中文字符数，过滤 Markdown 格式符号
 * 对应 Python count_chinese_words()
 */
function countChineseWords(text) {
  // 移除 Markdown 标题符号
  text = text.replace(/#{1,6}\s*/g, '');
  // 移除加粗、斜体、删除线，保留内容
  text = text.replace(/\*\*([\s\S]*?)\*\*/g, '$1');
  text = text.replace(/\*([\s\S]*?)\*/g, '$1');
  text = text.replace(/~~([\s\S]*?)~~/g, '$1');
  // 移除行内代码，保留内容
  text = text.replace(/`([^`]*?)`/g, '$1');
  // 移除链接，保留文字
  text = text.replace(/\[([\s\S]*?)\]\([\s\S]*?\)/g, '$1');
  // 统计 Unicode 汉字（\u4e00-\u9fff）
  const matches = text.match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

/**
 * 从章节文件中提取正文内容（跳过章节标题行）
 * 对应 Python extract_content_from_chapter()
 */
function extractContent(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let contentStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#') && lines[i].includes('章')) {
      contentStart = i + 1;
      break;
    }
  }
  return lines.slice(contentStart).join('\n');
}

/**
 * 检查单个章节文件
 * 对应 Python check_chapter()
 */
function checkChapter(filePath, minWords = DEFAULT_MIN, maxWords = DEFAULT_MAX) {
  if (!fs.existsSync(filePath)) {
    return {
      file: filePath,
      exists: false,
      wordCount: 0,
      status: 'error',
      message: `文件不存在: ${filePath}`,
    };
  }

  const content = extractContent(filePath);
  const wordCount = countChineseWords(content);

  let status, message;
  if (wordCount < minWords) {
    status = 'short';
    message = `字数: ${wordCount}（不足，需要至少 ${minWords} 字，建议参考 references/content-expansion.md 扩充）`;
  } else if (wordCount > maxWords) {
    status = 'long';
    message = `字数: ${wordCount}（超标，建议精简至 ${maxWords} 字以内，番茄短篇过长会降低完读率）`;
  } else {
    status = 'pass';
    message = `字数: ${wordCount}（达标，最佳区间 ${minWords}-${maxWords} 字）`;
  }

  return {
    file: filePath,
    exists: true,
    wordCount,
    status,
    message,
  };
}

/**
 * 批量检查目录下所有章节文件（匹配 "第*.md"）
 * 对应 Python check_all_chapters()
 */
function checkAllChapters(directory, minWords = DEFAULT_MIN, maxWords = DEFAULT_MAX) {
  if (!fs.existsSync(directory)) {
    return { error: `目录不存在: ${directory}` };
  }

  const files = fs.readdirSync(directory)
    .filter((f) => f.startsWith('第') && f.endsWith('.md'))
    .sort()
    .map((f) => path.join(directory, f));

  if (files.length === 0) {
    return { error: `目录下没有找到章节文件（格式：第*.md）: ${directory}` };
  }

  const results = files.map((f) => checkChapter(f, minWords, maxWords));

  // 汇总统计
  let totalWords = 0;
  let passed = 0, short = 0, long = 0, error = 0;
  for (const r of results) {
    if (!r.exists || r.status === 'error') { error++; continue; }
    totalWords += r.wordCount;
    if (r.status === 'pass') passed++;
    else if (r.status === 'short') short++;
    else if (r.status === 'long') long++;
  }

  return {
    directory,
    totalChapters: results.length,
    passed,
    short,
    long,
    error,
    totalWords,
    chapters: results,
    summary: `共 ${results.length} 章 | ${passed} 章达标 | ${short} 章不足 | ${long} 章超标 | 总字数: ${totalWords.toLocaleString()}`,
  };
}

/**
 * ToolBox 工具入口：execute(input, context)，工具名通过 context.toolName 分发
 */
async function execute(input, context) {
  const toolName = context && context.toolName;
  if (toolName !== 'check_wordcount') {
    return { error: `未知工具：${toolName}` };
  }

  const {
    path: targetPath,
    check_all = false,
    min_words = DEFAULT_MIN,
    max_words = DEFAULT_MAX,
  } = input;

  if (!targetPath) {
    return { error: '缺少必填参数 path' };
  }

  if (check_all) {
    return checkAllChapters(targetPath, min_words, max_words);
  }
  return checkChapter(targetPath, min_words, max_words);
}

module.exports = { execute };
