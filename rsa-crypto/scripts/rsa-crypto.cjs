/**
 * RSA 加密 Skill 脚本
 * 混合加密方案: AES-256-GCM + RSA-OAEP (SHA-256)
 * 
 * 密钥存储位置: ~/.craft/rsa-keys/
 * 密钥索引文件: ~/.craft/rsa-keys/keystore.json
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')

// ── 路径安全检查 ───────────────────────────────────────────────

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const SYSTEM_DIR_PATTERNS = [
  // Windows
  /^[A-Z]:\\Windows\b/i,
  /^[A-Z]:\\Program Files\b/i,
  /^[A-Z]:\\Program Files \(x86\)\b/i,
  /^[A-Z]:\\ProgramData\b/i,
  /^[A-Z]:\\Recovery\b/i,
  /^[A-Z]:\\System Volume Information\b/i,
  /^[A-Z]:\\Boot\b/i,
  // Unix / macOS
  /^\/usr\b/,
  /^\/bin\b/,
  /^\/sbin\b/,
  /^\/etc\b/,
  /^\/var\b/,
  /^\/sys\b/,
  /^\/proc\b/,
  /^\/boot\b/,
]

function validatePath(filePath) {
  const resolved = path.resolve(filePath)
  for (const pattern of SYSTEM_DIR_PATTERNS) {
    if (pattern.test(resolved)) {
      return { ok: false, error: `禁止操作系统目录: ${resolved}` }
    }
  }
  return { ok: true, path: resolved }
}

// ── 密钥存储 ───────────────────────────────────────────────────

function getRsaKeysDir() {
  return path.join(os.homedir(), '.craft', 'rsa-keys')
}

function ensureDir() {
  const dir = getRsaKeysDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readStore() {
  ensureDir()
  const p = path.join(getRsaKeysDir(), 'keystore.json')
  if (!fs.existsSync(p)) return { keys: [] }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return { keys: [] }
  }
}

function writeStore(store) {
  ensureDir()
  fs.writeFileSync(
    path.join(getRsaKeysDir(), 'keystore.json'),
    JSON.stringify(store, null, 2),
    'utf-8'
  )
}

function getKeyFilePath(id, ext) {
  return path.join(getRsaKeysDir(), `${id}.${ext}`)
}

function ensureBuiltinKey() {
  const store = readStore()
  if (store.keys.some(k => k.id === 'builtin-default')) return
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  ensureDir()
  fs.writeFileSync(getKeyFilePath('builtin-default', 'pub.pem'), publicKey, 'utf-8')
  fs.writeFileSync(getKeyFilePath('builtin-default', 'key.pem'), privateKey, 'utf-8')
  store.keys.push({
    id: 'builtin-default',
    name: '默认密钥 (内置)',
    type: 'pair',
    bits: 2048,
    createdAt: new Date().toISOString(),
    isBuiltin: true,
  })
  writeStore(store)
}

function getPublicKeyPem(id) {
  const p = getKeyFilePath(id, 'pub.pem')
  if (!fs.existsSync(p)) throw new Error(`公钥文件不存在: ${id}`)
  return fs.readFileSync(p, 'utf-8')
}

function getPrivateKeyPem(id) {
  const p = getKeyFilePath(id, 'key.pem')
  if (!fs.existsSync(p)) throw new Error(`私钥文件不存在: ${id}`)
  return fs.readFileSync(p, 'utf-8')
}

// ── 混合加密/解密核心 ──────────────────────────────────────────

function encryptBuffer(plain, publicPem) {
  const aesKey = crypto.randomBytes(32)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const authTag = cipher.getAuthTag()
  const encKey = crypto.publicEncrypt(
    { key: publicPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  )
  const header = Buffer.alloc(2)
  header.writeUInt16BE(encKey.length, 0)
  return Buffer.concat([header, encKey, iv, authTag, ciphertext])
}

function decryptBuffer(packed, privatePem) {
  if (packed.length < 2) throw new Error('密文数据过短')
  const encKeyLen = packed.readUInt16BE(0)
  let offset = 2
  if (packed.length < offset + encKeyLen + 12 + 16) throw new Error('密文数据损坏：长度不足')
  const encKey = packed.subarray(offset, offset + encKeyLen); offset += encKeyLen
  const iv = packed.subarray(offset, offset + 12); offset += 12
  const authTag = packed.subarray(offset, offset + 16); offset += 16
  const ciphertext = packed.subarray(offset)
  const aesKey = crypto.privateDecrypt(
    { key: privatePem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    encKey
  )
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// ── 工具实现 ───────────────────────────────────────────────────

function getDefaultKeyId(context) {
  if (context.getConfig) {
    const configured = String(context.getConfig('defaultKeyId') || '')
    if (configured) return configured
  }
  return 'builtin-default'
}

function getDefaultBits(context) {
  if (context.getConfig) {
    const configured = String(context.getConfig('defaultKeyBits') || '2048')
    return parseInt(configured, 10) || 2048
  }
  return 2048
}

async function handleListKeys() {
  ensureBuiltinKey()
  const store = readStore()
  return { success: true, keys: store.keys }
}

async function handleEncryptText(input, context) {
  const { plaintext, keyId } = input
  if (!plaintext) return { success: false, error: '缺少 plaintext 参数' }
  const resolvedKeyId = keyId || getDefaultKeyId(context)
  ensureBuiltinKey()
  try {
    const publicPem = getPublicKeyPem(resolvedKeyId)
    const packed = encryptBuffer(Buffer.from(plaintext, 'utf-8'), publicPem)
    return { success: true, cipherBase64: packed.toString('base64'), keyId: resolvedKeyId }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleDecryptText(input, context) {
  const { cipherBase64, keyId } = input
  if (!cipherBase64) return { success: false, error: '缺少 cipherBase64 参数' }
  const resolvedKeyId = keyId || getDefaultKeyId(context)
  ensureBuiltinKey()
  try {
    const privatePem = getPrivateKeyPem(resolvedKeyId)
    const packed = Buffer.from(cipherBase64, 'base64')
    const plain = decryptBuffer(packed, privatePem)
    return { success: true, plaintext: plain.toString('utf-8'), keyId: resolvedKeyId }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleGenerateKeypair(input, context) {
  const { name, bits } = input
  if (!name) return { success: false, error: '缺少 name 参数' }
  const resolvedBits = bits || getDefaultBits(context)
  if (resolvedBits !== 2048 && resolvedBits !== 4096) {
    return { success: false, error: 'bits 只支持 2048 或 4096' }
  }
  const id = crypto.randomUUID()
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: resolvedBits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  ensureDir()
  fs.writeFileSync(getKeyFilePath(id, 'pub.pem'), publicKey, 'utf-8')
  fs.writeFileSync(getKeyFilePath(id, 'key.pem'), privateKey, 'utf-8')
  const entry = { id, name, type: 'pair', bits: resolvedBits, createdAt: new Date().toISOString(), isBuiltin: false }
  const store = readStore()
  store.keys.push(entry)
  writeStore(store)
  return { success: true, key: entry }
}

async function handleEncryptFile(input, context) {
  const { inputPath, outputPath, keyId } = input
  if (!inputPath) return { success: false, error: '缺少 inputPath 参数' }

  const inputCheck = validatePath(inputPath)
  if (!inputCheck.ok) return { success: false, error: inputCheck.error }

  const resolvedOutput = outputPath || (inputPath + '.enc')
  const outputCheck = validatePath(resolvedOutput)
  if (!outputCheck.ok) return { success: false, error: outputCheck.error }

  if (!fs.existsSync(inputCheck.path)) {
    return { success: false, error: `源文件不存在: ${inputCheck.path}` }
  }

  const stat = fs.statSync(inputCheck.path)
  if (stat.size > MAX_FILE_SIZE) {
    return { success: false, error: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，限制 50MB` }
  }

  const resolvedKeyId = keyId || getDefaultKeyId(context)
  ensureBuiltinKey()
  try {
    const publicPem = getPublicKeyPem(resolvedKeyId)
    const plainBuffer = fs.readFileSync(inputCheck.path)
    const packed = encryptBuffer(plainBuffer, publicPem)
    fs.writeFileSync(outputCheck.path, packed)
    return { success: true, outputPath: outputCheck.path, size: packed.length }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleDecryptFile(input, context) {
  const { inputPath, outputPath, keyId } = input
  if (!inputPath) return { success: false, error: '缺少 inputPath 参数' }

  const inputCheck = validatePath(inputPath)
  if (!inputCheck.ok) return { success: false, error: inputCheck.error }

  let resolvedOutput = outputPath
  if (!resolvedOutput) {
    resolvedOutput = inputPath.endsWith('.enc') ? inputPath.slice(0, -4) : inputPath + '.dec'
  }
  const outputCheck = validatePath(resolvedOutput)
  if (!outputCheck.ok) return { success: false, error: outputCheck.error }

  if (!fs.existsSync(inputCheck.path)) {
    return { success: false, error: `源文件不存在: ${inputCheck.path}` }
  }

  const stat = fs.statSync(inputCheck.path)
  if (stat.size > MAX_FILE_SIZE) {
    return { success: false, error: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，限制 50MB` }
  }

  const resolvedKeyId = keyId || getDefaultKeyId(context)
  ensureBuiltinKey()
  try {
    const privatePem = getPrivateKeyPem(resolvedKeyId)
    const packed = fs.readFileSync(inputCheck.path)
    const plainBuffer = decryptBuffer(packed, privatePem)
    fs.writeFileSync(outputCheck.path, plainBuffer)
    return { success: true, outputPath: outputCheck.path, size: plainBuffer.length }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ── 入口分发 ───────────────────────────────────────────────────

async function execute(input, context) {
  switch (context.toolName) {
    case 'rsa_list_keys':       return handleListKeys()
    case 'rsa_encrypt_text':    return handleEncryptText(input, context)
    case 'rsa_decrypt_text':    return handleDecryptText(input, context)
    case 'rsa_generate_keypair': return handleGenerateKeypair(input, context)
    case 'rsa_encrypt_file':    return handleEncryptFile(input, context)
    case 'rsa_decrypt_file':    return handleDecryptFile(input, context)
    default:
      return { success: false, error: `未知工具: ${context.toolName}` }
  }
}

module.exports = { execute }
