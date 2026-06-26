/**
 * text-transform 工具脚本
 * 文本处理工具箱：JSON 格式化、Base64、URL 编解码、哈希、字数统计等
 */
const crypto = require('crypto')

/** 输入文本长度上限（1MB） */
const INPUT_LIMIT = 1024 * 1024

function checkInput(input) {
  if (!input && input !== '') return '缺少 input 参数'
  if (typeof input !== 'string') return 'input 必须是字符串'
  if (input.length > INPUT_LIMIT) return `输入文本过长（${input.length} 字符），上限 ${INPUT_LIMIT}`
  return null
}

// ========== 各操作实现 ==========

function formatJson(input, indent = 2, compress = false) {
  const err = checkInput(input)
  if (err) return { success: false, error: err }

  try {
    const parsed = JSON.parse(input)
    const result = compress
      ? JSON.stringify(parsed)
      : JSON.stringify(parsed, null, indent)
    return {
      success: true,
      action: 'format_json',
      result,
      originalLength: input.length,
      resultLength: result.length,
    }
  } catch (e) {
    return { success: false, error: `JSON 解析失败: ${e.message}` }
  }
}

function base64Encode(input) {
  const err = checkInput(input)
  if (err) return { success: false, error: err }
  const result = Buffer.from(input, 'utf-8').toString('base64')
  return { success: true, action: 'base64_encode', result }
}

function base64Decode(input) {
  const err = checkInput(input)
  if (err) return { success: false, error: err }
  try {
    const result = Buffer.from(input, 'base64').toString('utf-8')
    return { success: true, action: 'base64_decode', result }
  } catch (e) {
    return { success: false, error: `Base64 解码失败: ${e.message}` }
  }
}

function urlEncode(input) {
  const err = checkInput(input)
  if (err) return { success: false, error: err }
  return { success: true, action: 'url_encode', result: encodeURIComponent(input) }
}

function urlDecode(input) {
  const err = checkInput(input)
  if (err) return { success: false, error: err }
  try {
    return { success: true, action: 'url_decode', result: decodeURIComponent(input) }
  } catch (e) {
    return { success: false, error: `URL 解码失败: ${e.message}` }
  }
}

function hash(input, algorithm = 'md5') {
  const err = checkInput(input)
  if (err) return { success: false, error: err }
  const validAlgorithms = ['md5', 'sha256', 'sha512', 'sha1']
  if (!validAlgorithms.includes(algorithm)) {
    return { success: false, error: `不支持的算法: ${algorithm}。支持: ${validAlgorithms.join(', ')}` }
  }
  const result = crypto.createHash(algorithm).update(input, 'utf-8').digest('hex')
  return { success: true, action: 'hash', algorithm, result }
}

function wordCount(input) {
  const err = checkInput(input)
  if (err) return { success: false, error: err }

  const chars = input.length
  const lines = input.split('\n').length
  // 中文字符数
  const chineseChars = (input.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  // 英文单词数（连续字母/数字序列）
  const englishWords = (input.match(/[a-zA-Z0-9]+/g) || []).length
  // 总"词数"= 中文字符 + 英文单词
  const words = chineseChars + englishWords
  // 不含空白的字符数
  const charsNoSpace = input.replace(/\s/g, '').length

  return {
    success: true,
    action: 'word_count',
    characters: chars,
    charactersNoSpace: charsNoSpace,
    words,
    chineseCharacters: chineseChars,
    englishWords,
    lines,
    bytes: Buffer.byteLength(input, 'utf-8'),
  }
}

function regexExtract(input, pattern, flags = 'g') {
  const err = checkInput(input)
  if (err) return { success: false, error: err }
  if (!pattern) return { success: false, error: '缺少 pattern 参数' }

  try {
    const regex = new RegExp(pattern, flags)
    const matches = []
    let match
    if (flags.includes('g')) {
      while ((match = regex.exec(input)) !== null) {
        matches.push({
          match: match[0],
          groups: match.slice(1),
          index: match.index,
        })
        if (matches.length >= 100) break
      }
    } else {
      match = regex.exec(input)
      if (match) {
        matches.push({
          match: match[0],
          groups: match.slice(1),
          index: match.index,
        })
      }
    }
    return {
      success: true,
      action: 'regex_extract',
      pattern,
      flags,
      matchCount: matches.length,
      matches,
    }
  } catch (e) {
    return { success: false, error: `正则表达式错误: ${e.message}` }
  }
}

function generateUuid() {
  const uuid = crypto.randomUUID()
  return { success: true, action: 'uuid', result: uuid }
}

function caseConvert(input, to) {
  const err = checkInput(input)
  if (err) return { success: false, error: err }
  if (!to) return { success: false, error: '缺少 to 参数' }

  let result
  switch (to) {
    case 'upper':
      result = input.toUpperCase()
      break
    case 'lower':
      result = input.toLowerCase()
      break
    case 'capitalize':
      result = input.replace(/\b\w/g, c => c.toUpperCase())
      break
    case 'camel':
      result = input
        .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
        .replace(/^[A-Z]/, c => c.toLowerCase())
      break
    case 'snake':
      result = input
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase()
      break
    case 'kebab':
      result = input
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase()
      break
    default:
      return { success: false, error: `不支持的目标格式: ${to}。支持: upper, lower, capitalize, camel, snake, kebab` }
  }
  return { success: true, action: 'case_convert', to, result }
}

// ========== 入口 ==========

async function execute(input, context) {
  const { action } = input

  switch (action) {
    case 'format_json':
      return formatJson(input.input, input.indent, input.compress)
    case 'base64_encode':
      return base64Encode(input.input)
    case 'base64_decode':
      return base64Decode(input.input)
    case 'url_encode':
      return urlEncode(input.input)
    case 'url_decode':
      return urlDecode(input.input)
    case 'hash':
      return hash(input.input, input.algorithm)
    case 'word_count':
      return wordCount(input.input)
    case 'regex_extract':
      return regexExtract(input.input, input.pattern, input.flags)
    case 'uuid':
      return generateUuid()
    case 'case_convert':
      return caseConvert(input.input, input.to)
    default:
      return {
        success: false,
        error: `不支持的 action: ${action}。支持: format_json, base64_encode, base64_decode, url_encode, url_decode, hash, word_count, regex_extract, uuid, case_convert`,
      }
  }
}

module.exports = { execute }
