/**
 * stock-query.cjs — 股票数据查询 Skill
 *
 * 纯 Node.js + HTTP 实现，不依赖任何外部二进制或第三方 npm 包。
 * 数据源：东方财富（A 股）+ 腾讯证券（A 股/港股/美股）
 */

// ============================================================
// 工具函数
// ============================================================

/**
 * HTTP GET 请求（使用全局 fetch）
 * options.raw: 返回文本而非 JSON
 * options.encoding: 指定文本编码（如 'gbk'），默认 'utf-8'
 */
async function httpGet(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || 10000)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: options.headers || {},
    })
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
    }
    if (options.raw || options.encoding) {
      if (options.encoding && options.encoding !== 'utf-8') {
        const buf = await resp.arrayBuffer()
        return new TextDecoder(options.encoding).decode(buf)
      }
      return resp.text()
    }
    return resp.json()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 解析股票代码，提取市场和纯代码
 * 输入格式：sh600519, sz000001, hk00700, usAAPL
 * 返回: { market: 'sh'|'sz'|'hk'|'us', code: '600519', original: 'sh600519' }
 */
function parseStockCode(codeStr) {
  const s = codeStr.trim().toLowerCase()
  const match = s.match(/^(sh|sz|hk|us)(.+)$/i)
  if (!match) {
    throw new Error(`无效的股票代码格式: "${codeStr}"，需要市场前缀（sh/sz/hk/us）`)
  }
  return {
    market: match[1].toLowerCase(),
    code: match[2].toUpperCase(),
    original: codeStr.trim(),
  }
}

/**
 * 将市场前缀代码转为东方财富 secid 格式
 * 沪市(sh) → 1.代码, 深市(sz) → 0.代码
 * 港股/美股不支持东方财富接口，会抛错
 */
function toEastmoneySecid(parsed) {
  if (parsed.market === 'sh') return `1.${parsed.code}`
  if (parsed.market === 'sz') return `0.${parsed.code}`
  throw new Error(`东方财富接口仅支持 A 股（sh/sz），当前: ${parsed.original}`)
}

/**
 * 将市场前缀代码转为腾讯证券格式
 * A 股: sh600519 / sz000001
 * 港股: hk00700 → r_hk00700
 * 美股: usAAPL → usAAPL.OQ (默认纳斯达克)
 */
function toTencentCode(parsed) {
  if (parsed.market === 'sh' || parsed.market === 'sz') {
    return `${parsed.market}${parsed.code}`
  }
  if (parsed.market === 'hk') {
    return `r_hk${parsed.code}`
  }
  if (parsed.market === 'us') {
    return `us${parsed.code}`
  }
  return parsed.original
}

// ============================================================
// 东方财富 API
// ============================================================

const EM_QUOTE_URL = 'https://push2.eastmoney.com/api/qt/stock/get'
const EM_KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const EM_SEARCH_URL = 'https://searchapi.eastmoney.com/api/suggest/get'

/**
 * 东方财富 — 搜索股票
 */
async function emSearch(keyword) {
  const url = `${EM_SEARCH_URL}?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`
  const data = await httpGet(url)

  if (!data?.QuotationCodeTable?.Data) {
    return []
  }

  return data.QuotationCodeTable.Data.map(item => ({
    code: item.Code,
    name: item.Name,
    market: item.MktNum === '1' ? 'sh' : item.MktNum === '0' ? 'sz' : item.MktNum === '116' ? 'hk' : item.MktNum === '105' ? 'us' : item.MktNum,
    quoteId: item.QuoteID,
    type: item.SecurityTypeName || '',
  }))
}

/**
 * 东方财富 — A 股实时行情
 * 返回字段参考: f43=最新价, f44=最高, f45=最低, f46=开盘, f47=成交量, f48=成交额
 * f51=涨停价, f52=跌停价, f57=代码, f58=名称, f60=昨收, f170=涨跌幅, f171=涨跌额
 * f116=总市值, f117=流通市值, f162=市盈率PE, f167=市净率PB
 */
async function emQuote(secid) {
  const fields = 'f43,f44,f45,f46,f47,f48,f51,f52,f57,f58,f60,f116,f117,f162,f167,f168,f170,f171'
  const url = `${EM_QUOTE_URL}?secid=${secid}&fields=${fields}`
  const data = await httpGet(url)

  if (!data?.data) {
    throw new Error('未获取到行情数据')
  }

  const d = data.data
  // 东方财富价格字段需要除以 100（部分为 1000 取决于股票价格精度）
  const divisor = 100
  return {
    code: d.f57,
    name: d.f58,
    price: d.f43 !== '-' ? d.f43 / divisor : null,
    high: d.f44 !== '-' ? d.f44 / divisor : null,
    low: d.f45 !== '-' ? d.f45 / divisor : null,
    open: d.f46 !== '-' ? d.f46 / divisor : null,
    volume: d.f47,           // 成交量（手）
    amount: d.f48,           // 成交额（元）
    limitUp: d.f51 !== '-' ? d.f51 / divisor : null,
    limitDown: d.f52 !== '-' ? d.f52 / divisor : null,
    prevClose: d.f60 !== '-' ? d.f60 / divisor : null,
    changePercent: d.f170 !== '-' ? d.f170 / divisor : null,  // 涨跌幅 %
    changeAmount: d.f171 !== '-' ? d.f171 / divisor : null,   // 涨跌额
    marketCap: d.f116,       // 总市值
    floatCap: d.f117,        // 流通市值
    pe: d.f162 !== '-' ? d.f162 / divisor : null,  // 市盈率
    pb: d.f167 !== '-' ? d.f167 / divisor : null,  // 市净率
  }
}

/**
 * 东方财富 — A 股 K 线
 * klt: 101=日, 102=周, 103=月, 1=1分, 5=5分, 15=15分, 30=30分, 60=60分
 * fqt: 0=不复权, 1=前复权, 2=后复权
 */
async function emKline(secid, klt = '101', limit = 20, fqt = '0') {
  const fields = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
  const url = `${EM_KLINE_URL}?secid=${secid}&klt=${klt}&fqt=${fqt}&lmt=${limit}&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=${fields}`
  const data = await httpGet(url)

  if (!data?.data?.klines) {
    throw new Error('未获取到 K 线数据')
  }

  return {
    code: data.data.code,
    name: data.data.name,
    klines: data.data.klines.map(line => {
      const parts = line.split(',')
      return {
        date: parts[0],       // 日期
        open: Number(parts[1]),
        close: Number(parts[2]),
        high: Number(parts[3]),
        low: Number(parts[4]),
        volume: Number(parts[5]),   // 成交量
        amount: Number(parts[6]),   // 成交额
        amplitude: parts[7],        // 振幅%
        changePercent: parts[8],    // 涨跌幅%
        changeAmount: parts[9],     // 涨跌额
        turnoverRate: parts[10],    // 换手率%
      }
    })
  }
}

// ============================================================
// 腾讯证券 API（用于港股/美股，以及 A 股备用）
// ============================================================

const QT_URL = 'https://qt.gtimg.cn/q='

/**
 * 腾讯证券 — 实时行情（支持 A 股/港股/美股）
 * 注意：返回数据为 GBK 编码
 */
async function tencentQuote(codes) {
  const url = `${QT_URL}${codes.join(',')}`
  const text = await httpGet(url, {
    encoding: 'gbk',
    headers: { Referer: 'https://stockapp.finance.qq.com' },
  })

  const results = []
  const lines = text.split(';').filter(l => l.trim())

  for (const line of lines) {
    const match = line.match(/v_([a-zA-Z_]\w*)="(.+)"/)
    if (!match) continue

    const rawCode = match[1]
    const fields = match[2].split('~')

    if (rawCode.startsWith('sh') || rawCode.startsWith('sz')) {
      // A 股: [1]=名称 [2]=代码 [3]=最新价 [4]=昨收 [5]=开盘 [6]=成交量
      // [31]=涨跌额 [32]=涨跌幅 [33]=最高 [34]=最低 [37]=成交额 [38]=换手率 [39]=PE
      results.push({
        market: rawCode.startsWith('sh') ? 'sh' : 'sz',
        code: fields[2],
        name: fields[1],
        price: Number(fields[3]),
        prevClose: Number(fields[4]),
        open: Number(fields[5]),
        volume: Number(fields[6]),
        high: Number(fields[33]),
        low: Number(fields[34]),
        changePercent: Number(fields[32]),
        changeAmount: Number(fields[31]),
        amount: Number(fields[37]),
        turnoverRate: Number(fields[38]),
        pe: Number(fields[39]),
        time: fields[30],
      })
    } else if (rawCode.startsWith('r_hk')) {
      // 港股: [1]=名称 [2]=代码 [3]=最新价 [4]=昨收 [5]=开盘
      // [29]=成交量 [30]=时间 [31]=涨跌额 [32]=涨跌幅 [33]=最高 [34]=最低
      // [35]=成交量 [36]=成交额 [39]=PE [46]=英文名
      results.push({
        market: 'hk',
        code: fields[2],
        name: fields[1],
        price: Number(fields[3]),
        prevClose: Number(fields[4]),
        open: Number(fields[5]),
        high: Number(fields[33]),
        low: Number(fields[34]),
        volume: Number(fields[29] || fields[35]),
        amount: Number(fields[36]),
        changePercent: Number(fields[32]),
        changeAmount: Number(fields[31]),
        pe: fields[39] ? Number(fields[39]) : null,
        nameEn: fields[46] || '',
        time: fields[30] || '',
      })
    } else if (rawCode.startsWith('us')) {
      // 美股: [1]=名称 [2]=代码 [3]=最新价 [4]=昨收 [5]=开盘 [6]=成交量
      // [30]=时间 [31]=涨跌额 [32]=涨跌幅% [33]=最高 [34]=最低
      // [36]=成交量 [37]=成交额 [39]=PE [44/45]=市值 [46]=英文名
      results.push({
        market: 'us',
        code: fields[2] || rawCode.replace('us', ''),
        name: fields[1],
        nameEn: fields[46] || '',
        price: Number(fields[3]),
        prevClose: Number(fields[4]),
        open: Number(fields[5]),
        high: Number(fields[33]),
        low: Number(fields[34]),
        volume: Number(fields[6] || fields[36]),
        amount: Number(fields[37]),
        changeAmount: Number(fields[31]),
        changePercent: Number(fields[32]),
        pe: fields[39] ? Number(fields[39]) : null,
        marketCap: fields[45] || fields[44] || '',
        currency: fields[35] || 'USD',
        time: fields[30] || '',
      })
    }
  }

  return results
}

// ============================================================
// 命令路由
// ============================================================

// K 线周期映射（用户友好名称 → 东方财富 klt 参数）
const KLINE_PERIOD_MAP = {
  'm1': '1', 'm5': '5', 'm15': '15', 'm30': '30', 'm60': '60', 'm120': '120',
  '1': '1', '5': '5', '15': '15', '30': '30', '60': '60', '120': '120',
  'day': '101', 'week': '102', 'month': '103', 'season': '104', 'year': '105',
  'd': '101', 'w': '102', 'm': '103',
}

// 复权映射
const FQ_MAP = {
  'qfq': '1', 'hfq': '2', 'bfq': '0',
  '前复权': '1', '后复权': '2', '不复权': '0',
}

/**
 * 命令: search — 搜索股票
 * args: 关键词
 */
async function cmdSearch(argsArr) {
  const keyword = argsArr.join(' ')
  if (!keyword) {
    return { error: '请提供搜索关键词，如 "茅台"、"腾讯"' }
  }

  const results = await emSearch(keyword)
  if (results.length === 0) {
    return { message: `未找到与 "${keyword}" 相关的股票` }
  }

  return {
    keyword,
    count: results.length,
    results: results.map(r => ({
      fullCode: `${r.market}${r.code}`,
      name: r.name,
      type: r.type,
    })),
  }
}

/**
 * 命令: quote — 实时行情
 * args: 代码（逗号分隔多只）
 */
async function cmdQuote(argsArr) {
  const codesStr = argsArr[0]
  if (!codesStr) {
    return { error: '请提供股票代码，如 sh600519 或 hk00700,usAAPL' }
  }

  const codeList = codesStr.split(',').map(c => c.trim()).filter(Boolean)
  const results = []

  // 区分 A 股和港美股
  const aCodes = []
  const hkusCodes = []
  for (const c of codeList) {
    const parsed = parseStockCode(c)
    if (parsed.market === 'sh' || parsed.market === 'sz') {
      aCodes.push(parsed)
    } else {
      hkusCodes.push(parsed)
    }
  }

  // A 股用东方财富（数据更丰富）
  for (const p of aCodes) {
    try {
      const secid = toEastmoneySecid(p)
      const data = await emQuote(secid)
      results.push({ ...data, source: 'eastmoney' })
    } catch (err) {
      results.push({ code: p.original, error: err.message })
    }
  }

  // 港美股用腾讯证券
  if (hkusCodes.length > 0) {
    try {
      const tencentCodes = hkusCodes.map(p => toTencentCode(p))
      const tencentResults = await tencentQuote(tencentCodes)
      for (const r of tencentResults) {
        results.push({ ...r, source: 'tencent' })
      }
    } catch (err) {
      for (const p of hkusCodes) {
        results.push({ code: p.original, error: err.message })
      }
    }
  }

  return results.length === 1 ? results[0] : { quotes: results }
}

/**
 * 命令: kline — K 线数据
 * args: <代码> [周期] [数量] [复权]
 */
async function cmdKline(argsArr) {
  if (argsArr.length < 1) {
    return { error: '格式: kline <代码> [周期] [数量] [复权]，如 kline sh600519 day 20 qfq' }
  }

  const parsed = parseStockCode(argsArr[0])
  const period = argsArr[1] || 'day'
  const limit = parseInt(argsArr[2]) || 20
  const fq = argsArr[3] || 'bfq'

  const klt = KLINE_PERIOD_MAP[period.toLowerCase()]
  if (!klt) {
    return { error: `不支持的周期: "${period}"，可选: day/week/month/season/year/m1/m5/m15/m30/m60/m120` }
  }
  const fqt = FQ_MAP[fq.toLowerCase()] || '0'

  if (parsed.market === 'sh' || parsed.market === 'sz') {
    const secid = toEastmoneySecid(parsed)
    return await emKline(secid, klt, limit, fqt)
  }

  // 港美股 K 线 — 用腾讯 web 接口
  return await tencentKline(parsed, period, limit)
}

/**
 * 腾讯 web K 线接口（港美股）
 */
async function tencentKline(parsed, period, limit) {
  const periodMap = { 'day': 'day', 'week': 'week', 'month': 'month' }
  const p = periodMap[period.toLowerCase()] || 'day'
  const code = parsed.market === 'hk' ? `hk${parsed.code}` : `us${parsed.code}`

  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},${p},,,${limit},qfq`
  const data = await httpGet(url)

  if (!data?.data?.[code]) {
    throw new Error('未获取到腾讯 K 线数据')
  }

  const stockData = data.data[code]
  const klineKey = p === 'day' ? 'qfqday' : p === 'week' ? 'qfqweek' : 'qfqmonth'
  const klines = stockData[klineKey] || stockData[p] || []

  return {
    code: parsed.original,
    name: stockData.qt?.[code]?.[1] || parsed.original,
    klines: klines.map(k => ({
      date: k[0],
      open: Number(k[1]),
      close: Number(k[2]),
      high: Number(k[3]),
      low: Number(k[4]),
      volume: Number(k[5]),
    })),
  }
}

/**
 * 命令: minute — 分时数据
 * args: <代码>
 */
async function cmdMinute(argsArr) {
  if (argsArr.length < 1) {
    return { error: '格式: minute <代码>，如 minute sh600519' }
  }

  const parsed = parseStockCode(argsArr[0])
  const code = parsed.market === 'hk' ? `hk${parsed.code}` : parsed.market === 'us' ? `us${parsed.code}` : `${parsed.market}${parsed.code}`

  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`
  const data = await httpGet(url)

  if (!data?.data?.[code]?.data?.data) {
    throw new Error('未获取到分时数据')
  }

  const minuteData = data.data[code].data
  // data.data 可能是数组或分号分隔的字符串
  const rawPoints = Array.isArray(minuteData.data)
    ? minuteData.data
    : minuteData.data.split(';').filter(Boolean)

  return {
    code: parsed.original,
    date: minuteData.date,
    prevClose: Number(minuteData.prec),
    points: rawPoints.map(point => {
      const parts = point.split(' ')
      return {
        time: parts[0],       // HHMM
        price: Number(parts[1]),
        volume: Number(parts[2]),
      }
    }),
  }
}

/**
 * 命令: finance — 财务数据（东方财富）
 * args: <代码> [类型]
 * 类型: summary(摘要) / income(利润表) / balance(资产负债表) / cashflow(现金流量表)
 */
async function cmdFinance(argsArr) {
  if (argsArr.length < 1) {
    return { error: '格式: finance <代码> [summary|income|balance|cashflow]，如 finance sh600519 summary' }
  }

  const parsed = parseStockCode(argsArr[0])
  const reportType = (argsArr[1] || 'summary').toLowerCase()

  if (parsed.market !== 'sh' && parsed.market !== 'sz') {
    return { error: '财务数据目前仅支持 A 股（sh/sz）' }
  }

  const secid = toEastmoneySecid(parsed)

  if (reportType === 'summary') {
    // 基本面摘要
    const fields = 'f57,f58,f84,f85,f116,f117,f162,f167,f168,f173,f183,f184,f185,f186,f187,f188,f189,f190'
    const url = `${EM_QUOTE_URL}?secid=${secid}&fields=${fields}`
    const data = await httpGet(url)
    if (!data?.data) throw new Error('未获取到财务摘要')
    const d = data.data
    return {
      code: d.f57,
      name: d.f58,
      totalShares: d.f84,       // 总股本
      floatShares: d.f85,       // 流通股本
      marketCap: d.f116,        // 总市值
      floatCap: d.f117,         // 流通市值
      pe: d.f162 ? d.f162 / 100 : null,   // 市盈率（接口返回需÷100）
      pb: d.f167 ? d.f167 / 100 : null,   // 市净率（接口返回需÷100）
      roe: d.f173 ?? null,                  // ROE %（已是百分比）
      grossMargin: d.f186 ?? null,          // 毛利率 %
      netMargin: d.f187 ?? null,            // 净利率 %
      revenue: d.f183,                      // 营收（元）
      revenueYoy: d.f184 ?? null,           // 营收同比增长 %
      profitYoy: d.f185 ?? null,            // 净利同比增长 %
      listDate: d.f189,                     // 上市日期
    }
  }

  // 利润表/资产负债表/现金流量表 — 用东方财富财报接口
  const typeMap = {
    'income': 'RPT_DMSK_FN_INCOME',
    'lrb': 'RPT_DMSK_FN_INCOME',
    'balance': 'RPT_DMSK_FN_BALANCE',
    'zcfz': 'RPT_DMSK_FN_BALANCE',
    'cashflow': 'RPT_DMSK_FN_CASHFLOW',
    'xjll': 'RPT_DMSK_FN_CASHFLOW',
  }

  const tableName = typeMap[reportType]
  if (!tableName) {
    return { error: `不支持的财报类型: "${reportType}"，可选: summary/income/balance/cashflow` }
  }

  const finUrl = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=${tableName}&filter=(SECUCODE%3D%22${parsed.code}.${parsed.market === 'sh' ? 'SH' : 'SZ'}%22)&pageSize=4&sortColumns=REPORT_DATE&sortTypes=-1`
  const finData = await httpGet(finUrl)

  if (!finData?.result?.data) {
    return { message: '未获取到财报数据，可能该股票暂无数据' }
  }

  return {
    code: parsed.original,
    reportType,
    periods: finData.result.data.length,
    data: finData.result.data,
  }
}

/**
 * 命令: profile — 公司简况
 * args: <代码>
 */
async function cmdProfile(argsArr) {
  if (argsArr.length < 1) {
    return { error: '格式: profile <代码>，如 profile sh600519' }
  }

  const parsed = parseStockCode(argsArr[0])
  if (parsed.market !== 'sh' && parsed.market !== 'sz') {
    return { error: '公司简况目前仅支持 A 股（sh/sz）' }
  }

  const marketCode = `${parsed.market === 'sh' ? 'SH' : 'SZ'}${parsed.code}`
  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${marketCode}`
  const data = await httpGet(url)

  if (!data?.jbzl?.[0]) {
    return { message: '未获取到公司信息' }
  }

  const d = data.jbzl[0]
  return {
    code: parsed.original,
    name: d.SECURITY_NAME_ABBR,
    fullName: d.ORG_NAME,
    nameEn: d.ORG_NAME_EN,
    industry: d.INDUSTRYCSRC1,
    trade: d.EM2016,
    area: d.PROVINCE,
    city: d.CITY,
    listDate: d.LISTING_DATE,
    chairman: d.CHAIRMAN,
    manager: d.GENERAL_MANAGER,
    secretary: d.SECRETARY,
    registeredCapital: d.REG_CAPITAL,
    employees: d.EMP_NUM,
    website: d.ORG_WEB,
    email: d.ORG_EMAIL,
    introduction: d.ORG_PROFILE,
  }
}

/**
 * 命令: news — 新闻资讯（东方财富）
 * args: <代码> [页数] [每页数量]
 */
async function cmdNews(argsArr) {
  if (argsArr.length < 1) {
    return { error: '格式: news <代码> [页数] [每页数量]，如 news sh600519 1 10' }
  }

  const parsed = parseStockCode(argsArr[0])
  const page = parseInt(argsArr[1]) || 1
  const pageSize = parseInt(argsArr[2]) || 10

  if (parsed.market !== 'sh' && parsed.market !== 'sz') {
    return { error: '新闻资讯目前仅支持 A 股（sh/sz）' }
  }

  const code = `${parsed.code}.${parsed.market === 'sh' ? 'SH' : 'SZ'}`
  const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=&param=%7B%22uid%22%3A%22%22%2C%22keyword%22%3A%22${code}%22%2C%22type%22%3A%5B%22cmsArticleWebOld%22%5D%2C%22client%22%3A%22web%22%2C%22clientType%22%3A%22web%22%2C%22clientVersion%22%3A%22curr%22%2C%22param%22%3A%7B%22cmsArticleWebOld%22%3A%7B%22searchScope%22%3A%22default%22%2C%22sort%22%3A%22default%22%2C%22pageIndex%22%3A${page}%2C%22pageSize%22%3A${pageSize}%2C%22preTag%22%3A%22%22%2C%22postTag%22%3A%22%22%7D%7D%7D`

  try {
    const text = await httpGet(url, { raw: true })
    // 尝试去除 JSONP 包裹
    const jsonStr = text.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '')
    const data = JSON.parse(jsonStr)

    const articles = data?.result?.cmsArticleWebOld || []
    return {
      code: parsed.original,
      page,
      count: articles.length,
      news: articles.map(a => ({
        title: a.title?.replace(/<[^>]+>/g, '') || '',
        date: a.date,
        source: a.mediaName,
        url: a.url,
      })),
    }
  } catch {
    // 备用：用东方财富资讯列表
    return { code: parsed.original, message: '新闻接口暂时不可用，请稍后重试' }
  }
}

/**
 * 命令: fund — 资金流向（东方财富）
 * args: <代码> [天数]
 */
async function cmdFund(argsArr) {
  if (argsArr.length < 1) {
    return { error: '格式: fund <代码> [天数]，如 fund sh600519 10' }
  }

  const parsed = parseStockCode(argsArr[0])
  if (parsed.market !== 'sh' && parsed.market !== 'sz') {
    return { error: '资金流向目前仅支持 A 股（sh/sz）' }
  }

  const secid = toEastmoneySecid(parsed)
  const days = parseInt(argsArr[1]) || 10

  // 历史日级资金流
  const url = `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=${secid}&lmt=${days}&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57`
  const data = await httpGet(url)

  if (!data?.data?.klines) {
    return { message: '未获取到资金流向数据' }
  }

  return {
    code: parsed.original,
    name: data.data.name,
    days,
    flows: data.data.klines.map(line => {
      const parts = line.split(',')
      return {
        date: parts[0],
        mainInflow: Number(parts[1]),    // 主力净流入
        smallInflow: Number(parts[2]),   // 小单净流入
        retailInflow: Number(parts[3]),  // 散户净流入
        superInflow: Number(parts[4]),   // 超大单净流入
        largeInflow: Number(parts[5]),   // 大单净流入
      }
    }),
  }
}

/**
 * 命令: rank — 涨跌排行
 * args: [类型] [数量]
 * 类型: up(涨幅榜) / down(跌幅榜) / volume(成交量) / amount(成交额)
 */
async function cmdRank(argsArr) {
  const type = (argsArr[0] || 'up').toLowerCase()
  const limit = parseInt(argsArr[1]) || 20

  const sortMap = {
    'up': 'f3', 'down': 'f3', 'volume': 'f5', 'amount': 'f6',
    '涨幅': 'f3', '跌幅': 'f3', '成交量': 'f5', '成交额': 'f6',
  }
  const sortField = sortMap[type] || 'f3'
  const asc = (type === 'down' || type === '跌幅') ? 0 : 1

  const fields = 'f2,f3,f4,f5,f6,f7,f12,f14'
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${limit}&po=${asc}&fid=${sortField}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=${fields}`
  const data = await httpGet(url)

  if (!data?.data?.diff) {
    return { message: '未获取到排行数据' }
  }

  // diff 可能是对象（数字键）而非数组
  const diffArr = Array.isArray(data.data.diff)
    ? data.data.diff
    : Object.values(data.data.diff)

  return {
    type,
    count: diffArr.length,
    list: diffArr.map(d => ({
      code: d.f12,
      name: d.f14,
      price: d.f2 / 100,
      changePercent: d.f3 / 100,
      changeAmount: d.f4 / 100,
      volume: d.f5,
      amount: d.f6,
      amplitude: d.f7 / 100,
    })),
  }
}

// ============================================================
// 主入口
// ============================================================

const COMMANDS = {
  search: cmdSearch,
  quote: cmdQuote,
  kline: cmdKline,
  minute: cmdMinute,
  finance: cmdFinance,
  profile: cmdProfile,
  news: cmdNews,
  fund: cmdFund,
  rank: cmdRank,
}

/**
 * Skill execute 入口
 */
async function execute(input, context) {
  const { command, args: argsStr } = input

  if (!command || typeof command !== 'string') {
    return {
      error: '缺少 command 参数',
      available: Object.keys(COMMANDS).join(', '),
    }
  }

  const cmd = command.toLowerCase()
  const handler = COMMANDS[cmd]

  if (!handler) {
    return {
      error: `未知命令: "${command}"`,
      available: Object.keys(COMMANDS).join(', '),
    }
  }

  // 解析参数
  const argsArr = argsStr
    ? (argsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []).map(p => p.replace(/^['"]|['"]$/g, ''))
    : []

  try {
    const result = await handler(argsArr)
    return { success: true, command: cmd, ...result }
  } catch (err) {
    return { error: `${cmd} 执行失败: ${err.message || String(err)}` }
  }
}

module.exports = { execute }
