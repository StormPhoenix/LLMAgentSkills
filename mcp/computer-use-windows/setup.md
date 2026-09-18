# computer-use-windows MCP Server 安装指南

Windows 桌面 GUI 自动化 MCP server：截屏、鼠标键盘模拟、UIA 元素树、窗口管理、OCR 读屏。上游项目：[ezpzai/codex-computer-use-windows](https://github.com/ezpzai/codex-computer-use-windows)。

## 前置要求

- Windows 10/11 交互式桌面会话
- Python 3.10+，且带 `py` launcher（`py --version` 验证）
- Git

## 安装步骤

```powershell
# 1. 克隆到固定位置（路径需与 mcp.json 的 cwd 一致）
git clone https://github.com/ezpzai/codex-computer-use-windows.git "$HOME\.craft\mcp-servers\computer-use-windows"

# 2. 预热依赖（关键：避免 Craft 首次连接时因 pip install 超过 30s 连接超时而失败）
cd "$HOME\.craft\mcp-servers\computer-use-windows"
.\scripts\launch-windows.cmd mcp
# 看到 venv 创建、依赖安装完成后 Ctrl+C 退出即可
```

3. 将仓库根目录 [mcp.json](../../mcp.json) 中 `computer-use-windows` 条目合并进 `~/.craft/mcp.json`，确认 `cwd` 指向实际克隆路径
4. 配套 Skill `computer-use-windows/` 提供工具白名单声明（无此 Skill，MCP 工具对 LLM 不可见）
5. 重启 Craft → Settings → MCP 确认 `computer-use-windows` 为 connected

## 踩坑记录

### 1. mcp 包 2.x 版本不兼容（已修复）

上游 `requirements.txt` 未锁定版本，pip 会装到 `mcp 2.x`，而 2.x 把 `FastMCP` 改名为 `MCPServer`，导致 server 启动即崩溃：

```
ModuleNotFoundError: No module named 'mcp.server.fastmcp'
```

**修复**：仓库中 `scripts/requirements.txt` 第一行已改为 `mcp<2`（本仓库 fork 的做法）；若直接用上游项目，手动降级：

```powershell
".venv\Scripts\python.exe" -m pip install "mcp<2"
```

### 2. 首次连接超时

首次运行 launch 脚本会创建 venv + pip install（可能数分钟），而 Craft 的 MCP 连接超时是 30s。**务必先手动预热**（见安装步骤第 2 步），或预热后重启 Craft。

### 3. cwd 必须显式指定

Craft 的 stdio transport 未指定 cwd 时默认落到用户主目录，而 launch 脚本用相对路径定位 venv 和 server 脚本，cwd 不对会直接启动失败。`mcp.json` 中必须写完整克隆路径。

## 验证

- 连接验证：Settings → MCP 状态为 connected
- 协议验证（可选）：手动启动后发送 MCP initialize 握手，应返回 `serverInfo: "Computer Use (Windows)"`
- 功能验证：对话中让 LLM 调用 `list_windows`；截图调用后 LLM 能描述画面（截图结果注入视觉通道）
