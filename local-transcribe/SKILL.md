---
name: local-transcribe
description: >
  本地视频/音频转录服务，将媒体文件转换为文字或字幕。
  基于本地运行的 Qwen3-ASR-0.6B 模型，支持中文、英文及自动语言检测，无需联网。
  触发词：「转录」「语音识别」「字幕」「视频转文字」「音频转文字」「听写」。
  ⚠️ 转录为极耗时操作（数分钟），必须通过提交异步任务执行，不可同步等待结果。
  所有转录任务均为异步：提交后立即返回 job_id，结果通过查询或后台轮询获取。
metadata:
  toolbox:
    type: skill
---

# 本地转录服务

将本地音频或视频文件转录为文字或字幕，离线运行，数据不出本机。
基于 Qwen3-ASR-0.6B，支持 mp4 / mkv / avi / mp3 / m4a / wav。

## 核心约束（必读）

**转录任务不在 Chat 中等待结果。** 转录一个视频可能需要数分钟，在 Agent 循环中持续轮询会消耗所有迭代次数。

**正确路径有两条，优先级如下：**

---

### 路径一（首选）：直接创建后台任务

用户说"帮我转录这个文件"时，**不调用任何工具**，直接向用户提供 Daemon Task 脚本模板，让后台任务全权负责提交 + 轮询 + 写文件。

适用：所有情况，特别是大文件、用户不需要立即看到结果。

---

### 路径二（备用）：MCP 提交 + 一次探测 + 降级

仅当用户**明确要求"现在立即提交"**，或服务环境未知需要先确认，才走此路径：

1. `transcribe_check_env` 确认服务就绪（可选，若已知就绪可跳过）
2. `submit_transcribe_job` 提交任务，拿到 `job_id`
3. **调用一次** `check_transcribe_job(job_id)` 做即时探测：
   - `status=done`：任务已完成（极短音频），直接返回结果给用户
   - `status=queued/running`：**立即停止，不再轮询**，告知用户 `job_id`，提供 Daemon Task 脚本，用"轮询已有 job_id"模板（见下方）让后台接管
   - 提交失败（网络错误等）：同样提供 Daemon Task 脚本，后台自行重试

**绝对禁止**：在 Chat 中多次调用 `check_transcribe_job` 循环等待结果。

---

## 工具一览

| 工具 | 用途 |
|------|------|
| `transcribe_check_env` | 检查服务环境（模型是否加载、ffmpeg 是否可用）|
| `submit_transcribe_job` | 提交转录任务，立即返回 `job_id`（路径二使用）|
| `check_transcribe_job` | 探测任务状态，最多调用一次；或用户主动询问已知 job_id 的进度 |
| `list_transcribe_jobs` | 用户主动要求查看历史任务时使用 |

## 使用场景与操作指引

### 场景 1：用户要转录一个视频/音频文件（默认路径）

**直接提供 Daemon Task 脚本**，无需调用任何工具：

> 转录需要在后台异步执行，我来帮你创建一个后台任务：
>
> 1. 打开「后台任务」→ 新建任务 → 选「程序」类型
> 2. 粘贴下方脚本，修改顶部 `FILE_PATH` 后保存
> 3. 点击「立即运行」，在实时日志中查看进度，完成后自动写入文件

然后提供下方「完整转录模板」。

### 场景 2：提交后首次探测未完成 → 降级到后台任务

`submit_transcribe_job` 返回后，`check_transcribe_job` 探测到 `status=queued/running`，立即告知：

> 任务已提交（job_id: `asr_xxxxxxxx`），正在排队/转录中。
> 为避免长时间占用对话，我来帮你创建一个后台任务来等待这个任务完成：

然后提供下方「轮询已有 job_id 模板」，将 `EXISTING_JOB_ID` 填入对应值。

### 场景 3：用户主动询问某个已知 job_id 的进度

直接调用 `check_transcribe_job(job_id="asr_xxxxxxxx")`，返回结果给用户，不做循环。

### 场景 4：用户想查看所有转录记录

调用 `list_transcribe_jobs()`。

### 场景 5：用户要转录后保存文件

Daemon Task 脚本中 `SAVE_TO_FILE = true` 已自动处理。若用户不用 Daemon，转录完成后调用 `file-write` Skill 写文件。

## Daemon Task 脚本模板

### 完整转录模板（路径一 / 场景 1 使用）

```javascript
/**
 * 转录 Daemon Task 脚本
 * 修改下方配置区后保存，点击「立即运行」
 */
const FILE_PATH     = '/abs/path/to/your_video.mp4'  // 要转录的文件（绝对路径）
const OUTPUT_FORMAT = 'txt'                           // 'txt' 或 'srt'
const LANGUAGE      = 'auto'                          // 'zh' / 'en' / 'auto'
const ASR_SERVER    = 'http://localhost:8765'          // ASR Server 地址
const SAVE_TO_FILE  = true                            // true = 转录完成后写入同目录
const SUMMARIZE     = false                           // true = 完成后让 LLM 总结

module.exports = async function execute(ctx) {
  const http = require('http'), https = require('https')
  const fs = require('fs'), path = require('path')

  function req(method, url, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null
      const u = new URL(url)
      const mod = u.protocol === 'https:' ? https : http
      const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }
      const r = mod.request(opts, (res) => {
        let raw = ''
        res.on('data', c => raw += c)
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) } catch(e) { reject(e) } })
      })
      r.on('error', reject)
      if (data) r.write(data)
      r.end()
    })
  }

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms)
      ctx.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('任务已取消')) }, { once: true })
    })
  }

  // Step 1: 检查服务
  ctx.log('检查 ASR Server...')
  const health = await req('GET', `${ASR_SERVER}/api/health`)
  if (!health.body.model_loaded) throw new Error('ASR 模型未加载，请先启动服务')
  ctx.log('服务就绪 ✓')

  // Step 2: 提交任务
  if (!fs.existsSync(FILE_PATH)) throw new Error(`文件不存在：${FILE_PATH}`)
  ctx.log(`提交转录任务：${FILE_PATH}`)
  const submit = await req('POST', `${ASR_SERVER}/api/jobs`, { file_path: FILE_PATH, output_format: OUTPUT_FORMAT, language: LANGUAGE })
  if (!submit.body.success) throw new Error(`提交失败：${submit.body.error}`)
  const jobId = submit.body.job_id
  ctx.log(`任务已提交 ✓  job_id=${jobId}`)

  // Step 3: 轮询进度（无超时上限）
  let lastStatus   = ''
  let lastProgress = null
  while (true) {
    await sleep(10000)
    const poll = await req('GET', `${ASR_SERVER}/api/jobs/${jobId}`)
    if (poll.status === 404) throw new Error('任务记录丢失（服务可能已重启），请重新提交')
    const job = poll.body
    const statusChanged   = job.status !== lastStatus
    const progressChanged = (job.progress || null) !== lastProgress
    if (statusChanged || progressChanged) {
      if (job.status === 'queued') {
        ctx.log('状态：排队中...')
      } else if (job.status === 'running') {
        const detail = job.progress ? `正在转录...（${job.progress}）` : '正在转录...'
        ctx.log(`状态：${detail}`)
      }
      lastStatus   = job.status
      lastProgress = job.progress || null
    }
    if (job.status === 'done') {
      ctx.log(`转录完成 ✓  时长=${job.duration_seconds}s  耗时=${job.elapsed_seconds}s`)
      if (SAVE_TO_FILE) {
        const name = path.basename(FILE_PATH, path.extname(FILE_PATH))
        const out  = path.join(path.dirname(FILE_PATH), `${name}.${OUTPUT_FORMAT}`)
        fs.writeFileSync(out, job.text, 'utf-8')
        ctx.log(`已保存：${out}`)
      }
      if (SUMMARIZE) {
        ctx.log('开始 LLM 总结...')
        const summary = await ctx.callLLM(`请总结以下转录内容的核心要点（200字以内）：\n\n${job.text.slice(0, 4000)}`)
        ctx.log('总结完成')
        return summary
      }
      return `✓ 转录完成 → ${job.text.slice(0, 100)}...`
    }
    if (job.status === 'error') throw new Error(`转录失败：${job.error_message}`)
  }
}
```

### 轮询已有 job_id 模板（路径二降级 / 场景 2 使用）

当 `submit_transcribe_job` 已提交成功但首次探测未完成时，使用此模板。将 `EXISTING_JOB_ID` 替换为实际 job_id：

```javascript
/**
 * 轮询已有 ASR 任务模板
 * 适用于：已通过 submit_transcribe_job 提交，但尚未完成的任务
 * 修改 EXISTING_JOB_ID 和 OUTPUT_PATH 后保存，点击「立即运行」
 */
const EXISTING_JOB_ID = 'asr_xxxxxxxx'              // 替换为实际 job_id
const OUTPUT_PATH     = '/abs/path/to/output.txt'   // 结果写入路径（含文件名）
const ASR_SERVER      = 'http://localhost:8765'      // ASR Server 地址
const SUMMARIZE       = false                        // true = 完成后让 LLM 总结

module.exports = async function execute(ctx) {
  const http = require('http'), https = require('https')
  const fs = require('fs')

  function req(method, url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      const mod = u.protocol === 'https:' ? https : http
      const r = mod.request({ hostname: u.hostname, port: u.port, path: u.pathname, method }, (res) => {
        let raw = ''
        res.on('data', c => raw += c)
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) } catch(e) { reject(e) } })
      })
      r.on('error', reject)
      r.end()
    })
  }

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms)
      ctx.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('任务已取消')) }, { once: true })
    })
  }

  ctx.log(`开始轮询任务：${EXISTING_JOB_ID}`)
  let lastStatus   = ''
  let lastProgress = null
  while (true) {
    await sleep(10000)
    const poll = await req('GET', `${ASR_SERVER}/api/jobs/${EXISTING_JOB_ID}`)
    if (poll.status === 404) throw new Error('job_id 不存在，服务可能已重启，任务丢失')
    const job = poll.body
    const statusChanged   = job.status !== lastStatus
    const progressChanged = (job.progress || null) !== lastProgress
    if (statusChanged || progressChanged) {
      if (job.status === 'queued') {
        ctx.log('状态：排队中...')
      } else if (job.status === 'running') {
        const detail = job.progress ? `正在转录...（${job.progress}）` : '正在转录...'
        ctx.log(`状态：${detail}`)
      }
      lastStatus   = job.status
      lastProgress = job.progress || null
    }
    if (job.status === 'done') {
      ctx.log(`转录完成 ✓  时长=${job.duration_seconds}s  耗时=${job.elapsed_seconds}s`)
      fs.writeFileSync(OUTPUT_PATH, job.text, 'utf-8')
      ctx.log(`已保存：${OUTPUT_PATH}`)
      if (SUMMARIZE) {
        const summary = await ctx.callLLM(`请总结以下转录内容的核心要点（200字以内）：\n\n${job.text.slice(0, 4000)}`)
        ctx.log('总结完成')
        return summary
      }
      return `✓ 转录完成 → ${OUTPUT_PATH}`
    }
    if (job.status === 'error') throw new Error(`转录失败：${job.error_message}`)
  }
}
```

## 服务启动方式

```bash
cd /path/to/McpServerManager/servers/qwen-asr
./start.sh --daemon    # 后台运行（推荐）
./start.sh             # 前台运行（调试）
```

## Skill 配置

在 ToolBox Settings → Skill 配置中设置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 转录服务地址 | ASR Server 根地址 | `http://localhost:8765` |

## 注意事项

- 服务返回 `model_loaded: false` 时，说明模型尚未完成加载（首次启动约需 30 秒），稍等后重试
- 语言参数：`zh`（中文）、`en`（英文）、`auto`（自动检测）
- 输出格式：`txt`（纯文字，适合阅读）、`srt`（含时间戳，适合字幕）
- Job 记录持久化于 `~/.mcp-server-manager/qwen-asr/jobs/`，服务重启后历史 done/error 任务仍可查询
- 最多保留最近 50 条已完成任务，超出后自动清理最旧记录
