---
name: computer-use-windows
description: Windows 桌面 GUI 自动化。控制鼠标键盘、读取屏幕、操作 Windows 应用（截屏、点击、输入、UIA 元素树定位、窗口管理）。当用户要求操作桌面应用、控制鼠标键盘、读取屏幕内容、跨应用任务时使用。
metadata:
  craft:
    type: skill
---

# Windows 桌面 GUI 自动化（Computer Use）

通过 computer-use-windows MCP server 感知并操作 Windows 桌面：截屏、模拟鼠标键盘、读取 UIA 元素树、管理窗口、启动应用。

## 前置条件

1. Settings 中 MCP Server `computer-use-windows` 状态为**已连接**
2. 处于交互式桌面会话（不可控 UAC 提示和安全桌面）
3. 工具报"未连接"时，提示用户到 Settings → MCP 检查 server 状态并重启连接

## 工具清单

所有工具名为 `mcp__computer-use-windows__<tool>`。

### 感知类（优先使用，省 token）

| 工具 | 说明 |
|------|------|
| `observe_screen` | 综合观察：可同时返回屏幕尺寸、光标位置、活动窗口、可选截图和 UI 树。**核心感知工具** |
| `get_ui_tree` | 读取当前（或指定）窗口的 UIA 元素树——结构化感知，不耗图像 token |
| `extract_text` / `extract_text_active_window` | OCR 提取屏幕/活动窗口文字（Windows 内置引擎） |
| `get_window_text` | 通过 UI Automation 读取窗口文本内容（无需截图） |
| `screenshot` / `screenshot_active_window` | 截屏。⚠️ 见下方"截图限制" |
| `get_screen_size` / `get_cursor_position` | 屏幕尺寸 / 光标位置 |
| `list_windows` | 列出所有打开的窗口 |

### 操作类（真实操作用户桌面）

| 工具 | 说明 |
|------|------|
| `click` / `move_mouse` / `drag_mouse` / `scroll` | 鼠标操作（绝对屏幕坐标） |
| `type_text` / `type_unicode` | 键盘输入（ASCII / Unicode，后者内部走剪贴板） |
| `press_key` / `hotkey` | 单键 / 组合键 |
| `find_and_click_element` | **UIA 定位点击**：按元素名/类型查找并点击，优先于坐标点击 |
| `focus_window` | 按标题切窗口到前台 |
| `run_program` / `open_app` | 启动程序 / 常见应用（notepad、chrome 等） |
| `send_text_to_window` / `send_keys_to_window` | 聚焦窗口并粘贴文本（可选回车）——适合聊天应用发消息 |
| `batch_actions` | 多个动作合并为一次调用 |
| `wait` | 等待指定毫秒（UI 响应后再观察） |

## 工作流（必须遵循）

1. **先建立认知**：`list_windows` 或 `observe_screen` 了解当前环境，不要盲操作
2. **结构化优先**：定位元素优先 `get_ui_tree` + `find_and_click_element`（精确、省 token）；只有 UIA 拿不到（自绘 UI、无障碍信息缺失）才退回坐标点击
3. **小步验证**：每次操作后 `wait`（如需要）→ 重新观察（`observe_screen` / `get_ui_tree` / `extract_text`）确认结果，再进行下一步；多个确定性的连续动作可用 `batch_actions` 合并
4. **读屏不截图**：只需了解界面内容时用 `extract_text` 或 `observe_screen(include_screenshot=False, include_ui_tree=True)`，不要为读文字而截图
5. **失败恢复**：点击无效时先检查窗口是否在前台（`focus_window`），再确认坐标/元素是否正确；连续失败则向用户说明现状

## 截图限制（重要）

`screenshot` 系工具的返回结果在 Craft 中**不会进入视觉通道**（以文本占位返回），你看不到截图内容。因此：

- **不要**通过截图来"看"界面——用 `get_ui_tree` / `extract_text` / `observe_screen` 替代
- 截图仅用于：保存文件供**用户**查看（返回结果中会包含文件路径，转告用户）

## 常见场景

| 用户意图 | 做法 |
|---------|------|
| 打开记事本写内容 | `open_app("notepad")` → `type_unicode("内容")` |
| 看看当前屏幕/某窗口有什么 | `list_windows` → `get_ui_tree` 或 `extract_text_active_window` |
| 点击某应用的某按钮 | `focus_window` → `get_ui_tree` 找元素 → `find_and_click_element` |
| 帮我在 XX 聊天窗口发消息 | `send_keys_to_window(title="XX", text="...", send_enter=True)` |
| 启动某个程序 | `run_program` 或 `open_app` |
| 读取屏幕上的文字 | `extract_text`（全屏）或 `extract_text_active_window` |

## 安全与注意

- **前台接管**：操作期间会抢占用户的鼠标键盘，动作之间保持节奏，避免高频连续操作
- **敏感操作**（付款、删除、账号设置、发送重要消息）：执行前必须先用自然语言向用户确认动作内容
- **浏览器任务优先走 playwriter-browser Skill**（更安全可控），本 Skill 的桌面操作不覆盖网页内任务
- `type_unicode` 内部使用剪贴板，会覆盖用户当前剪贴板内容
- 不可控 UAC 提示、管理员授权对话框、安全桌面——遇到时停下来请用户手动处理
- 操作真实桌面等于以用户身份行动，勿在未确认时执行有副作用的操作
