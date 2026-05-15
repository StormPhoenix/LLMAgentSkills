---
name: hunyuan-image-gen
description: 混元 AI 图片生成，支持文字描述生成图片，提供 12 种预设中国风/动漫/写实等风格。需要画图、生成图片时使用。
---
# 混元图片生成

使用腾讯混元图像大模型（hunyuan-image-v3.0）生成图片。

## 工具选择规则（必须遵循）

本 Skill 提供文生图能力。如果用户需要基于已有图片修改（图生图），请激活 `jimeng-image-gen` Skill。

## 工具说明

### 查看风格列表

`mcp__claude-code__image_hunyuan__list_styles` — 列出所有可用的预设风格

不需要参数。返回风格代码和中文名称的对照表。

### 文生图

`mcp__claude-code__image_hunyuan__generate_image` — 根据文字提示词和可选风格生成图片

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| prompt | ✅ | - | 图片描述提示词 |
| style | ❌ | - | 预设风格代码（见下方列表） |
| resolution | ❌ | 1024:1024 | 图片分辨率（宽:高格式） |
| logo_add | ❌ | true | 是否添加混元水印 |

**可用风格**：

| 代码 | 风格 |
|------|------|
| dongman | 动漫 |
| riman | 日漫 |
| gufeng | 古风 |
| youhua | 油画 |
| shuicai | 水彩 |
| sumiao | 素描 |
| xieshi | 写实 |
| katong | 卡通 |
| ertong | 儿童画 |
| keji | 科技 |
| saibo | 赛博朋克 |
| qita | 其他 |

## 响应格式

工具返回纯文本，包含：
- 状态标记（✅ 成功 / ❌ 失败）
- 参数回显（提示词、风格、尺寸、模型）
- 图片 URL

示例：
```
[image-hunyuan/generate_image]
✅ 文生图成功！

📝 提示词: a mountain landscape
🎨 风格: 油画
📐 尺寸: 1024x1024
🤖 模型: hunyuan-image-v3.0-v1.0.4

🔗 图片URL: https://...
```

请将图片 URL 以 Markdown 图片格式展示给用户：`![描述](url)`

## 常见使用场景

| 用户意图 | 推荐做法 |
|---------|---------|
| "画一张图" / "生成图片" | 直接调用 generate_image |
| "画一张古风的图" | generate_image + style: "gufeng" |
| "用水彩风格画..." | generate_image + style: "shuicai" |
| "有哪些风格可以选？" | 调用 list_styles |
| "在这张图基础上修改" | 本 Skill 不支持图生图，建议激活 jimeng-image-gen |

## 注意事项

- 混元图像是**同步调用**，约 5-10 秒返回，请告知用户耐心等待
- `style` 参数必须使用风格代码（如 `gufeng`），不能使用中文或数字 ID
- 如果用户要求特定风格但不确定代码，先调 `list_styles` 查看
- 本 Skill 只支持文生图，不支持图生图（图生图请用 jimeng-image-gen）
- 不要传 `model` 参数（服务端已配置最优模型）
- 图片 URL 有效期约 24 小时，请提醒用户及时保存
