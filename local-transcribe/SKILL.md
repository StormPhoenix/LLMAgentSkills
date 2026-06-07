---
name: local-transcribe
description: >
  本地语音/视频转录服务，支持将音频或视频文件转录为文字或字幕。
  支持 mp4/mkv/avi/mp3/m4a/wav 等主流格式，可输出纯文字（txt）或带时间轴字幕（srt）。
  触发词：「转录」「语音识别」「字幕」「视频转文字」「音频转文字」「听写」
  适用场景：转录本地会议录音、视频字幕生成、播客文字稿整理。
  局限：依赖本地转录服务运行中（服务地址在 Skill 配置中设置）；大文件（>30 分钟）耗时较长，建议用后台任务异步执行。
metadata:
  toolbox:
    type: skill
---

# 本地转录服务

将本地音频或视频文件转录为文字或字幕，离线运行，数据不出本机。

## 使用原则

- 用户说「转录这个文件」「生成字幕」「视频转文字」时，直接调用 `transcribe`，无需先征求同意
- 转录前先用 `transcribe_check_env` 确认服务已就绪；若服务未就绪，告知用户先启动转录服务
- `file_path` 必须是本地**绝对路径**，不接受 URL；如果用户给的是相对路径，用 `get_path` 工具补全

## 工具选择规则

| 场景 | 工具 |
|------|------|
| 检查服务状态 / 排查问题 | `transcribe_check_env` |
| 转录单个文件（≤30 分钟）| `transcribe` |
| 转录大文件 / 批量转录 | 创建后台任务（见下方）|

## 长任务：使用后台任务异步执行

对于 **1 分钟以上**的文件，或用户希望在后台静默转录、完成后收通知，应使用 `manage_daemon_task` 创建 **program 执行体**的后台任务。

提示用户：转录完成后会收到系统通知，结果保存在指定路径。

**program 脚本模板**（`ctx.callLLM` 会调用 `transcribe` 工具）：

```javascript
module.exports = async function execute(ctx) {
  ctx.log('开始转录：{file_path}');
  const result = await ctx.callLLM(
    '请用 transcribe 工具转录文件 {file_path}，输出格式 {output_format}，语言 {language}，完成后把转录结果写入 {output_file}'
  );
  ctx.log('转录完成');
  return result;
};
```

将 `{...}` 占位符替换为用户实际参数后填入任务脚本。

## 注意事项

- `transcribe` 是**同步调用**，大文件会阻塞 Agent 循环数分钟——务必提前告知用户需要等待
- 服务返回 `model_loaded: false` 时，说明模型尚未完成加载（首次启动需时间），稍等后重试
- 语言参数：`zh`（中文）、`en`（英文）、`auto`（自动检测）
- 输出格式：`txt`（纯文字，适合阅读）、`srt`（含时间戳，适合字幕）
