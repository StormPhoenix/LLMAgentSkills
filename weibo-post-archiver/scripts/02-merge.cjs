/**
 * 微博归档 — Node.js 落盘脚本
 *
 * 在 execute_javascript 中运行。读取 01-collect.cjs 下载的 JSON 文件，
 * 与现有 md 文件合并（按时间降序、合并同日标题、bid 去重），
 * 更新 jsonl/进度/索引，一次完成所有文件操作。
 *
 * 使用方式：
 *   const fs = require('fs');
 *   const path = require('path');
 *   // 将此文件内容传入 execute_javascript 的 code 参数
 *   // 修改 CONFIG 中的路径
 */

const fs = require('fs');
const path = require('path');

// ============ 配置 ============
const CONFIG = {
  archiveDir: '/Users/jiaxianwang/Workspace/RawResourceBase/汪海林/微博归档',
  batchJsonPath: '/Users/jiaxianwang/Downloads/ChromeDownload/weibo_archive_batch.json',
  uid: '1497714867',
  account: '汪海林'
};

// ============ HTML 清洗（用于已存在 md 中的条目解析，与采集脚本一致） ============
// （此函数仅用于验证，合并时按原始文本操作，不重新清洗已有内容）

// ============ 解析 md 文件中的条目 ============
function parseMdEntries(text) {
  const entries = [];
  const lines = text.split('\n');
  let currentDate = null;
  let currentEntry = null;
  let headerDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跳过文件标题
    if (line.startsWith('# 汪海林微博归档') && !headerDone) {
      headerDone = true;
      continue;
    }

    // 日期标题
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    // 分隔符 - 新条目开始
    if (line.trim() === '---') {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = { date: currentDate, content: '---\n' };
      continue;
    }

    if (currentEntry) {
      currentEntry.content += line + '\n';
    }
  }
  if (currentEntry) entries.push(currentEntry);
  return entries;
}

// ============ 从条目内容提取时间戳用于排序 ============
function extractTimestamp(entry) {
  const timeMatch = entry.content.match(/(\d{2}):(\d{2}) 原始链接/);
  const timeMinutes = timeMatch ? parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]) : 0;
  return entry.date + '|' + String(1440 - timeMinutes).padStart(5, '0'); // 降序：时间越大越前
}

// ============ 从条目提取 bid 用于去重 ============
function extractBid(entry) {
  const m = entry.content.match(/status\/(\w+)/);
  return m ? m[1] : null;
}

// ============ 主逻辑 ============
const batchData = JSON.parse(fs.readFileSync(CONFIG.batchJsonPath, 'utf-8'));
const stats = { months: {}, totalNewEntries: 0, totalExisting: 0, duplicates: 0 };

for (const [month, monthData] of Object.entries(batchData.months)) {
  const year = month.slice(0, 4);
  const monthNum = parseInt(month.slice(5));
  const yearDir = path.join(CONFIG.archiveDir, year);
  const mdPath = path.join(yearDir, `${month}.md`);
  const jsonlPath = path.join(CONFIG.archiveDir, '工作状态', '已处理微博.jsonl');

  // 确保年目录存在
  if (!fs.existsSync(yearDir)) fs.mkdirSync(yearDir, { recursive: true });

  // 读取现有 md（如果存在）
  let existingEntries = [];
  let header = `# ${CONFIG.account}微博归档：${year}年${monthNum}月\n\n`;
  if (fs.existsSync(mdPath)) {
    const existingText = fs.readFileSync(mdPath, 'utf-8');
    const headerMatch = existingText.match(/^# .+\n\n/);
    if (headerMatch) header = headerMatch[0];
    existingEntries = parseMdEntries(existingText);
  }
  stats.totalExisting += existingEntries.length;

  // 解析新条目
  const newEntries = parseMdEntries(monthData.text);
  stats.totalNewEntries += newEntries.length;

  // 合并，按 bid 去重
  const seenBids = new Set();
  const allEntries = [];

  for (const entry of [...existingEntries, ...newEntries]) {
    const bid = extractBid(entry);
    if (bid && seenBids.has(bid)) {
      stats.duplicates++;
      continue;
    }
    if (bid) seenBids.add(bid);
    allEntries.push(entry);
  }

  // 按日期降序，同日按时间降序
  allEntries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    // 同日内提取时间比较
    const ta = a.content.match(/(\d{2}):(\d{2})/);
    const tb = b.content.match(/(\d{2}):(\d{2})/);
    const va = ta ? parseInt(ta[1]) * 60 + parseInt(ta[2]) : 0;
    const vb = tb ? parseInt(tb[1]) * 60 + parseInt(tb[2]) : 0;
    return vb - va;
  });

  // 生成合并后的 md
  let mergedText = header;
  let prevDate = '';
  for (const entry of allEntries) {
    if (entry.date !== prevDate) {
      mergedText += `## ${entry.date}\n\n`;
      prevDate = entry.date;
    }
    mergedText += entry.content.trimEnd() + '\n\n';
  }
  fs.writeFileSync(mdPath, mergedText, 'utf-8');

  // 统计
  stats.months[month] = {
    existing: existingEntries.length,
    new: newEntries.length,
    merged: allEntries.length,
    duplicates: 0 // 已在上面累计
  };

  // 更新 jsonl — 追加新元数据
  const existingJsonlBids = new Set();
  if (fs.existsSync(jsonlPath)) {
    const lines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n').filter(l => l.trim());
    for (const l of lines) {
      try { existingJsonlBids.add(JSON.parse(l).bid); } catch (e) {}
    }
  }
  const newJsonlLines = monthData.items
    .filter(item => !existingJsonlBids.has(item.bid))
    .map(item => JSON.stringify({
      id: item.id,
      bid: item.bid,
      created_at: item.created_at,
      status: 'archived',
      reason: null,
      mobile_url: 'https://m.weibo.cn/status/' + item.bid
    }));
  if (newJsonlLines.length > 0) {
    fs.appendFileSync(jsonlPath, (fs.existsSync(jsonlPath) ? '\n' : '') + newJsonlLines.join('\n') + '\n', 'utf-8');
  }
}

// ============ 更新归档进度.json ============
const progressPath = path.join(CONFIG.archiveDir, '工作状态', '归档进度.json');
let progress = {};
if (fs.existsSync(progressPath)) {
  progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
}

// 统计 jsonl 总数
const jsonlPath = path.join(CONFIG.archiveDir, '工作状态', '已处理微博.jsonl');
const jsonlLines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n').filter(l => l.trim());
progress.archived_count = jsonlLines.length;
progress.last_updated = new Date().toISOString().slice(0, 10);
progress.methodology = 'mobile_api_pagination';
progress.phase = batchData.meta.lastPage ? `api_page_${batchData.meta.lastPage}` : 'api_backfill';
fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2) + '\n', 'utf-8');

// ============ 更新年索引 ============
function updateYearIndex(year) {
  const indexPath = path.join(CONFIG.archiveDir, year, `${year}年索引.md`);
  const monthFiles = fs.readdirSync(path.join(CONFIG.archiveDir, year))
    .filter(f => /^\d{4}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();

  let indexText = `# ${CONFIG.account}微博归档：${year}年\n\n## 月份\n\n`;
  for (const f of monthFiles) {
    const month = f.replace('.md', '');
    const fullText = fs.readFileSync(path.join(CONFIG.archiveDir, year, f), 'utf-8');
    // 用唯一 bid 数计算条目数（避免正文中 --- 干扰）
    const bids = new Set([...fullText.matchAll(/status\/(\w+)/g)].map(m => m[1]));
    indexText += `- [[${month}]]（${bids.size} 条）\n`;
  }
  fs.writeFileSync(indexPath, indexText, 'utf-8');
}

// 更新涉及的年份索引
const years = [...new Set(Object.keys(batchData.months).map(m => m.slice(0, 4)))];
for (const y of years) updateYearIndex(y);

// ============ 输出统计 ============
console.log(JSON.stringify({
  ...stats,
  totalArchived: jsonlLines.length,
  batchMeta: batchData.meta,
  jsonlTotal: jsonlLines.length
}, null, 2));
