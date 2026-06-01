# External Skills

本仓库收录 **ToolBox** 外部 Skill（技能包）。Skill 是 ToolBox 的声明式工具单元，通过 `SKILL.md` 定义行为，可选附带 `manifest.yaml` 元数据与 `.cjs` 脚本。

---

## 目录结构

每个 Skill 以独立子目录存放：

```
<skill-name>/
├── SKILL.md          # 必须：Skill 定义（YAML frontmatter + Markdown 指令）
├── manifest.yaml     # 可选：Skill 元数据（版本、分类、MCP 工具声明等）
└── scripts/
    └── *.cjs         # 可选：Skill 执行脚本（仅允许使用 Node 内置模块）
```

---

## Skill 类型

| 类型 | 说明 | `metadata.toolbox.type`（SKILL.md） | `type`（manifest.yaml） |
|------|------|-------------------------------------|------------------------|
| **tool** | 提供具体工具能力（文件操作、图片生成、API 调用等） | `skill` | `- skill` |
| **persona** | 扮演特定角色，提供特定思维框架与对话风格 | `persona` | `- persona` |

---

## 规范化要求（入库必须满足）

本仓库专门收录**规范化之后**的 Skill 文件，所有入库 Skill 必须满足以下要求：

### 类型字段

**所有 Skill 必须声明类型**，且两个文件中的类型值必须一致：

| 场景 | 要求 |
|------|------|
| 角色模拟型（Persona） | `SKILL.md` frontmatter 中必须有 `metadata.toolbox.type: persona` |
| 工具型（Tool） | `SKILL.md` frontmatter 中必须有 `metadata.toolbox.type: skill` |
| 存在 `manifest.yaml` 时 | `type` 字段必须与 `SKILL.md` 中的 `metadata.toolbox.type` 一致 |

**优先级**：当 `manifest.yaml` 与 `SKILL.md` frontmatter 中的类型存在冲突时，**`manifest.yaml` 中的 `type` 字段优先**。

### 规范化示例

**Persona 类（角色模拟）**：

```markdown
---
name: zhuge-liang
description: 触发词「诸葛亮」「孔明」。三国蜀汉丞相，以三分析势法著称。
metadata:
  toolbox:
    type: persona       # ← 必须为 persona
---
```

对应 `manifest.yaml`（如有）：

```yaml
type:
  - persona             # ← 与 SKILL.md 保持一致
```

**Tool 类（工具型）**：

```markdown
---
name: hunyuan-image-gen
description: 混元 AI 图片生成，支持文字描述生成图片。
metadata:
  toolbox:
    type: skill         # ← 必须为 skill
---
```

对应 `manifest.yaml`（如有）：

```yaml
type:
  - skill               # ← 与 SKILL.md 保持一致
```

---

## SKILL.md 格式

```markdown
---
name: <skill-id>
description: <单行描述，用于 LLM 决策是否激活该 Skill>
metadata:
  toolbox:
    type: skill | persona    # 必填，不可省略
---

# Skill 名称

（正文：详细指令、工具说明、角色设定等）
```

---

## manifest.yaml 格式（可选）

```yaml
version: 1.0.0
skillVersion: 1.0.0
displayName: 显示名称
emoji: 🛠️
category: productivity | creativity | utility
type:
  - skill | persona    # 必须与 SKILL.md 中 metadata.toolbox.type 一致；manifest.yaml 优先级更高
autoActivate: false    # 是否自动激活（慎用）
mcpTools:              # 声明本 Skill 依赖的 MCP 工具（可选）
  server: <mcp-server-name>
  include:
    - tool_name_1
    - tool_name_2
```

---

## 现有 Skill 列表

| 目录 | 类型 | 描述 |
|------|------|------|
| `hunyuan-image-gen/` | tool | 腾讯混元文生图，12 种预设风格 |
| `女娲-诸葛亮/` | persona | 三国蜀汉丞相诸葛亮思维框架 |
| `女娲-曹孟德/` | persona | 三国魏武帝曹操思维框架 |
| `公众人物-诸葛亮/` | persona | 诸葛亮（公众人物版） |
| `导入-毛选/` | persona | 毛泽东《毛选》思维操作系统 |
| `tech-writing-expert/` | persona | 深度技术调研写作专家，强制散文体，五阶段认知路径，禁用碎片化列表 |
| `knowledge-graph-writer/` | persona | 知识图谱驱动写作法，两步流程：先生成概念逻辑关系图，再按图谱拓扑顺序撰写连贯文章 |

---

## 使用方式

### 在 ToolBox 中加载

1. 打开 ToolBox → **Settings → Skill**
2. 点击"导入外部 Skill"
3. 选择对应 Skill 目录（包含 `SKILL.md` 的文件夹）

### 在 Cursor / Claude Code 中直接使用

将 `SKILL.md` 的内容作为 System Prompt 注入对话，或通过 `@` 引用文件。

---

## 编写规范

- `SKILL.md` 中 `description` 字段是 LLM 激活判断的核心依据，**务必简洁精准**
- `metadata.toolbox.type` **不可省略**，必须为 `skill` 或 `persona` 之一
- Persona 类 Skill 应包含：角色身份、语气约束、核心心智模型、诚实边界
- Tool 类 Skill 应包含：工具说明、参数表、响应格式、常见使用场景
- 存在 `manifest.yaml` 时，其 `type` 字段必须与 `SKILL.md` 中 `metadata.toolbox.type` 保持一致，**`manifest.yaml` 中的值优先**
- `.cjs` 脚本**禁止 `require` 第三方 npm 包**，仅允许 Node 内置模块与 `electron`
- 目录名建议使用 kebab-case 或语义化中文（与 Skill `name` 字段保持对应）

---

## 贡献

欢迎提交新的 Skill。每个 Skill 以独立目录 PR 提交，确保：

- [ ] `SKILL.md` 包含完整 YAML frontmatter（`name` + `description` + `metadata.toolbox.type`）
- [ ] `metadata.toolbox.type` 已正确填写（`skill` 或 `persona`）
- [ ] 如有 `manifest.yaml`，其 `type` 字段与 `SKILL.md` 中类型一致
- [ ] 描述字段清晰说明适用场景和触发条件
- [ ] 如有 `.cjs` 脚本，已验证不依赖第三方包
- [ ] 在本 README 的"现有 Skill 列表"中登记
