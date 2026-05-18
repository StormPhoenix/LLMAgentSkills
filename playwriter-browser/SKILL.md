---
name: playwriter-browser
description: 通过 Playwriter 控制用户 Chrome 浏览器（点击、填表、截图、抓取页面）。需要打开网页、操作浏览器、自动化网页任务时使用。
---
# 浏览器自动化（Playwriter）

通过 Playwriter MCP 在用户**已登录的 Chrome** 中执行 Playwright 代码。

## 前置条件

1. Chrome 已安装 [Playwriter MCP 扩展](https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe)
2. 在要控制的标签页上启用扩展（图标为绿色）
3. Settings 中 MCP Server `playwriter` 状态为**已连接**

若工具报错连接失败，先让用户检查扩展，再尝试 `reset`。

## 工具

### execute

`mcp__playwriter__execute` — 在浏览器沙箱中执行 Playwright 代码

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| code | ✅ | - | JavaScript 代码；作用域含 `page`、`context`、`state`。复杂任务拆成多次调用，不要一次写很长脚本 |
| timeout | ❌ | 10000 | 单次执行超时（毫秒）；导航、截图可适当加大（如 30000） |

**首次调用**应创建并固定 `state.page`，后续都用 `state.page`：

```js
const pages = context.pages().filter(p => !p.isClosed());
state.page = pages.find(p => p.url() !== 'about:blank') ?? await context.newPage();
await state.page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
console.log(await state.page.title());
```

**观察页面**优先用 snapshot（快、省 token），不要为读文字而截图：

```js
await snapshot({ page: state.page }).then(console.log);
```

**截图**需保存文件时用绝对路径，并加 `scale: 'css'`：

```js
await state.page.screenshot({ path: '/tmp/playwriter-shot.png', scale: 'css' });
```

### reset

`mcp__playwriter__reset` — 重建 CDP 连接并清空 `state` 自定义字段

连接异常、页面全部 `about:blank`、evaluate 失效时使用。无参数。

## 工作流（必须遵循）

1. **拆步**：导航、观察、点击、再观察 — 每步单独一次 `execute`
2. **先 snapshot 再操作**：从 snapshot 输出中取 locator，不要臆造 CSS
3. **弹窗**：导航后先 snapshot 搜 cookie/弹窗，关掉再继续
4. **失败**：先 `reset`，再重试；仍失败则提示用户重启 Chrome 并重载扩展

## 响应格式

工具返回执行日志（`console.log` 输出）及可能的错误信息。将关键结果（标题、URL、文本摘要）用自然语言回复用户。

## 常见场景

| 用户意图 | 做法 |
|---------|------|
| 打开某网站并读标题 | goto + `page.title()` |
| 点击按钮 / 填表 | snapshot 找 locator → click / fill |
| 页面是否正常加载 | snapshot 或 `page.url()` |
| MCP 无响应 / 连接错误 | 调用 `reset` 后重试 |

## 注意事项

- 控制的是用户真实 Chrome，可能含登录态；勿在未授权时执行敏感操作
- `page.evaluate()` 内只能用浏览器端 JS，不要用 TypeScript 语法
- 多标签页共享浏览器，用 `state.page` 固定当前工作页，避免和其他会话抢同一空白页
