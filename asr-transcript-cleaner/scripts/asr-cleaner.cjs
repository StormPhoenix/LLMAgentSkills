/**
 * ASR 转录文本清洗脚本（Craft Skill 工具脚本）
 *
 * 功能：
 *   1. 去除 ASR 字间空格
 *   2. 基于口语模式保守插入标点
 *   3. 按句末标点换行，每行不超过 100 个原始字符
 *   4. 无损校验（去标点去换行后与源文去空格后完全一致）
 *
 * 通过 Craft Skill 的 execute(input, context) 模式调用。
 * 规则参考：asr-transcript-cleaner SKILL.md
 */

const fs = require("fs");
const path = require("path");

// ============================================================
// 配置
// ============================================================

const MAX_CHARS_PER_LINE = 100;

// 允许插入的标点
const PUNCT = {
  COMMA: "，",
  PERIOD: "。",
  QUESTION: "？",
  EXCLAIM: "！",
  SEMICOLON: "；",
  COLON: "：",
  ENUM: "、",
  QUOTE_OPEN: "\u201c", // "
  QUOTE_CLOSE: "\u201d", // "
  PAREN_OPEN: "（",
  PAREN_CLOSE: "）",
};

// 句末标点集合（用于换行判断）
const SENTENCE_END_PUNCT = new Set([
  PUNCT.PERIOD,
  PUNCT.QUESTION,
  PUNCT.EXCLAIM,
]);

// 所有可插入的标点集合（用于校验时移除）
const ALL_INSERTABLE_PUNCT = new Set(Object.values(PUNCT));

// ============================================================
// 标点插入规则
// ============================================================

/**
 * 基于口语模式的标点插入。
 *
 * 策略：在特定词语/模式前后插入逗号或句末标点。
 * 保守原则：只在明确的语义停顿点插入，不过度标点化。
 *
 * 规则按优先级排列，先匹配的先生效。
 */

// 句末标点规则：在特定模式后插入句号/问号/感叹号
const SENTENCE_END_RULES = [
  // 疑问句结尾
  { pattern: /吗$/, punct: PUNCT.QUESTION },
  { pattern: /吧$/, punct: PUNCT.QUESTION }, // "吧"有时是疑问
  // 但"吧"更多是语气词，用句号更安全 -> 移除，避免过度

  // 感叹/强烈语气
  { pattern: /我操$/, punct: PUNCT.EXCLAIM },
  { pattern: /我靠$/, punct: PUNCT.EXCLAIM },
  { pattern: /我的妈$/, punct: PUNCT.EXCLAIM },
  { pattern: /我的发$/, punct: PUNCT.EXCLAIM },
  { pattern: /完了$/, punct: PUNCT.EXCLAIM },
  { pattern: /炸了$/, punct: PUNCT.EXCLAIM },
  { pattern: /急了$/, punct: PUNCT.EXCLAIM },
  { pattern: /爆了$/, punct: PUNCT.EXCLAIM },
  { pattern: /跳了$/, punct: PUNCT.EXCLAIM },
  { pattern: /死定了$/, punct: PUNCT.EXCLAIM },
  { pattern: /太恐怖了$/, punct: PUNCT.EXCLAIM },
  { pattern: /太夸张了$/, punct: PUNCT.EXCLAIM },
  { pattern: /太逆天了$/, punct: PUNCT.EXCLAIM },
  { pattern: /太抽象了$/, punct: PUNCT.EXCLAIM },
  { pattern: /太唐了$/, punct: PUNCT.EXCLAIM },
  { pattern: /受不了了$/, punct: PUNCT.EXCLAIM },
  { pattern: /没招了$/, punct: PUNCT.EXCLAIM },
  { pattern: /没有办[法宝]$/, punct: PUNCT.EXCLAIM },
  { pattern: /再见$/, punct: PUNCT.EXCLAIM },
  { pattern: /拜拜$/, punct: PUNCT.EXCLAIM },
];

// 逗号插入规则：在特定词语前插入逗号（表示停顿/转折）
const COMMA_BEFORE_WORDS = [
  "但是",
  "但是吧",
  "不过",
  "然后",
  "然后呢",
  "所以说",
  "所以",
  "实际上",
  "其实",
  "我觉得",
  "我认为",
  "我个人觉得",
  "说实话",
  "说白",
  "说白了",
  "也就是",
  "也就是说",
  "对吧",
  "好吧",
  "那么",
  "嗯",
  "呃",
  "哎",
  "哎呀",
  "哎呦",
  "啊",
  "大概",
  "比如",
  "比如说",
  "比如",
  "当然",
  "当然了",
  "不过呢",
  "那么",
  "反正",
  "总之",
  "那",
  "这",
  "这个",
  "那个",
  "就是",
  "就是说",
  "就好",
  "对",
  "是的",
  "是的呀",
  "好的",
  "好吧",
];

// 逗号插入规则：在特定词语后插入逗号
const COMMA_AFTER_WORDS = [
  "然后",
  "那么",
  "所以说",
  "所以",
  "实际上",
  "其实",
  "说实话",
  "说白",
  "说白了",
  "也就是说",
  "对吧",
  "好吧",
  "大概",
  "当然",
  "当然了",
  "总之",
  "嗯",
  "哎",
  "哎呀",
  "哎呦",
];

// ============================================================
// 核心清洗函数
// ============================================================

/**
 * 去除所有空格和制表符（保留所有非空格字符）
 */
function removeSpaces(text) {
  return text.replace(/[\s\t]/g, "");
}

/**
 * 基于规则保守插入标点
 *
 * 策略：
 * 1. 先按"自然句"切分（基于常见的句末词语模式）
 * 2. 在每个自然句内部，按逗号规则插入逗号
 * 3. 在自然句末尾插入句末标点
 *
 * 注意：这是基于规则的标点插入，不如人工精确，
 *       但保证了无损性（不删除任何字符）。
 */
function insertPunctuation(text) {
  if (!text) return text;

  let result = text;

  // --- 步骤1：在特定词语前插入逗号 ---
  // 按"倒序"处理，避免位置偏移问题
  // 但更简单的方法是使用正则替换
  for (const word of COMMA_BEFORE_WORDS) {
    // 只在词语前面不是标点时插入
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`([^，。？！；：、）】》」』"'])(?<!)${escaped}`, "g"),
      (match, p1) => {
        // p1 是前一个字符，如果是标点则不重复插入
        if (ALL_INSERTABLE_PUNCT.has(p1)) {
          return match;
        }
        return p1 + PUNCT.COMMA + word;
      }
    );
  }

  // --- 步骤2：在特定词语后插入逗号 ---
  for (const word of COMMA_AFTER_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`${escaped}([^，。？！；：、（【《「『"'])`, "g"),
      (match, p1) => {
        if (ALL_INSERTABLE_PUNCT.has(p1)) {
          return match;
        }
        return word + PUNCT.COMMA + p1;
      }
    );
  }

  // --- 步骤3：在句末模式后插入句末标点 ---
  // 这些模式通常表示一个句子的结束
  const sentenceEndPatterns = [
    // 疑问句
    [/吗[^，。？！]/g, (m) => m[0] + PUNCT.QUESTION + m[1]],
    [/对不对[^，。？！]/g, (m) => m[0] + "对不对" + PUNCT.QUESTION],
    [/懂不懂[^，。？！]/g, (m) => m[0] + "懂不懂" + PUNCT.QUESTION],
    [/是不是[^，。？！]/g, (m) => m[0] + "是不是" + PUNCT.QUESTION],
    [/有没有[^，。？！]/g, (m) => m[0] + "有没有" + PUNCT.QUESTION],
    [/能不能[^，。？！]/g, (m) => m[0] + "能不能" + PUNCT.QUESTION],
    [/为什么[^，。？！]/g, (m) => m[0] + "为什么" + PUNCT.QUESTION],
    [/怎么办[^，。？！]/g, (m) => m[0] + "怎么办" + PUNCT.QUESTION],
  ];

  // 注意：上面的正则替换有问题，需要更精确的方法
  // 暂时不做句末标点，只做逗号插入

  return result;
}

/**
 * 简化版标点插入：基于"自然断句点"插入句号和逗号
 *
 * 自然断句点的判断依据：
 * - 语气词结尾（啊、呢、吧、嘛、呗）
 * - 转折/连接词开头（但是、然后、所以说）
 * - 重复的语气词（嗯嗯嗯、哈哈哈哈）
 */
function insertPunctuationSimple(text) {
  if (!text) return text;

  let result = text;

  // 在以下词语前插入逗号（如果前面不是标点）
  const commaBeforePatterns = [
    "但是",
    "不过",
    "然后",
    "所以说",
    "实际上",
    "其实",
    "我觉得",
    "我认为",
    "说实话",
    "说白了",
    "也就是说",
    "那么",
    "大概",
    "比如说",
    "当然",
    "反正",
    "总之",
    "不过呢",
    "就是说",
    "反过来",
    "另一方面",
    "此外",
    "同时",
    "并且",
    "而且",
    "另外",
    "首先",
    "其次",
    "最后",
    "要么",
    "不然",
    "否则",
    "因为",
    "由于",
    "虽然",
    "尽管",
    "哪怕",
    "即使",
    "只要",
    "只有",
    "除非",
    "无论",
    "不管",
    "一旦",
    "如果",
    "假如",
  ];

  // 在以下词语后插入逗号（如果后面不是标点）
  // 注意：只保留 >=2 字的词语，避免单字误匹配
  const commaAfterPatterns = [
    "然后",
    "那么",
    "所以说",
    "实际上",
    "说实话",
    "说白了",
    "也就是说",
    "大概",
    "当然",
    "总之",
    "哎呀",
    "哎呦",
    "好的",
    "好吧",
    "是的",
  ];

  // 在以下词语后插入句号（表示句子结束）
  const periodAfterPatterns = [
    "完了",
    "结束了",
    "就这样",
    "就是这样",
    "无所谓",
    "没招了",
    "没办法",
    "再见",
    "拜拜",
    "算了吧",
    "拉倒吧",
  ];

  // 感叹号词语
  const exclaimAfterPatterns = [
    "我操",
    "我靠",
    "我的妈",
    "我的发",
    "我的妈呀",
    "太恐怖了",
    "太夸张了",
    "太逆天了",
    "太抽象了",
    "太唐了",
    "受不了了",
    "没绷住",
    "死定了",
    "疯了",
    "发狂了",
  ];

  // 问号词语（在特定词后加问号）
  const questionAfterPatterns = [
    "是不是",
    "对不对",
    "懂不懂",
    "有没有",
    "能不能",
    "为什么",
    "怎么办",
    "怎么样",
    "什么意思",
  ];

  // --- 执行替换 ---

  // 1. 在词语前插入逗号（从长到短排序，避免短词先匹配导致长词被拆分）
  const sortedBefore = [...commaBeforePatterns].sort((a, b) => b.length - a.length);
  for (const word of sortedBefore) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 不在行首，且前面不是标点
    result = result.replace(
      new RegExp(`([^，。？！；：、）】》」』"'\n])${escaped}`, "g"),
      (match, p1) => {
        return p1 + PUNCT.COMMA + word;
      }
    );
  }

  // 2. 在词语后插入逗号（从长到短排序）
  const sortedAfter = [...commaAfterPatterns].sort((a, b) => b.length - a.length);
  for (const word of sortedAfter) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`${escaped}([^，。？！；：、（【《「『"'\n])`, "g"),
      (match, p1) => {
        return word + PUNCT.COMMA + p1;
      }
    );
  }

  // 3. 在词语后插入句号
  for (const word of periodAfterPatterns) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`${escaped}([^，。？！；：、（【《「『"'\n])`, "g"),
      (match, p1) => {
        return word + PUNCT.PERIOD + p1;
      }
    );
  }

  // 4. 在词语后插入感叹号
  for (const word of exclaimAfterPatterns) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`${escaped}([^，。？！；：、（【《「『"'\n])`, "g"),
      (match, p1) => {
        return word + PUNCT.EXCLAIM + p1;
      }
    );
  }

  // 5. 问号：在特定疑问词组后加问号
  for (const word of questionAfterPatterns) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`${escaped}([^，。？！；：、（【《「『"'\n])`, "g"),
      (match, p1) => {
        return word + PUNCT.QUESTION + p1;
      }
    );
  }

  // 6. 单独的"吗"后面加问号（如果后面不是标点）
  result = result.replace(
    /吗([^，。？！；：、（【《「『"'\n])/g,
    (match, p1) => "吗" + PUNCT.QUESTION + p1
  );

  // 7. 在文本末尾加句号（如果没有标点结尾）
  if (result.length > 0 && !SENTENCE_END_PUNCT.has(result[result.length - 1])) {
    result += PUNCT.PERIOD;
  }

  return result;
}

// ============================================================
// 换行函数
// ============================================================

/**
 * 按句末标点换行，每行不超过 MAX_CHARS_PER_LINE 个原始字符
 *
 * 规则：
 * 1. 在句末标点（。？！）后换行
 * 2. 如果一行超过 MAX_CHARS_PER_LINE 个原始字符，在最近的逗号处换行
 * 3. 如果没有逗号且仍超限，在第 MAX_CHARS_PER_LINE 个字符处硬换行
 */
function applyLineBreaks(text) {
  const lines = [];
  let currentLine = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    currentLine += char;

    // 统计当前行的原始字符数（不含标点）
    const origCharCount = countOriginalChars(currentLine);

    // 如果是句末标点，换行
    if (SENTENCE_END_PUNCT.has(char)) {
      lines.push(currentLine);
      currentLine = "";
      continue;
    }

    // 如果超过限制，在最近的逗号处换行
    if (origCharCount >= MAX_CHARS_PER_LINE) {
      // 找到当前行中最后一个逗号
      const lastCommaIdx = currentLine.lastIndexOf(PUNCT.COMMA);
      if (lastCommaIdx > 0) {
        // 在逗号后换行
        const before = currentLine.substring(0, lastCommaIdx + 1);
        const after = currentLine.substring(lastCommaIdx + 1);
        lines.push(before);
        currentLine = after;
      } else {
        // 没有逗号，硬换行
        lines.push(currentLine);
        currentLine = "";
      }
    }
  }

  // 处理剩余内容
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

/**
 * 统计原始字符数（不含标点）
 */
function countOriginalChars(text) {
  let count = 0;
  for (const char of text) {
    if (!ALL_INSERTABLE_PUNCT.has(char) && char !== "\n") {
      count++;
    }
  }
  return count;
}

// ============================================================
// 校验函数
// ============================================================

/**
 * 无损校验：去标点去换行后与源文去空格后完全一致
 */
function validate(sourceText, cleanedText) {
  // 源文去空格、制表符、换行、标点（源文可能已含标点）
  const sourceNoSpaceRaw = sourceText.replace(/[\s\t\n]/g, "");
  let sourceNoPunct = "";
  for (const char of sourceNoSpaceRaw) {
    if (!ALL_INSERTABLE_PUNCT.has(char)) {
      sourceNoPunct += char;
    }
  }

  // 清洗输出去标点、换行、空格
  let cleanedNoPunct = "";
  for (const char of cleanedText) {
    if (!ALL_INSERTABLE_PUNCT.has(char) && !/[\s\t\n]/.test(char)) {
      cleanedNoPunct += char;
    }
  }

  const isPass = sourceNoPunct === cleanedNoPunct;

  // 找到第一个差异
  let firstDiff = null;
  if (!isPass) {
    const minLen = Math.min(sourceNoPunct.length, cleanedNoPunct.length);
    for (let i = 0; i < minLen; i++) {
      if (sourceNoPunct[i] !== cleanedNoPunct[i]) {
        const ctxStart = Math.max(0, i - 15);
        firstDiff = {
          index: i,
          sourceContext: sourceNoPunct.substring(ctxStart, i + 15),
          cleanedContext: cleanedNoPunct.substring(ctxStart, i + 15),
        };
        break;
      }
    }
    if (!firstDiff && sourceNoPunct.length !== cleanedNoPunct.length) {
      firstDiff = {
        index: minLen,
        sourceContext: "长度差异",
        cleanedContext: `源文=${sourceNoPunct.length}, 清洗=${cleanedNoPunct.length}`,
      };
    }
  }

  return {
    isPass,
    sourceLength: sourceNoPunct.length,
    cleanedLength: cleanedNoPunct.length,
    firstDiff,
  };
}

// ============================================================
// 主清洗流程
// ============================================================

/**
 * 清洗单个文件
 */
function cleanFile(sourcePath, outputPath) {
  // 读取源文件
  const sourceText = fs.readFileSync(sourcePath, "utf-8");

  // 去空格
  const noSpaceText = removeSpaces(sourceText);

  // 插入标点
  const punctuatedText = insertPunctuationSimple(noSpaceText);

  // 换行
  const finalText = applyLineBreaks(punctuatedText);

  // 写入输出文件（Markdown 格式，含一级标题）
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const mdContent = `# ${stem}\n\n${finalText}\n`;
  fs.writeFileSync(outputPath, mdContent, "utf-8");

  // 校验
  const validation = validate(sourceText, finalText);

  return {
    sourcePath,
    outputPath,
    sourceCharCount: sourceText.length,
    noSpaceCharCount: noSpaceText.length,
    cleanedCharCount: finalText.length,
    lineCount: finalText.split("\n").length,
    validation,
  };
}

/**
 * 生成校验报告
 */
function generateCheckReport(result) {
  const { sourcePath, outputPath, sourceCharCount, noSpaceCharCount, validation } = result;
  const v = validation;

  let report = `# 标点清洗校验报告\n\n`;
  report += `- 源文件：\`${path.basename(sourcePath)}\`\n`;
  report += `- 输出文件：\`${path.basename(outputPath)}\`\n`;
  report += `- 原文字符数（含空格）：${sourceCharCount}\n`;
  report += `- 源文去空格字符数：${noSpaceCharCount}\n`;
  report += `- 清洗去标点字符数：${v.cleanedLength}\n`;
  report += `- 校验结果：${v.isPass ? "PASS" : "FAIL"}\n`;
  report += `- 首个差异：`;
  if (v.firstDiff) {
    report += `index=${v.firstDiff.index}\n`;
    report += `  - 源文上下文：...${v.firstDiff.sourceContext}...\n`;
    report += `  - 清洗上下文：...${v.firstDiff.cleanedContext}...\n`;
  } else {
    report += `无\n`;
  }

  return report;
}

// ============================================================
// 批量处理
// ============================================================

/**
 * 批量处理目录下所有 .txt 文件
 */
function cleanDirectory(sourceDir, outputDir, checkOnly = false) {
  // 确保输出目录存在
  if (!checkOnly) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  // 获取所有 .txt 文件
  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  const results = [];

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const stem = file.replace(/\.txt$/, "");
    const outputPath = path.join(outputDir, stem + ".md");
    const checkPath = path.join(outputDir, stem + ".check.md");

    if (checkOnly) {
      // 仅校验模式：检查已有的输出文件
      if (!fs.existsSync(outputPath)) {
        console.log(`[SKIP] 输出文件不存在: ${file}`);
        continue;
      }
      const sourceText = fs.readFileSync(sourcePath, "utf-8");
      const cleanedText = fs.readFileSync(outputPath, "utf-8");
      // 去除 Markdown 标题行后再校验
      const strippedText = cleanedText.replace(/^# .+\n\n/, "");
      const validation = validate(sourceText, strippedText);
      results.push({
        sourcePath,
        outputPath,
        sourceCharCount: sourceText.length,
        noSpaceCharCount: removeSpaces(sourceText).length,
        cleanedCharCount: cleanedText.length,
        lineCount: cleanedText.split("\n").length,
        validation,
      });
    } else {
      const result = cleanFile(sourcePath, outputPath);
      // 写入校验报告
      const report = generateCheckReport(result);
      fs.writeFileSync(checkPath, report, "utf-8");
      results.push(result);
    }
  }

  return results;
}

// ============================================================
// Skill 工具入口（execute 模式）
// ============================================================

/**
 * ASR 转录文本清洗工具入口
 *
 * @param {Object} input - 输入参数
 * @param {string} input.sourcePath - 源文件或目录的绝对路径（文件→单文件，目录→批量）
 * @param {string} input.outputPath - 输出文件或目录的绝对路径
 * @param {boolean} [input.checkOnly=false] - 仅校验不重新清洗（批量模式下使用已有输出文件做校验）
 * @param {Object} context - Craft 运行时上下文
 * @returns {Object} { success, result, ...details }
 */
async function execute(input, context) {
  const { sourcePath, outputPath, checkOnly = false } = input;

  if (!sourcePath) return { success: false, error: '缺少 sourcePath 参数' };
  if (!outputPath) return { success: false, error: '缺少 outputPath 参数' };
  if (!fs.existsSync(sourcePath)) return { success: false, error: `源路径不存在: ${sourcePath}` };

  const stat = fs.statSync(sourcePath);

  if (stat.isDirectory()) {
    // ---- 批量模式 ----
    const results = cleanDirectory(sourcePath, outputPath, checkOnly);

    const passCount = results.filter((r) => r.validation.isPass).length;
    const failCount = results.filter((r) => !r.validation.isPass).length;
    const failedFiles = results
      .filter((r) => !r.validation.isPass)
      .map((r) => ({
        file: path.basename(r.sourcePath),
        firstDiff: r.validation.firstDiff,
      }));

    return {
      success: failCount === 0,
      result: `批量处理完成: 共 ${results.length} 个文件，通过 ${passCount}，失败 ${failCount}`,
      totalFiles: results.length,
      passCount,
      failCount,
      failedFiles,
      results: results.map((r) => ({
        file: path.basename(r.sourcePath),
        sourceChars: r.noSpaceCharCount,
        cleanedChars: r.validation.cleanedLength,
        lineCount: r.lineCount,
        passed: r.validation.isPass,
        firstDiff: r.validation.firstDiff,
      })),
    };
  } else {
    // ---- 单文件模式 ----
    if (checkOnly) {
      if (!fs.existsSync(outputPath)) {
        return { success: false, error: `输出文件不存在: ${outputPath}` };
      }
      const sourceText = fs.readFileSync(sourcePath, 'utf-8');
      const cleanedText = fs.readFileSync(outputPath, 'utf-8');
      // 去除 Markdown 标题行后再校验
      const strippedText = cleanedText.replace(/^# .+\n\n/, '');
      const validation = validate(sourceText, strippedText);

      return {
        success: validation.isPass,
        result: validation.isPass ? '校验通过' : '校验失败',
        sourceFile: path.basename(sourcePath),
        outputFile: path.basename(outputPath),
        sourceChars: removeSpaces(sourceText).length,
        cleanedChars: validation.cleanedLength,
        firstDiff: validation.firstDiff,
      };
    }

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const result = cleanFile(sourcePath, outputPath);
    const report = generateCheckReport(result);
    const checkPath = outputPath.replace(/\.md$/, '.check.md');
    fs.writeFileSync(checkPath, report, 'utf-8');

    return {
      success: result.validation.isPass,
      result: result.validation.isPass
        ? `清洗完成: ${path.basename(sourcePath)} → ${path.basename(outputPath)}`
        : `清洗完成但校验失败: ${path.basename(sourcePath)}`,
      sourceFile: path.basename(sourcePath),
      outputFile: path.basename(outputPath),
      checkReport: path.basename(checkPath),
      sourceChars: result.noSpaceCharCount,
      cleanedChars: result.validation.cleanedLength,
      lineCount: result.lineCount,
      passed: result.validation.isPass,
      firstDiff: result.validation.firstDiff,
    };
  }
}

module.exports = { execute };
