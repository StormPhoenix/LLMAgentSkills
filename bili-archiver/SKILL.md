---
name: bili-archiver
description: >
  触发词「下载B站视频」「监控UP主投稿」「批量下载B站」「B站视频归档」「B站转文字稿」。
  基于 yt-dlp + cookies 的 B 站视频下载与归档指南，覆盖单次下载、批量下载、
  周期性监控三类场景，沉淀 B 站特有的踩坑教训（HTTP 412、分 P 视频、清晰度选择、
  cookies 获取等）。本 Skill 不实现转录逻辑，需要转录时协同 local-transcribe Skill。
metadata:
  toolbox:
    type: skill
---

# B 站视频归档（bili-archiver）

> **本 Skill 是"指引型"，不暴露 MCP 工具，不提供完整代码模板。**
> 它教 AI 在 B 站下载场景下应该如何思考、按什么顺序工作、必须避开哪些坑。
> 具体代码由 AI 根据场景自主组合（用 `manage_daemon_task` 创建后台任务、
> 用 Node 内置模块写脚本逻辑等）。

## 何时激活此 Skill

满足以下任一条件时激活：

- 用户提到下载 / 归档 / 监控 B 站视频
- 用户给出 `bilibili.com/video/BV...` 或 `space.bilibili.com/...` 的 URL
- 用户希望"批量下载 UP 主投稿"或"定时检查新视频"
- 任何涉及 B 站长期视频归档的场景

不要激活的场景：

- 用户只是想看视频内容是什么（用 web-fetch 抓字幕/简介更轻量）
- 用户要下载的是非 B 站平台（YouTube、抖音等也用 yt-dlp，但不用本 Skill 的 cookies/分P 等踩坑指南）

## 前置条件

### 1. yt-dlp 工具

确认已安装：执行 `yt-dlp --version`。未安装时引导用户：
- macOS：`brew install yt-dlp`
- 其他平台：见 [yt-dlp 官方文档](https://github.com/yt-dlp/yt-dlp#installation)

### 2. B 站 cookies（必须，无可绕过）

**核心事实**：B 站对所有未登录请求强制返回 `HTTP 412 Precondition Failed`，
即使下载最低画质也必须带登录 cookies。修改 User-Agent / Referer 无济于事。

**首次获取 cookies 的标准流程**（一次性，让用户**在自己的终端手动执行**）：

```bash
yt-dlp --cookies-from-browser chrome \
       --cookies ~/.toolbox/bili_cookies.txt \
       --skip-download \
       "https://www.bilibili.com/video/BV1xx411c7mD"
```

执行要点（必须告知用户）：

- ⚠️ **macOS 首次执行会弹钥匙串授权弹窗**，必须点"始终允许"，否则脚本无法读取
- ⚠️ AI 通过 ToolBox 的 shell 工具执行此命令**通常无法触发 GUI 授权弹窗**——
  让用户自己在终端跑这一条
- `--skip-download` 表示只导出 cookies、不下载视频
- 后续所有 yt-dlp 命令都用 `--cookies ~/.toolbox/bili_cookies.txt` 复用此文件
- cookies 会过期（通常数月），失败再次出现 412 时让用户重跑此命令更新

如果用户使用 Firefox/Safari/Edge，把 `chrome` 替换为 `firefox` / `safari` / `edge` 即可。

### 3. 转录服务（仅"下载后转录"场景需要）

本 Skill **不负责** ASR 服务的搭建、调用、踩坑。
所有转录工作交由 `local-transcribe` Skill 完成。
工作流中涉及转录时，按 `local-transcribe` 的指引去做即可（包括其 HTTP 202、
轮询重试、崩溃恢复等具体细节）。

## B 站特有踩坑（本 Skill 的核心价值）

### 1. HTTP 412 = cookies 缺失

出现 412 一律检查 cookies 文件路径和有效性，**不要**折腾 User-Agent / Referer / 代理，
那些都是 yt-dlp 在通用网站的处理手段，对 B 站无效。

### 2. 分 P 视频的 ID 格式

yt-dlp 列出 UP 主投稿或多 P 视频时，每个分 P 会作为独立条目返回，
`%(id)s` 输出形如 `BV1xx411c7mD_p1`、`BV1xx411c7mD_p2`。

处理建议：

- **状态文件去重**：用正则 `id.replace(/_p\d+$/, '')` 规范化为纯 BVID 再 set 查重
- **下载单视频**：URL 后不带 `?p=N` 时加 `--no-playlist` 防 yt-dlp 自动展开整个合集
- **批量列投稿**：列出后按规范化后的 BVID 去重，否则会把同一视频的多个分 P 算成不同条目

### 3. 清晰度 selector 不可信

`worst` 这个语义在 B 站行为反直觉——遇到含音轨的格式列表时，可能选出码率反而较高的版本。
实测某个 90 分钟视频用 `worst[ext=mp4]/worst` 下载到了 946 MB，远高于真正的 360P。

**明确最低画质的写法**：

```
-f "30016+30216/30232+30216/worstvideo+worstaudio/worst"
```

含义：
- `30016` = 360P 视频流；`30216` = 64kbps 音频流
- `30232` = 480P 视频流（兜底）
- 后两段是兜底链：精确 ID 不可用 → 选最差视频+最差音频 → 再退到 worst

更高画质的 format ID（按需替换）：
`30032`=480P、`30064`=720P、`30080`=1080P、`30112`=1080P 高码率（4K HDR 等需大会员账号）。
用 `yt-dlp -F "URL"` 可列出某条视频实际可用的所有 format。

### 4. 文件名清洗

B 站标题常含 `/`、`：`、`*`、`?`、`"`、`<`、`>`、`|` 等字符。
- macOS/Linux 至少要清掉 `/`
- macOS Finder 显示时会把 `:` 渲染成 `/`（虽然 shell 里仍是 `:`），仍建议替换
- Windows 必须清掉所有 9 个保留字符

简单清洗 regex：`title.replace(/[\/\\:*?"<>|]/g, '_')`

字符截取按 Unicode 字符计数，不是字节：`Array.from(title).slice(0, N).join('')`。

### 5. yt-dlp 实际输出路径可能与 `-o` 参数不一致

合并视频/音频流后 yt-dlp 可能改名（加分辨率后缀、改扩展名等）。
靠 `fs.existsSync(expectedPath)` 判断成功会误报。

**可靠做法**：加 `--print "after_move:FILEPATH=%(filepath)s"`，
从 yt-dlp 输出捕获真实文件路径，再做后续处理。

## 设计原则（指引怎么思考，不给具体代码）

### 命名规范（强烈推荐）

格式：`{上传时间}_{标题前N字}_{BVID}.{ext}`

示例：`26_06_07-22-52-16_唠唠嗑连连麦_BV1wLEh6uEXC.mp4`

理由：

- **时间前置**：按文件名字典序即按时间排序
- **标题片段**：人类一眼可识别内容
- **BVID 后置**：唯一标识、便于去重、便于反查原视频
- **时间用北京时间**：B 站是国内平台，UTC 反直觉
- **冒号改连字符或下划线**：避免 macOS Finder 显示混淆

时间格式建议 `YY_MM_DD-HH-MM-SS`（北京时间），转录文本同名换扩展名 `.txt`。

### 状态文件（批量 / 定时场景必备）

在目标目录维护一个状态文件，记录每个 BVID 的处理进度。

- **文件名建议**：`seen.json`（**不要带 `.` 前缀**，避免 macOS Finder 隐藏，方便用户手动查看/编辑）
- **每条记录字段**：BVID、标题、上传时间戳、文件名 base、是否下载、是否转录、关联 asr_job_id
- **写入策略**：每条目处理完立即写盘（`tmp + rename` 原子写），防中途崩溃丢状态

### 自愈逻辑（建议加上）

每轮开始扫描目标目录：若某 BVID 的 .txt 文件已存在且非空，
自动把状态标记为 `transcribed=true`。
好处：用户手工塞了文字稿、上一轮残留、ASR 服务端跑完但脚本崩了——这些都能被识别，不会重复处理。

### 崩溃恢复（长任务建议）

转录是数十分钟到数小时的操作。脚本崩溃 / 重启后再次提交同文件 = 浪费时间。
推荐三步查重（提交新 ASR job 前）：

1. 看状态文件里这条记录的 `asr_job_id` 是否仍 `queued/running` → 接续轮询
2. 调 ASR 服务 `GET /api/jobs` 列出全部，按 `file_path` 匹配 → 复用已有 job
3. 都没找到才提交新 job

具体怎么调 ASR API → 看 `local-transcribe` 的指引。

## 典型工作流

### 场景 A：下载单个视频（一次性）

简单场景，**不需要后台任务**，AI 直接调用 shell 即可。

工作步骤：

1. 确认 cookies 文件存在（`~/.toolbox/bili_cookies.txt` 或用户指定路径）。
   不存在则按"前置条件 2"引导用户获取。
2. 用一条 yt-dlp 命令下载，参数包括 `--cookies`、`--no-playlist`、清晰度 spec、输出路径。
3. 若用户要转录，把视频文件路径交给 `local-transcribe` Skill。

### 场景 B：批量下载 UP 主最新 N 条（一次性）

视频可能很多、很大、耗时长，**应创建一次性 program 类型 Daemon Task**。

工作步骤：

1. 与用户确认：UP UID、下载目录、清晰度、批量数量 N、是否同时转录
2. 用 `manage_daemon_task` 创建一次性 program 任务（`relative_minutes` 启动）：
   - 列投稿：`yt-dlp --cookies ... --playlist-items 1-N --skip-download --print "..." "https://space.bilibili.com/<UID>/video"`
   - 列出后按 BVID 去重（注意分 P）
   - 逐条下载（注意 format spec、文件路径捕获）
   - 若需转录：参照 `local-transcribe` 调 ASR
3. 用 `register_daemon_callback` 注册：
   - `system-notify`：完成时通知用户
   - `enqueue-pending-message`：把结果回注当前会话，AI 可继续后续动作
4. 告知用户 Daemon Task ID，让其在「后台任务」面板查看实时日志

### 场景 C：周期性监控 UP 主新视频

与场景 B 类似，但 `schedule_kind=interval` 持续运行（如每 12 小时）。
**额外要求**：

- 必须维护 `seen.json` 状态文件（场景 B 是一次性的可省，但场景 C 不省会重复下载）
- 自愈逻辑（用户可能手动删旧视频节省空间）
- 崩溃恢复（长期跑总会遇到偶发 ASR 服务重启等）
- 每条记录独立持久化（防中途崩）

实际部署建议先创建一个**一次性试跑任务**验证流程，再启用周期任务。

## 与其他 Skill 的协作

- **local-transcribe**：转录的所有事都交给它（HTTP 调用、轮询、重试、崩溃恢复）。
  本 Skill 只负责把"下载好的视频文件绝对路径"交付给 local-transcribe。
- **file-download**：B 站视频不要用 file-download（无法处理 cookies、412、合并流）。
  其他类型文件下载可以用 file-download。
- **web-fetch**：想看 UP 主主页或视频简介内容，用 web-fetch 比 yt-dlp 更轻。

## 注意事项

- cookies 会过期（通常数月）；下载突然 412 失败时第一反应是更新 cookies
- 大批量下载会触发 B 站频控（连续下载几十条会出现限速或封 IP）；
  适度间隔（每条之间 sleep 几秒）可以缓解
- 视频文件较大（90 分钟视频 360P 也有 100~500 MB），磁盘空间要预估
- B 站直播录像、合集、收藏夹的 URL 格式与普通投稿不同，本 Skill 主要针对普通投稿
