# MCP Server 配置

本目录管理 Craft 的 MCP Server 配置。仓库根目录的 [`mcp.json`](../mcp.json) 是配置模板，格式与 Craft 实际读取的 `~/.craft/mcp.json` 完全一致。

## 使用方式

1. 打开 Craft 实际配置文件 `~/.craft/mcp.json`（或通过 Craft Settings → MCP 管理）
2. 将仓库 `mcp.json` 中需要的条目**手动合并**进实际配置
3. **注意**：`REPLACE_WITH_YOUR_HOME` 占位符需替换为本机用户主目录的实际路径（如 `C:\Users\<username>`），Craft 不会解析占位符

## 配置格式

```json
{
  "servers": {
    "<server-name>": {
      "transportType": "stdio" | "streamable-http",
      "command": "...",       // stdio：可执行文件路径或命令
      "args": ["..."],        // stdio：命令行参数
      "cwd": "...",           // stdio：工作目录（建议显式指定，默认会落到用户主目录）
      "url": "...",           // streamable-http：HTTP 端点
      "headers": {},          // streamable-http：附加请求头
      "description": "..."    // 展示在 Settings → MCP 列表
    }
  }
}
```

关键行为（来自 Craft 的 McpManager 实现）：

- 应用启动时读取配置并行连接全部 Server，单个失败不影响其他
- 连接超时 30s；工具调用超时 60s；结果截断 8000 字符
- Server 崩溃自动重连（指数退避，最多 3 次）
- **MCP 工具默认对 LLM 不可见**——必须由某个 Skill 的 `manifest.yaml` 声明 `mcpTools: {server, include[]}` 白名单后才可使用（stdio 模式未指定 cwd 时默认用户主目录，规避 npx 在 pnpm workspace 下的已知 npm bug）

## Server 清单

| Server | 类型 | 配置参考 | 说明 |
|---|---|---|---|
| `playwriter` | npx 公共包 | 根目录 mcp.json | 浏览器自动化（需 Chrome 安装 Playwriter MCP 扩展）；配套 Skill：`playwriter-browser/` |
| `comfyui` | npx 公共包 | 根目录 mcp.json | ComfyUI 能力自动化 |
| `computer-use-windows` | 本地克隆 + Python | [computer-use-windows/setup.md](./computer-use-windows/setup.md) | Windows 桌面 GUI 自动化；配套 Skill：`computer-use-windows/` |
| `open-computer-use` | npm 公共包 | [open-computer-use/setup.md](./open-computer-use/setup.md) | 跨平台 Computer Use（macOS AX 树 + 非侵入式操作）；配套 Skill：`computer-use-macos/` |

## 原则

- 仓库中的 `mcp.json` 只收录**可分享/通用**的条目；私有端点（内网地址、含鉴权 token 的 URL）不入库
- 需要本地安装的 server（如 computer-use-windows）在本目录下建同名子目录，沉淀安装步骤与踩坑记录
