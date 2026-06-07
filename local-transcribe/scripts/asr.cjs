'use strict';

// scripts/asr.cjs — 本地转录 Skill 执行脚本
// 通过 HTTP 调用配置的转录服务 REST API
// 只使用 Node 内置模块，无第三方依赖

const http  = require('http');
const https = require('https');
const url   = require('url');

// ─── 配置读取 ─────────────────────────────────────────────────

function getConfig(context) {
  const serviceUrl = (
    context.getConfig ? String(context.getConfig('serviceUrl') || '') : ''
  ).replace(/\/$/, '') || 'http://localhost:8765';

  return { serviceUrl };
}

// ─── HTTP 工具函数 ────────────────────────────────────────────

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

function httpGet(baseUrl, path, timeoutMs) {
  const parsed = new url.URL(baseUrl + path);
  return request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port:     parsed.port,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
    },
    null,
    timeoutMs || 10000
  );
}

function httpPost(baseUrl, path, payload, timeoutMs) {
  const parsed = new url.URL(baseUrl + path);
  const body   = JSON.stringify(payload);
  return request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port:     parsed.port,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
    timeoutMs || 10000
  );
}

function httpDelete(baseUrl, path, timeoutMs) {
  const parsed = new url.URL(baseUrl + path);
  return request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port:     parsed.port,
      path:     parsed.pathname + parsed.search,
      method:   'DELETE',
    },
    null,
    timeoutMs || 10000
  );
}

function parseJson(raw, statusCode) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`服务响应解析失败（HTTP ${statusCode}）：${raw.slice(0, 200)}`);
  }
}

// ─── 工具实现 ─────────────────────────────────────────────────

/**
 * transcribe_check_env — 检查转录服务环境
 */
async function checkEnv(context) {
  const { serviceUrl } = getConfig(context);

  let res;
  try {
    res = await httpGet(serviceUrl, '/api/env', 10000);
  } catch (err) {
    return {
      reachable:         false,
      model_loaded:      false,
      ffmpeg_available:  false,
      device:            'unknown',
      error: `服务不可达：${err.message}。请确认转录服务已启动，并检查 Skill 配置中的服务地址是否正确。`,
    };
  }

  if (res.statusCode !== 200) {
    return {
      reachable:        false,
      model_loaded:     false,
      ffmpeg_available: false,
      device:           'unknown',
      error: `服务返回异常状态码：${res.statusCode}`,
    };
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    return {
      reachable:        true,
      model_loaded:     false,
      ffmpeg_available: false,
      device:           'unknown',
      error:            '服务响应解析失败，返回内容非合法 JSON',
    };
  }

  return {
    reachable:        true,
    model_loaded:     data.model_loaded      === true,
    ffmpeg_available: data.ffmpeg_available  === true,
    device:           data.device            || 'unknown',
  };
}

/**
 * submit_transcribe_job — 提交异步转录任务，立即返回 job_id
 */
async function submitTranscribeJob(input, context) {
  const { file_path, output_format = 'txt', language = 'auto' } = input;

  if (!file_path || typeof file_path !== 'string') {
    return { success: false, error: 'file_path 不能为空，且必须是本地绝对路径' };
  }
  if (!['txt', 'srt'].includes(output_format)) {
    return { success: false, error: `output_format 只支持 "txt" 或 "srt"，收到：${output_format}` };
  }
  if (!['auto', 'zh', 'en'].includes(language)) {
    return { success: false, error: `language 只支持 "auto" / "zh" / "en"，收到：${language}` };
  }

  const { serviceUrl } = getConfig(context);

  // 先确认服务就绪
  try {
    const health = await httpGet(serviceUrl, '/api/health', 5000);
    if (health.statusCode === 200) {
      const h = JSON.parse(health.body);
      if (h.model_loaded === false) {
        return {
          success: false,
          error:   '推理模型尚未加载完成，请等待服务初始化后重试（首次启动通常需要 30-60 秒）',
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      error:   `服务不可达：${err.message}。请确认转录服务已启动，并检查 Skill 配置中的服务地址是否正确。`,
    };
  }

  // 提交异步任务
  let res;
  try {
    res = await httpPost(
      serviceUrl,
      '/api/jobs',
      { file_path, output_format, language },
      10000
    );
  } catch (err) {
    return { success: false, error: `提交任务失败：${err.message}` };
  }

  let data;
  try {
    data = parseJson(res.body, res.statusCode);
  } catch (err) {
    return { success: false, error: err.message };
  }

  if (!data.success) {
    return { success: false, error: data.error || `服务返回错误（HTTP ${res.statusCode}）` };
  }

  return {
    success:  true,
    job_id:   data.job_id,
    status:   data.status,
    poll_url: data.poll_url,
  };
}

/**
 * check_transcribe_job — 查询转录任务进度/结果
 */
async function checkTranscribeJob(input, context) {
  const { job_id } = input;

  if (!job_id || typeof job_id !== 'string') {
    return { error: 'job_id 不能为空' };
  }

  const { serviceUrl } = getConfig(context);

  let res;
  try {
    res = await httpGet(serviceUrl, `/api/jobs/${encodeURIComponent(job_id)}`, 10000);
  } catch (err) {
    return { error: `查询失败：${err.message}` };
  }

  if (res.statusCode === 404) {
    return { error: `job_id 不存在：${job_id}（服务可能已重启，任务记录丢失）` };
  }

  let data;
  try {
    data = parseJson(res.body, res.statusCode);
  } catch (err) {
    return { error: err.message };
  }

  return data;
}

/**
 * list_transcribe_jobs — 列出所有转录任务
 */
async function listTranscribeJobs(context) {
  const { serviceUrl } = getConfig(context);

  let res;
  try {
    res = await httpGet(serviceUrl, '/api/jobs', 10000);
  } catch (err) {
    return { error: `查询失败：${err.message}` };
  }

  // 兼容：服务端 list_jobs 通过 MCP 暴露，REST 侧当前未单独提供 GET /api/jobs 列表接口
  // 若返回 404，提示用户通过 MCP 工具 list_jobs 查询
  if (res.statusCode === 404) {
    return {
      error: '列表接口不可用，请通过 MCP 工具 mcp__qwen-asr__list_jobs 查询，或逐个使用 check_transcribe_job 查询已知 job_id',
    };
  }

  let data;
  try {
    data = parseJson(res.body, res.statusCode);
  } catch (err) {
    return { error: err.message };
  }

  return data;
}

// ─── 入口分发 ─────────────────────────────────────────────────

async function execute(input, context) {
  switch (context.toolName) {
    case 'transcribe_check_env':
      return checkEnv(context);
    case 'submit_transcribe_job':
      return submitTranscribeJob(input, context);
    case 'check_transcribe_job':
      return checkTranscribeJob(input, context);
    case 'list_transcribe_jobs':
      return listTranscribeJobs(context);
    default:
      return { success: false, error: `未知工具：${context.toolName}` };
  }
}

module.exports = { execute };
