/**
 * 微博归档 — 浏览器端采集脚本（分批模式）
 *
 * 在 mcp__playwriter__execute 的 code 参数中运行。
 * 本脚本完成：翻页拉取 → 与已处理 bid 比对 → HTML 清洗 → Markdown 格式化 → 按月分组。
 * 最终通过浏览器下载一个 JSON 文件，LLM 无需查看数据内容，避免截断。
 *
 * ⚠️ 重要限制：
 *   1. m.weibo.cn 是 SPA 页面，长时间 evaluate 会因页面自动导航导致上下文销毁
 *      → 每次最多翻 10 页，多次调用累积结果到 state.collectAll
 *   2. page.evaluate 只接受 1 个参数（除函数外）
 *      → 用对象传参：{s: startPage, e: endPage}
 *   3. 下载文件必须在 state.page（桌面端 weibo.com）触发，不能在 state.api 触发
 *      → state.api 导航不稳定，下载会冲突
 *   4. reset 后 state 和 window.__processedBids 全部丢失，需要重新注入
 *
 * 使用方式（三步）：
 *
 * 步骤 1 — 初始化 + 注入 bid：
 *   // 从本地 jsonl 读取 bid 列表，注入到 state.api 的 window.__processedBids
 *   await state.api.evaluate(b => { window.__processedBids = b; return true; }, bidArray);
 *   // 初始化收集容器
 *   state.collectAll = { months: {}, meta: { totalScanned: 0, totalMissing: 0, totalSkipped: 0, lastPage: 0 } };
 *
 * 步骤 2 — 分批拉取（每批 10 页，重复调用直到到达目标页码）：
 *   // 将下面的 COLLECT_BATCH 代码作为 mcp__playwriter__execute 的 code 参数
 *   // 修改 {s: startPage, e: endPage} 为当前批次页码
 *
 * 步骤 3 — 格式化 + 下载（在 state.page 桌面端执行）：
 *   // 将下面的 FORMAT_AND_DOWNLOAD 代码作为 mcp__playwriter__execute 的 code 参数
 *   // 浏览器下载 weibo_archive_batch.json
 *   // 然后用 02-merge.cjs 处理
 */

// ============ 步骤 2：COLLECT_BATCH（每批10页，重复调用）============
// 以下代码作为一个完整的 mcp__playwriter__execute 调用

/*
const r = await state.api.evaluate(async (params) => {
  function cleanHtml(h) {
    if (!h) return '';
    let s = h;
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*\/?>/gi, '$1');
    s = s.replace(/<a[^>]*href='\/n\/[^']*'[^>]*>(@[^<]*)<\/a>/gi, '$1');
    s = s.replace(/<a[^>]*><span class="surl-text">([^<]*)<\/span><\/a>/gi, '$1');
    s = s.replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1');
    s = s.replace(/<\/?span[^>]*>/gi, '');
    s = s.replace(/<[^>]+>/g, '');
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    s = s.replace(/\n?全文$/, '');
    s = s.replace(/\n{3,}/g, '\n\n').trim();
    return s;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  const pb = new Set(window.__processedBids || []);
  const result = { months: {}, ts: 0, tm: 0, sk: 0, lp: 0 };
  for (let p = params.s; p <= params.e; p++) {
    try {
      const resp = await fetch('https://m.weibo.cn/api/container/getIndex?containerid=1076031497714867&page=' + p,
        { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const j = await resp.json();
      const cards = (j.data?.cards || []).filter(c => c.card_type === 9);
      if (cards.length === 0) { result.lp = p; break; }
      for (const c of cards) {
        const m = c.mblog; result.ts++;
        if (pb.has(m.bid)) continue;
        const tc = cleanHtml(m.text);
        if (tc === '转发微博' && !m.retweeted_status) { result.sk++; continue; }
        if (tc.length === 0 || (tc.length <= 2 && /^\[.*\]$/.test(tc))) { result.sk++; continue; }
        const d = new Date(m.created_at);
        const mo = d.getFullYear() + '-' + pad(d.getMonth() + 1);
        if (!result.months[mo]) result.months[mo] = [];
        let md = '---\n\n' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' 原始链接：https://m.weibo.cn/status/' + m.bid + '\n\n' + tc;
        if (m.retweeted_status) { md += '\n\n@' + (m.retweeted_status.user?.screen_name || '') + '\n\n' + cleanHtml(m.retweeted_status.text); }
        result.months[mo].push({ bid: m.bid, id: m.id, created_at: m.created_at, ts: d.getTime(), df: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), md: md });
        result.tm++;
      }
      result.lp = p;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 600));
  }
  return result;
}, { s: 123, e: 132 });  // ← 修改此处为当前批次的起止页码

// 合并到 state.collectAll
for (const [k, v] of Object.entries(r.months)) {
  if (!state.collectAll.months[k]) state.collectAll.months[k] = [];
  state.collectAll.months[k].push(...v);
}
state.collectAll.meta.totalScanned += r.ts;
state.collectAll.meta.totalMissing += r.tm;
state.collectAll.meta.totalSkipped += r.sk;
state.collectAll.meta.lastPage = r.lp;
const ms = {};
for (const [k, v] of Object.entries(state.collectAll.months)) ms[k] = v.length;
console.log(JSON.stringify({ batch: '123-132', s: r.ts, m: r.tm, sk: r.sk, lp: r.lp, cum: ms }, null, 2));
*/

// ============ 步骤 3：FORMAT_AND_DOWNLOAD（在 state.page 桌面端执行）============
// 以下代码作为一个完整的 mcp__playwriter__execute 调用

/*
const r = await state.page.evaluate(async (data) => {
  const result = { months: {}, meta: data.meta };
  for (const k of Object.keys(data.months)) {
    const items = data.months[k];
    items.sort((a, b) => b.ts - a.ts);
    let text = '';
    let prevDate = '';
    const meta = [];
    for (const item of items) {
      if (item.df !== prevDate) { text += '## ' + item.df + '\n\n'; prevDate = item.df; }
      text += item.md + '\n\n';
      meta.push({ bid: item.bid, id: item.id, created_at: item.created_at });
    }
    result.months[k] = { text, items: meta };
  }
  // 下载 JSON（在桌面端页面执行，避免 m.weibo.cn 导航冲突）
  const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'weibo_archive_batch.json'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const stats = {};
  for (const k of Object.keys(result.months)) stats[k] = result.months[k].items.length;
  return stats;
}, state.collectAll);
console.log(JSON.stringify(r, null, 2));
*/
