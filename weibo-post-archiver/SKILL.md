---
name: weibo-post-archiver
description: |
  使用用户已登录的 Chrome 搜索指定微博账号的相关博文，补全桌面端隐藏内容，并按时间归档为 Markdown。
  触发词：「抓取微博」「归档微博」「搜索他的微博」「下载微博博文」「微博汇总」「微博历史文章」。
  适用场景：按关键词归档某个微博账号的公开博文；补全"请至手机客户端查看"的内容；生成带原始链接的时间线文档。
  局限：依赖用户已登录的 Chrome、Playwriter 扩展和微博当前页面结构；不能绕过删除、账号限制或服务端访问权限。
metadata:
  craft:
    type: skill
---

# 微博博文归档器

使用 Playwriter 在用户已登录的 Chrome 中搜索并归档指定微博账号的公开博文。必须保持原文，不做摘要、改写或润色。

## 前置条件

1. Chrome 已安装并启用 Playwriter MCP 扩展。
2. 用户已登录微博，且目标标签页可由 Playwriter 控制。
3. 用户提供：
   - 微博用户主页 URL；
   - 搜索关键词（可选，不提供则全量归档）；
   - 输出目录或汇总文档路径。
4. 涉及大量内容时，先测试少量结果并让用户检查格式。

## 核心原则

1. **原文保真**：博文内容一字不改；不摘要、不纠错、不改标点、不润色。
2. **最少元数据**：默认仅保留发布时间、原始链接、正文。
3. **两类链接都要收集**：普通微博链接和客户端二维码链接缺一不可。
4. **移动端补全**：桌面端隐藏、截断或提示客户端查看时，访问移动端页面获取正文。
5. **批量限速**：大量抓取每批最多 10 条；每批开始前随机等待 30–60 秒，批内请求也应留出短间隔。
6. **成功后再出队**：只有在抓取、写入及验证均成功后，才能从临时清单移除地址。
7. **最终校验**：检查条目数、链接数、唯一链接数、缺失链接、重复链接和时间顺序。

## 采集方式选择

微博归档有两种采集方式，根据场景选择：

### 方式一：移动端 API 分页（推荐，适合全量归档）

通过移动端容器接口分页拉取帖子列表，返回完整 JSON 数据，**不依赖 DOM**，100% 不遗漏。

**API 地址**：

```text
https://m.weibo.cn/api/container/getIndex?containerid=107603{uid}&page={N}
```

- `containerid` = `107603` + 用户 UID
- `page` 从 1 开始递增，每页约 10 条
- 返回 JSON 中 `data.cards` 数组，`card_type === 9` 为微博卡片
- 每张卡片的 `mblog` 对象包含完整字段：`id`、`bid`、`created_at`、`text`（完整 HTML）、`retweeted_status`（转发原文）、`isLongText`、`pic_num` 等

**关键发现**：
- 列表 API 的 `text` 字段通常已是完整正文（非截断），无需逐条调 `/statuses/show`
- 转发原文 `retweeted_status.text` 和作者 `retweeted_status.user.screen_name` 直接包含在列表中
- `isLongText === true` 时需额外调 `/statuses/extend?id={数字ID}` 获取长文
- 桌面端虚拟滚动会大量遗漏帖子（实测 67% 丢失率），API 分页是唯一可靠的采集方式

### 方式二：桌面端 DOM 滚动（仅适合关键词搜索归档）

桌面端"搜索他的微博"功能无法通过 API 复现，仍需 DOM 滚动收集。此方式受虚拟滚动影响，可能遗漏部分结果。

**适用场景**：用户明确要求按关键词搜索归档，而非全量归档。

**虚拟滚动遗漏缓解**：每次只滚动一小步（`scrollBy(0, 300)`），每次滚动后立即收集 bid，减少 DOM 回收窗口。但无法完全避免遗漏。

## 浏览器操作规范

遵循 Playwriter 工作流：

1. 首次调用固定 `state.page`（桌面端）和 `state.api`（移动端 `https://m.weibo.cn`）。
2. 导航后先执行 snapshot，再定位输入框或按钮。
3. 使用页面实际 locator，不臆造选择器。
4. 操作失败先 reset，再重试。
5. 控制的是用户真实 Chrome，不执行未授权的发布、点赞、评论或关注操作。

## 标准工作流

### 方式一：API 分页全量归档（两段式脚本）

全量归档使用**两段式脚本**架构，避免数据经过 LLM 中转导致截断：

```
阶段 A（浏览器端）：翻页 → 比对 → 清洗 → 格式化 → 下载 JSON
阶段 B（Node.js 端）：读 JSON → 合并现有 md → 写入 md/jsonl/进度/索引
```

LLM 只负责传递脚本代码和读取最终统计结果，全程不接触帖子内容。

#### 阶段 A：浏览器端采集（分批模式）

使用 `scripts/01-collect.cjs` 脚本。由于 `m.weibo.cn` 是 SPA 页面，长时间 `evaluate` 会因页面自动导航导致执行上下文销毁，因此**必须分批执行**，每批最多 10 页。

**⚠️ 关键限制：**
- `page.evaluate` 只接受 1 个参数（函数外），用对象传参：`{s: startPage, e: endPage}`
- 下载 JSON 必须在 `state.page`（桌面端 weibo.com）触发，不能在 `state.api` 触发
- `reset` 后 `state` 和 `window.__processedBids` 全部丢失，需要重新注入

执行步骤：

1. **初始化浏览器页面**：

```javascript
// 固定桌面端和移动端页面
const pages = context.pages().filter(p => !p.isClosed());
state.page = pages.find(p => p.url().includes('weibo.com')) ?? await context.newPage();
await state.page.goto('https://weibo.com/u/{uid}', { waitUntil: 'domcontentloaded' });

state.api = pages.find(p => p.url().includes('m.weibo.cn')) ?? await context.newPage();
await state.api.goto('https://m.weibo.cn', { waitUntil: 'domcontentloaded' });
```

2. **注入已处理 bid 列表**：从本地 `已处理微博.jsonl` 读取所有 bid，注入 `state.api` 页面的 `window.__processedBids`。

```javascript
// 从 Node.js 读取 jsonl，生成 bid 数组
const bids = JSON.parse(fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n')
  .map(l => JSON.parse(l).bid));
// 注入到 state.api 页面
await state.api.evaluate(b => { window.__processedBids = b; return true; }, bids);
```

3. **初始化收集容器**：

```javascript
state.collectAll = { months: {}, meta: { totalScanned: 0, totalMissing: 0, totalSkipped: 0, lastPage: 0 } };
```

4. **分批拉取**（每批 10 页，重复调用直到到达目标页码）：将 `01-collect.cjs` 中 `COLLECT_BATCH` 部分作为 `mcp__playwriter__execute` 的 `code` 参数，修改 `{s: startPage, e: endPage}` 为当前批次。结果自动累积到 `state.collectAll`。

5. **格式化并下载 JSON**：将 `01-collect.cjs` 中 `FORMAT_AND_DOWNLOAD` 部分在 `state.page`（桌面端）执行，浏览器下载 `weibo_archive_batch.json`。

#### 阶段 B：Node.js 落盘

使用 `scripts/02-merge.cjs` 脚本。执行步骤：

1. **确认 JSON 文件已下载**：检查下载目录中 `weibo_archive_batch.json` 是否存在。

2. **执行合并脚本**：将 `02-merge.cjs` 内容作为 `execute_javascript` 的 `code` 参数执行，修改 CONFIG 中的路径。

3. **脚本自动完成**：
   - 解析 JSON 中各月份条目
   - 与现有 md 文件合并（按时间降序、合并同日标题、bid 去重）
   - 写回 md 文件
   - 追加 `已处理微博.jsonl` 元数据
   - 更新 `归档进度.json`
   - 更新年索引

4. **检查输出统计**：脚本返回 JSON 包含各月新增/合并/重复数量。

5. **清理临时文件**：确认结果无误后，删除下载的 JSON 文件。

### 方式二：桌面端 DOM 滚动搜索归档

#### 1. 打开用户主页

访问：

```text
https://weibo.com/u/{uid}
```

确认页面标题、账号名和 URL 正确。

#### 2. 搜索账号内微博

在专属输入框"搜索他的微博"中输入关键词并回车。不要误用顶部的全站"搜索微博"。

示例定位：

```javascript
const box = state.page.getByRole('textbox', { name: '搜索他的微博' });
await box.fill(keyword);
await box.press('Enter');
```

#### 3. 滚动并收集全部结果

微博搜索使用动态加载，应重复滚动、等待并累计唯一链接，直到连续多轮没有新增结果。每次只滚动一小步，滚动后立即收集，减少虚拟滚动遗漏。

同时提取两类地址：

##### 普通微博链接

典型格式：

```text
https://weibo.com/{uid}/{shortId}
```

从结果卡片中匹配该用户的微博正文链接。

##### 客户端二维码链接

桌面页面可能只显示：

```text
该内容请至手机客户端查看 查看二维码
```

"查看二维码"通常不是普通 `href`，目标地址位于 `<a>` 元素的 `qrcode` 自定义属性中：

```html
<a qrcode="https://weibo.com/detail/4195659102142971">查看二维码</a>
```

应读取：

```javascript
const urls = await page.locator('a[qrcode]').evaluateAll(elements =>
  elements.map(element => element.getAttribute('qrcode')).filter(Boolean)
);
```

不得因为卡片中没有普通 `href` 就忽略该结果。

#### 4. 转换为移动端链接

统一转换为：

```text
https://m.weibo.cn/status/{微博ID}
```

规则：

- 普通地址 `https://weibo.com/{uid}/{shortId}` → `{shortId}`；
- 二维码地址 `https://weibo.com/detail/{numericId}` → `{numericId}`。

注意：`m.weibo.com` 可能重定向回桌面站，移动站正确域名通常是 `m.weibo.cn`。

#### 5. 获取移动端正文

优先访问官方移动端状态页：

```text
https://m.weibo.cn/status/{ID}
```

可从页面正文读取，也可在该移动端页面上下文中读取其只读状态数据。需要保留：

- `created_at`：博文发布时间；
- `text_raw` 或页面显示正文；
- `retweeted_status.text_raw`：被转发原文；
- `retweeted_status.user.screen_name`：被转发作者名。

若正文 HTML 中没有 `text_raw`，应将 HTML 转为纯文本，但不得改变文字内容。

#### 6. 转发内容格式

若存在被转发原文，默认写为：

```markdown
汪海林的转发语……
@原博作者
原博正文……
```

若移动端仍返回以下提示，应原样保留：

- `抱歉，根据作者设置的微博可见时间范围，此微博已不可见。`
- `抱歉，此微博已被作者删除。`
- 账号违规、风险验证或其他平台限制提示。

不要声称已恢复平台未返回的内容。

## 分批抓取与临时清单

### 方式一（API 分页）的限速

API 分页方式无需逐条抓取，限速策略简化为：

- 每页请求间隔 600ms（可配置）
- **每次 evaluate 最多翻 10 页**（约 8-10 秒），超过会导致 SPA 导航中断
- 单次归档会话可累积多批，最终一次性下载 JSON
- 大量归档可分多次会话执行，每次从 `归档进度.json` 的 `lastPage` 继续

### 方式二（DOM 滚动）的临时文件

大量抓取前，分别创建：

```text
{关键词}_普通微博链接_临时.txt
{关键词}_客户端二维码链接_临时.txt
```

每行一个地址，去重保存。下载前先检查文件是否已存在，避免重复创建或覆盖有效进度。

### 批次规则（方式二适用）

每批：

1. 随机等待 30–60 秒；
2. 从临时文件头部读取最多 10 个地址；
3. 转换为移动端链接；
4. 逐条获取内容，批内请求间隔建议约 0.5–2 秒；
5. 写入正式文档；
6. 验证本批所有原始链接均已写入；
7. 仅对成功条目从临时文件移除地址；
8. 失败地址保留，记录错误，下一批或人工检查时重试。

若使用目标驱动执行，也必须遵守上述每批限制，不能一次性高频请求全部地址。

## HTML 清洗规则

API 返回的 `text` 字段为 HTML，需清洗为纯文本。清洗规则（在浏览器 evaluate 内执行）：

```javascript
function cleanHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, '\n');                           // <br> → 换行
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*\/?>/gi, '$1');      // <img alt="[xxx]"> → [xxx]
  s = s.replace(/<a[^>]*href='\/n\/[^']*'[^>]*>(@[^<]*)<\/a>/gi, '$1'); // @用户链接
  s = s.replace(/<a[^>]*><span class="surl-text">([^<]*)<\/span><\/a>/gi, '$1'); // #话题#链接
  s = s.replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1');                  // 其他<a>保留内部文本
  s = s.replace(/<\/?span[^>]*>/gi, '');                          // 去掉<span>包装
  s = s.replace(/<[^>]+>/g, '');                                  // 去掉其他HTML标签
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"').replace(/&#39;/g, "'");          // HTML实体解码
  s = s.replace(/\n?全文$/, '');                                  // 移除"全文"残留
  s = s.replace(/\n{3,}/g, '\n\n').trim();                        // 清理多余空行
  return s;
}
```

清洗后跳过以下内容：
- 正文为"转发微博"且无 `retweeted_status`（转发原文已不可见）
- 正文为空或仅含表情（如 `[赞]`，长度 ≤2 且匹配 `^\[.*\]$`）

## Markdown 输出规范

正式文档默认只保留发布时间、原始链接、正文，按时间倒序归类：

```markdown
# 2025年10月

## 2025-10-13

---

14:48 原始链接：https://m.weibo.cn/status/Q8W4Uq0cT

博文原文……
@被转发作者
被转发原文……

---

14:46 原始链接：https://m.weibo.cn/status/Q8W44ouUD

博文原文……
```

层级固定为：

- `# YYYY年M月`
- `## YYYY-MM-DD`
- 每条微博开头固定添加一行 Markdown 水平分隔符 `---`，分隔符与条目首行之间保留一个空行；日期标题后的第一条也必须添加
- 当日分时不使用标题，条目首行固定为 `HH:mm 原始链接：https://m.weibo.cn/status/{ID}`

不要加入作者、设备、IP、转发数、评论数、点赞数、"公开""分享这条博文"等信息，除非用户明确要求。

## 正式文档整理

分批追加可能造成相同月份重复或时间段落错位。全部抓取完成后必须整理：

1. 以 `---`、其后的 `HH:mm 原始链接：https://m.weibo.cn/status/{ID}` 首行及正文共同组成一个原子条目；
2. 依据对应 `## YYYY-MM-DD` 与条目首行的分时生成完整时间键；
3. 按时间倒序排列；
4. 合并重复的年月和日期标题；
5. 以原始链接作为主键去重；
6. 保证每个条目恰好一个原始链接。

移动或重排条目时，不得改变正文内容。

`02-merge.cjs` 脚本已内置上述整理逻辑，合并时自动完成排序、去重和标题合并。

## 最终质量检查

至少检查以下指标：

```text
separators     = 直接位于条目首行之前的 `---` 分隔符数量
entries        = 匹配"HH:mm 原始链接：https://m.weibo.cn/status/{ID}"的条目首行数量
withLink       = 含有效移动端原始链接的条目数量
uniqueLinks    = 唯一原始链接数量（用正文中 status/(\w+) 的唯一匹配数，避免正文中 --- 干扰）
missingLinks   = 缺失原始链接的条目
duplicateLinks = 重复原始链接
orderingBreaks = 时间倒序异常
```

完成条件：

```text
uniqueLinks == jsonl 记录数
missingLinks == 0
duplicateLinks == 0
orderingBreaks == 0
```

注意：`separators` 可能略大于 `entries`，因为微博正文中可能包含 `---` 字符。应以唯一 bid 数（`uniqueLinks`）作为权威计数。

确认完成后，临时文件可按用户要求移入系统废纸篓。

## 常见陷阱

### 1. 只统计普通链接

错误：只从 `article a[href]` 提取正文地址。

后果：大量旧微博仅显示二维码提示，会被漏掉。

正确做法：同时读取 `a[qrcode]` 的 `qrcode` 属性。

### 2. 使用错误的移动端域名

错误：`https://m.weibo.com/...`

该地址可能重定向回桌面站。

正确做法：`https://m.weibo.cn/status/{ID}`。

### 3. 把"客户端查看"当成不可访问

桌面端提示"请至手机客户端查看"不代表正文不可访问。应先访问移动端页面；只有移动端仍返回删除或权限提示，才认定受限。

### 4. 只保留转发语，不保留原博

移动端数据可能包含 `retweeted_status`。归档时应同时保留转发语和平台当前可见的原博正文。

### 5. 分批追加后不整理

追加方式容易产生重复月份标题和时间顺序异常。必须进行最终全量排序和去重检查。

### 6. 未验证就移除临时地址

写入失败或文档替换错误时会丢失进度。必须先验证原始链接确实出现在正式文档中，再从临时文件移除。

### 7. 依赖 DOM 滚动导致大量遗漏

错误：全量归档时使用桌面端 DOM 滚动收集 bid。

后果：微博桌面端使用虚拟滚动，DOM 节点同时只保留约 10-20 个 `<article>`，滚动过快时大量帖子被回收跳过。实测 67% 丢失率。

正确做法：全量归档使用移动端 API 分页（`containerid=107603{uid}&page=N`），100% 不遗漏。DOM 滚动仅用于关键词搜索场景。

### 8. 数据经过 LLM 中转导致截断

错误：在浏览器 evaluate 中 `console.log` 大量数据，通过 LLM 中转后再写入文件。

后果：MCP 工具输出有约 10KB 截断限制，大量数据无法完整传回。

正确做法：使用两段式脚本架构——浏览器端完成采集后直接下载 JSON 文件，Node.js 端直接读取 JSON 合并写入，LLM 全程不接触数据内容。

### 9. m.weibo.cn SPA 导航导致 evaluate 上下文销毁

错误：在 `state.api`（m.weibo.cn）页面执行长时间 `evaluate`（翻 200 页）。

后果：`m.weibo.cn` 是 SPA，空闲时自动加载更多内容或重定向，导致 `Execution context was destroyed` 错误。

正确做法：每次 `evaluate` 最多翻 10 页（约 8-10 秒），多次调用累积结果到 `state.collectAll`，最后一次性下载 JSON。

### 10. page.evaluate 只接受 1 个参数

错误：`page.evaluate(async (a, b) => {...}, 123, 142)`。

后果：报 `Too many arguments` 错误。

正确做法：用对象传参：`page.evaluate(async (params) => {...}, {s: 123, e: 142})`。

### 11. 在 state.api 页面触发下载导致导航冲突

错误：在 `state.api`（m.weibo.cn）页面创建 Blob 并触发下载。

后果：下载操作与 SPA 路由冲突，导致上下文销毁或下载失败。

正确做法：下载 JSON 必须在 `state.page`（桌面端 weibo.com）页面执行，桌面端更稳定。

### 12. Chrome 阻止多文件下载

错误：一次性触发多个文件下载。

后果：Chrome 只完成第一个文件，其余被静默阻止。

正确做法：逐个触发下载，每次间隔至少 1.5 秒。或合并为单个 JSON 文件下载。

## 安全与合规边界

- 仅归档用户有权访问的公开或已登录可见内容。
- 不绕过删除、封禁、作者可见范围、账号验证或其他服务端权限。
- 不模拟或逆向微博原生 App 签名、设备令牌和私有认证协议。
- 不发布、评论、点赞、转发、关注或修改微博账户状态。
- 控制请求频率，避免对平台造成负担。
- 遵守平台服务条款、著作权要求及用户所在地区法律。
