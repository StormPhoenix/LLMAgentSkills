---
name: computer-use-macos
description: macOS 桌面 GUI 自动化。通过 Accessibility 树感知并操作 macOS 应用（元素定位点击、输入、按键、窗口管理，非侵入式不动真实指针）。当用户要求操作桌面应用、点击按钮、读取屏幕内容、跨应用任务时使用。
metadata:
  craft:
    type: skill
---

# macOS 桌面自动化（open-computer-use）

通过 open-computer-use MCP server 感知和操作 macOS 应用。核心理念：**Accessibility 结构化优先、非侵入式**——默认不移动真实鼠标指针、不改变前台焦点，用户可并行工作。

## 工具面（9 个）

`list_apps` / `get_app_state` / `click` / `perform_secondary_action` / `scroll` / `drag` / `type_text` / `press_key` / `set_value`

## 操作循环（必须遵守）

1. **先路由到普通工具**：文件、shell、剪贴板等任务用常规 Skill 工具，能不走 GUI 绝不走 GUI
2. `list_apps` 枚举运行中的应用（应用名或 bundle id 定位目标）
3. `get_app_state` 获取 AX 元素快照（含 `element_index`）
4. **用 `element_index` 做语义操作**（click/type_text/set_value），不要猜坐标
5. 操作后结果自动带回刷新的 app state，**先验证再继续**
6. UI 发生变化（导航/弹窗/失败）后必须重新 `get_app_state`，禁止沿用旧 index

## 关键规则

- **element_index 是会话态**：只对最近一次 `get_app_state` 有效，跨调用/跨轮次不可复用
- 优先 `set_value` 处理可编辑控件；长文本（聊天记录/邮件正文）用 `text_limit: 1000` 或 `"max"`
- 页面/列表不完整时加大 `max_tree_nodes`（如 3000）和 `max_tree_depth`
- 坐标 `click`/`drag` 仅在元素树没有暴露目标时作为最后手段
- **不要开启 `OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS`**：默认非侵入路径下，窗口拖动、Finder 拖放、划选文本无法生效——改用替代方案（shell 移动文件、set_value 替代划选、app 自身控件代替拖标题栏）
- `drag` 返回 `Drag delivered via app_post` 但画面无变化 = 该场景不支持拖拽，换方案

## 权限故障处理

工具返回 "Accessibility permission is required" 时：
1. 告知用户运行 `open-computer-use doctor` 启动引导
2. 或引导用户到 系统设置 → 隐私与安全性 → 辅助功能，将 open-computer-use 的 runtime 二进制加入并开启
3. 授权后需重启 Craft（MCP server 子进程持有旧权限状态）

## 安全红线

- 发送消息、删除、付款、提交表单等外部可见操作前必须向用户确认
- 不操作密码管理器、系统安全对话框（登录窗口/FileVault）
- 保持任务范围窄化，避免开放式指令
