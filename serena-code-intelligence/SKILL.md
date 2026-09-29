---
name: serena-code-intelligence
description: |
  基于 LSP 的语义代码导航（Serena）：符号查找、引用查找、文件大纲。
  触发词：「查找定义」「谁调用了」「代码大纲」「symbol」「引用分析」「影响面」。
  适用场景：code/agent 模式下需要跨文件定位函数/类/方法的定义、引用或结构时，优先于 grep 文本搜索使用；修改函数签名或重命名前评估影响面。
  局限：依赖语言服务器（TS/JS 开箱可用，其他语言需本机安装对应 LSP）；仅提供只读查询，文件修改仍走内置 edit_file / write_text_file。
metadata:
  craft:
    type: skill
---

# 语义代码导航（Serena LSP）

本 Skill 通过 Serena MCP Server（LSP 后端）提供符号级的语义代码查询，弥补文本搜索无法区分「定义 / 调用 / 注释」的缺陷。

## 使用规则

1. **首次使用或工作区变更时**，先调用 `mcp__serena__activate_project`，参数为当前会话的 workspace 根目录绝对路径。激活之后符号工具才有效。
2. **看文件结构**：`mcp__serena__get_symbols_overview`——读大文件前先看大纲，再按需精准读取，节省 token。
3. **定位定义**：`mcp__serena__find_symbol`——按名字查找符号定义位置，支持以容器路径限定（如 `ChatSession.persistActivatedSkills`）。
4. **查引用/影响面**：`mcp__serena__find_referencing_symbols`——修改函数签名、重命名、删除代码前**必须**先查引用，评估波及范围。

## 策略

- 符号级问题（"X 在哪定义""谁调用了 X""X 的结构"）优先用上述工具，而非 `search_content` 全文翻找；
- 工具失败（语言服务器未安装 / 语言不支持 / 项目未激活）时，先尝试 `activate_project` 重试一次，仍失败则回退到 `search_content` 文本搜索，不要反复重试；
- 找到符号位置后需要看实现细节时，再用 `read_text_file` 按 offset/limit 精准读取，避免整文件读取；
- **文件修改一律使用内置 `edit_file` / `write_text_file`**——本 Skill 不提供写能力，内置工具的修改会进入修改历史，可 Review/Undo；
- 多个工作区根目录时，以 primaryRoot 作为 `activate_project` 的目标。
