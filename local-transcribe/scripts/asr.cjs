'use strict';

// scripts/asr.cjs — 本地转录 Skill 执行脚本
// 通过 HTTP 调用配置的转录服务 REST API
// 只使用 Node 内置模块，无第三方依赖

const http = require('http');
const https = require('https');
const url = require('url');

// ─── 配置读取 ─────────────────────────────────────────────────

/**
 * 从 context.getConfig(key) 读取用户在 Settings 中配置的值。
 * context.getConfig 由 SkillRegistry 注入，对应 manifest.yaml 的 configs[] 定义。
 */
function getConfig(context) {
  const serviceUrl = (
    context.getConfig ? String(context.getConfig('serviceUrl') || '') : ''
  ).replace(/\/$/, '') || 'http://localhost:8765';

  const timeoutMs = context.getConfig
    ? Number(context.getConfig('timeoutMs') || 0) || 600000
    : 600000;

  return { serviceUrl, timeoutMs };
}

// ─── HTTP 工具函数 ────────────────────────────────────────────

/**
 * 发起 HTTP/HTTPS 请求，返回 Promise<{ statusCode, body }>
 */
function request(options, bodyStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lib = options.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf-8'),
        })
      );
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`请求超时（${timeoutMs}ms）`));
    });

    req.on('error', reject);

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * GET 请求
 */
async function httpGet(baseUrl, path, timeoutMs) {
  const parsed = new url.URL(baseUrl + path);
  return request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
    },
    null,
    timeoutMs
  );
}

/**
 * POST JSON 请求
 */
async function httpPost(baseUrl, path, payload, timeoutMs) {
  const parsed = new url.URL(baseUrl + path);
  const body = JSON.stringify(payload);
  return request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
    timeoutMs
  );
}

// ─── 工具实现 ─────────────────────────────────────────────────

/**
 * transcribe_check_env — 检查转录服务环境
 */
async function checkEnv(context) {
  const { serviceUrl, timeoutMs } = getConfig(context);

  let res;
  try {
    res = await httpGet(serviceUrl, '/api/env', Math.min(timeoutMs, 10000));
  } catch (err) {
    return {
      reachable: false,
      model_loaded: false,
      ffmpeg_available: false,
      device: 'unknown',
      error: `服务不可达：${err.message}。请确认转录服务已启动，并检查 Skill 配置中的服务地址是否正确。`,
    };
  }

  if (res.statusCode !== 200) {
    return {
      reachable: false,
      model_loaded: false,
      ffmpeg_available: false,
      device: 'unknown',
      error: `服务返回异常状态码：${res.statusCode}`,
    };
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    return {
      reachable: true,
      model_loaded: false,
      ffmpeg_available: false,
      device: 'unknown',
      error: '服务响应解析失败，返回内容非合法 JSON',
    };
  }

  return {
    reachable: true,
    model_loaded: data.model_loaded === true,
    ffmpeg_available: data.ffmpeg_available === true,
    device: data.device || 'unknown',
  };
}

/**
 * transcribe — 转录本地音视频文件
 */
async function transcribe(input, context) {
  const { file_path, output_format = 'txt', language = 'auto' } = input;

  // 参数校验
  if (!file_path || typeof file_path !== 'string') {
    return { success: false, error: 'file_path 不能为空，且必须是本地绝对路径' };
  }
  if (!['txt', 'srt'].includes(output_format)) {
    return { success: false, error: `output_format 只支持 "txt" 或 "srt"，收到：${output_format}` };
  }
  if (!['auto', 'zh', 'en'].includes(language)) {
    return { success: false, error: `language 只支持 "auto" / "zh" / "en"，收到：${language}` };
  }

  let serviceUrl, timeoutMs;
  ({ serviceUrl, timeoutMs } = getConfig(context));

  // 快速检查服务是否就绪（5 秒超时）
  try {
    const envRes = await httpGet(serviceUrl, '/api/health', 5000);
    if (envRes.statusCode === 200) {
      const health = JSON.parse(envRes.body);
      if (health.model_loaded === false) {
        return {
          success: false,
          error: '推理模型尚未加载完成，请等待服务初始化后重试（首次启动通常需要 30-60 秒）',
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      error: `服务不可达：${err.message}。请确认转录服务已启动，并检查 Skill 配置中的服务地址是否正确。`,
    };
  }

  // 发起转录请求（长超时）
  let res;
  try {
    res = await httpPost(
      serviceUrl,
      '/api/transcribe',
      { file_path, output_format, language },
      timeoutMs
    );
  } catch (err) {
    return { success: false, error: `转录请求失败：${err.message}` };
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    return {
      success: false,
      error: `服务响应解析失败（HTTP ${res.statusCode}）：${res.body.slice(0, 200)}`,
    };
  }

  if (res.statusCode !== 200 || !data.success) {
    return { success: false, error: data.error || `服务返回错误（HTTP ${res.statusCode}）` };
  }

  return {
    success: true,
    text: data.text,
    duration_seconds: data.duration_seconds,
    language_detected: data.language_detected,
    elapsed_seconds: data.elapsed_seconds,
    format: data.format || output_format,
  };
}

// ─── 入口分发 ─────────────────────────────────────────────────

async function execute(input, context) {
  switch (context.toolName) {
    case 'transcribe_check_env':
      return checkEnv(context);
    case 'transcribe':
      return transcribe(input, context);
    default:
      return { success: false, error: `未知工具：${context.toolName}` };
  }
}

module.exports = { execute };
