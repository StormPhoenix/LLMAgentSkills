# serena MCP Server 安装指南

[Serena](https://github.com/oraios/serena)：基于 LSP 的语义代码智能 MCP Server，提供符号查找 / 引用查找 / 文件大纲等工具。配套 Skill：`serena-code-intelligence/`。

## 前置要求

- **uv**（Serena 的唯一安装渠道；自带 Python 3.13 管理，无需系统 Python）
- 语言服务器（LSP 后端按语言需要）：
  - **TypeScript / JavaScript：开箱可用**（依赖随 serena-agent 一起装）
  - Python：pyright（`uv tool install pyright` 或 `npm i -g pyright`）
  - Go：gopls；Rust：rust-analyzer；C/C++：clangd —— 其余语言见 Serena 官方 Language Support 页

## 安装步骤（本机实际采用的路径）

```bash
# 1. 安装（uv 自动拉取 Python 3.13 与依赖）
uv tool install -p 3.13 serena-agent

# 2. 验证二进制存在
ls ~/.local/bin/serena   # Windows: %USERPROFILE%\.local\bin\serena.exe

# 3. 验证 MCP 握手（应返回 serverInfo: Serena vX.Y.Z）
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' \
  | ~/.local/bin/serena start-mcp-server --context ide-assistant 2>/dev/null | head -c 200
```

## mcp.json 条目（已合并进 ~/.craft/mcp.json）

```json
"serena": {
  "transportType": "stdio",
  "command": "<HOME 绝对路径>/.local/bin/serena",
  "args": ["start-mcp-server", "--context", "ide-assistant"],
  "description": "Serena LSP 语义代码智能（符号查找/引用/大纲）；配套 Skill：serena-code-intelligence"
}
```

- `--context ide-assistant`：自动禁用与宿主重叠的基础工具（read_file / search_for_pattern 等），只暴露符号级工具
- **不写死 `--project`**：配套 Skill 指导 Agent 在会话内按 workspace 调 `activate_project` 动态切换，单实例服务所有会话

## 验证

1. 重启 Craft（MCP 连接发生在应用启动时）→ Settings → MCP 确认 `serena` 状态 connected
2. 任意会话 Composer `/` 激活「语义代码导航（Serena LSP）」
3. 测试提问：「`persistActivatedSkills` 在哪定义？谁调用了它？」——预期 Agent 依次调 `activate_project` → `find_symbol` → `find_referencing_symbols`

## 踩坑记录

- **`command` 必须用绝对路径**：`StdioClientTransport` 直接 spawn、不经过 shell，不保证继承用户 PATH。写 `serena` 裸命令会得到 "spawn ENOENT"。
- **首次 `activate_project` 慢**：触发 LSP 全量索引，大仓库可能逼近 Craft 的工具调用超时（60s）。首个问题建议只问一个符号，给索引留预热时间；超时后重试一次通常成功。
- **`activate_project` 是进程级全局切换**：Craft 的 McpManager 为单例，两个不同 workspace 的会话**并发**使用 serena 会互相切项目。单人桌面场景影响小；确有需求时为每个项目配独立 server 条目（各自写死 `--project`）。
- **写类工具靠白名单过滤**：`ide-assistant` 上下文仍暴露 `replace_symbol_body` / `rename_symbol` 等写工具，且 MCP 工具不经过 Craft 的 PermissionController 与文件写治理（无快照 / 无修改历史）。配套 Skill 的 `include` 只收 4 个只读工具是刻意设计，勿改为 `*` 通配。
- **结果截断 8000 字符**：超大文件的 `get_symbols_overview` 可能被截，属可接受损耗。
- **工具失败回退**：语言服务器未装 / 语言不支持时 Agent 应回退 `search_content` 文本搜索（已写进 Skill 指令）。
- **stdio 未指定 cwd 默认用户主目录**：与其他 server 一致，规避 npx 在 pnpm workspace 下的已知 npm bug。
