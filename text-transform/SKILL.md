---
name: text-transform
description: >
  文本处理工具箱：JSON 格式化、Base64 编解码、URL 编解码、哈希计算、字数统计、正则提取、UUID 生成、大小写转换。
  全部 SAFE 级别操作，无需用户确认。
metadata:
  toolbox:
    type: skill
---

# Text Transform Skill

文本处理工具箱，覆盖开发者和日常用户的常见文本操作需求。全部 SAFE 级别。

## 使用原则

当用户需要以下文本操作时，**优先使用此技能**：
- 格式化/压缩 JSON
- Base64 编解码
- URL 编解码
- 计算文本哈希
- 统计字数
- 正则提取
- 生成 UUID
- 大小写转换

## 与 clipboard-ops 配合

常见工作流：
1. `read_clipboard` 读取用户复制的文本
2. `text_transform` 处理（如 format_json、base64_decode）
3. 如需写回，`write_clipboard` 写入剪贴板
