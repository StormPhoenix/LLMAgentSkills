# open-computer-use MCP Server 安装指南

开源版 Codex Computer Use（iFurySt/open-codex-computer-use），跨平台（macOS 14+ / Windows / Linux），9 个工具统一契约：`list_apps / get_app_state / click / perform_secondary_action / scroll / drag / type_text / press_key / set_value`。核心理念：AX 结构化感知 + 非侵入式操作（默认不移动真实指针、不改前台焦点）。

上游仓库本地克隆：`~/.craft/mcp-servers/open-computer-use/`（供阅读文档与 skill 参考，运行不依赖它）。

## 前置要求

- macOS 14.0+（`sw_vers -productVersion` 验证；低版本 npm 装得上但 runtime 起不来，doctor 救不了）
- Node.js

## 安装步骤（本机实际采用的路径）

```sh
# 1. 安装 CLI。npm 全局前缀 /usr/local 为 root 所有，故装到用户级前缀
mkdir -p ~/.craft/mcp-servers/npm-global
npm install --prefix ~/.craft/mcp-servers/npm-global open-computer-use

# 2. 验证 CLI
~/.craft/mcp-servers/npm-global/node_modules/.bin/open-computer-use -h

# 3. 权限自检（首次会在有 GUI 的环境下弹引导界面）
~/.craft/mcp-servers/npm-global/node_modules/.bin/open-computer-use doctor

# 4. 验证 AX 感知（Accessibility 授权后）
~/.craft/mcp-servers/npm-global/node_modules/.bin/open-computer-use call get_app_state --args '{"app":"Calculator"}'

# 5. 配套 Skill：computer-use-macos/ 已在 skills 目录，无需额外操作
```

## mcp.json 条目（已合并进 ~/.craft/mcp.json）

```json
"open-computer-use": {
  "transportType": "stdio",
  "command": "/Users/jiaxianwang/.craft/mcp-servers/npm-global/node_modules/.bin/open-computer-use",
  "args": ["mcp"],
  "description": "Computer Use：macOS AX 树感知 + 非侵入式点击输入（跨平台）"
}
```

注意：command 用绝对路径（GUI 启动时 PATH 环境不同，裸命令名可能解析不到）。

## 权限（TCC）

需要 **辅助功能（Accessibility）**；截屏能力还需 **屏幕录制（Screen Recording）**。授权对象是 npm 包内置的原生 runtime 二进制（`doctor` 或首次 AX 调用失败时系统会登记）。授权后必须重启发起进程（终端 / Craft）。

## 踩坑记录

1. **npm 全局安装 EACCES**：`/usr/local` root 所有。解法：`npm install --prefix ~/.craft/mcp-servers/npm-global`，mcp.json 用绝对路径指向 `.bin/open-computer-use`。
2. **list_apps 不需要权限**，get_app_state 才触发 Accessibility 检查——别用 list_apps 验证授权。
3. **doctor 在无 GUI 的子进程环境可能不弹引导 UI**，让用户在自己的终端手动跑一次。
4. **macOS 26+ 每月复确认 Screen Recording**（OS 行为，无法抑制）。
5. **不要开启 `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS=1`**：开启后 drag/坐标点击可能移动真实指针；默认非侵入路径下 Finder 拖放/划选文本无效，属预期行为，用替代方案。
6. **element_index 会话态**：MCP 模式下每次 get_app_state 后有效，UI 变了必须重新获取。
7. 无截图工具（9 工具契约不含）——视觉兜底留给 Craft Phase 4 原生 desktopCapturer。
8. `sky_click`/`app_post` 依赖 macOS 私有 SkyLight 符号，OS 大版本升级后可能失效，需回归验证。

## 验证

- Settings → MCP 状态 connected
- `list_apps` 返回应用清单
- `get_app_state` 返回目标应用 AX 快照（含 element_index 与光标 overlay 图像）
- 验收场景：TextEdit 输入保存 / 读计算器按钮 / 系统设置导航 / Craft 前台时后台操作其他应用（非侵入特性）
