/**
 * read-xlsx — Excel 读取工具脚本
 */

const fs = require('fs')
const path = require('path')

async function execute(input, context) {
  const { filePath, pages = 'all' } = input
  if (!filePath) return { success: false, error: '缺少 filePath 参数' }
  if (!fs.existsSync(filePath)) return { success: false, error: `文件不存在: ${filePath}` }

  if (pages === 'all') {
    const result = await context.nativeTools.document.extractText(filePath)
    if (!result.success) return result
    return {
      success: true,
      content: result.text,
      range: 'all',
      metadata: {
        fileName: path.basename(filePath),
        contentLength: result.text.length,
      },
    }
  }

  const { start, end } = parseRange(pages)
  const result = await context.nativeTools.document.extractTextPaged(filePath, start, end)
  if (!result.success) return result
  return {
    success: true,
    content: result.content,
    range: result.rangeInfo,
    metadata: {
      fileName: path.basename(filePath),
      contentLength: result.content.length,
      totalLength: result.totalLength,
    },
  }
}

function parseRange(rangeStr) {
  if (typeof rangeStr !== 'string') return { start: 1, end: 1 }
  if (rangeStr.includes('-')) {
    const [s, e] = rangeStr.split('-').map(Number)
    if (isNaN(s) || isNaN(e)) return { start: 1, end: 1 }
    return { start: Math.max(1, s), end: Math.max(1, e) }
  }
  const n = Number(rangeStr)
  if (isNaN(n)) return { start: 1, end: 1 }
  return { start: Math.max(1, n), end: Math.max(1, n) }
}

module.exports = { execute }
