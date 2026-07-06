'use strict';

// 各风格的开头钩子备选池
const ANSWER_STYLES = {
  professional: {
    name: '专业型回答',
    openings: [
      '谢邀。这个问题我正好有深入研究，分享一下我的看法。',
      '作为在这个领域工作了多年的从业者，我来认真回答一下。',
      '看了很多回答，发现大家都忽略了一个关键点。',
      '这个问题非常好，值得深入探讨。先说结论：',
      '利益相关，匿了。但这个问题我必须认真回答。',
    ],
    structure: (question) => `
## 一、核心观点

[在这里阐述你的核心论点，开门见山]

## 二、深入分析

### 2.1 第一个维度
[从专业角度分析，引用行业数据或研究]

### 2.2 第二个维度
[补充另一个分析角度，增加论证深度]

### 2.3 第三个维度
[如果有反面论据，在这里进行回应]

## 三、实际案例

举个真实的例子：
[用具体案例支撑你的观点]

## 四、总结

回到问题本身——${question}

[一句话总结你的核心观点]

---
以上。觉得有帮助的话，点个赞同吧 👍`,
  },

  story: {
    name: '故事型回答',
    openings: [
      '说一个我亲身经历的事吧。',
      '我来讲一个真实的故事，看完你就懂了。',
      '2019年的冬天，我永远忘不了那个下午……',
      '如果你问我这个问题，我会想起一个人。',
      '先讲个小故事，再回答这个问题。',
    ],
    structure: (question) => `
---

[故事开头 - 设置场景和人物]

那是一个普通的工作日……

[故事发展 - 制造冲突和转折]

然而，事情并没有像我想的那样发展……

[故事高潮 - 关键转折点]

就在那一刻，我突然明白了……

[故事结局 - 回扣主题]

---

回到「${question}」这个问题。

经历过这件事之后，我的答案是：

[用故事得出的感悟来回答问题]

**有些道理，只有亲身经历过才会懂。**

---
码字不易，觉得有共鸣的话，给个赞呗 ❤️`,
  },

  data: {
    name: '数据型回答',
    openings: [
      '少废话，直接上数据。',
      '用数据说话，不整虚的。',
      '我花了3天时间整理了相关数据，直接看结论。',
      '先放一组数据，看完再讨论。',
      '别急着下结论，我们先看看数据怎么说。',
    ],
    structure: (question) => `
## 📊 关键数据

| 指标 | 数据 | 来源 |
|------|------|------|
| [指标1] | [数据] | [来源] |
| [指标2] | [数据] | [来源] |
| [指标3] | [数据] | [来源] |

## 📈 数据分析

### 趋势一：[描述趋势]
从数据可以看出……

### 趋势二：[描述趋势]
进一步分析发现……

## 🔍 深层原因

数据背后的逻辑是：
1. [原因一]
2. [原因二]
3. [原因三]

## 💡 结论

回到「${question}」——

数据告诉我们：[一句话结论]

> 数据来源：[注明数据出处，增加可信度]

---
整理数据不容易，觉得有用就点个赞吧 📊`,
  },

  debate: {
    name: '辩论型回答',
    openings: [
      '这个问题下的高赞回答，我不太同意。',
      '我知道这个观点可能会被喷，但我还是要说。',
      '很多人可能会反对我，但事实就是如此。',
      '在这个问题上，主流观点是错的。',
      '先说一个大家不爱听的真相。',
    ],
    structure: (question) => `
## ❌ 常见误区

很多人认为：[列出主流但错误的观点]

**但实际上，这是一个典型的认知偏差。**

## 🔍 为什么主流观点站不住脚？

### 漏洞一：[指出逻辑漏洞]
[用事实和逻辑反驳]

### 漏洞二：[指出证据不足]
[补充被忽略的关键信息]

## ✅ 更合理的解释

关于「${question}」，我认为：

1. **[论点一]** — [论据]
2. **[论点二]** — [论据]
3. **[论点三]** — [论据]

## 🤝 求同存异

当然，我不是说对方完全没有道理。[承认合理部分]

但在核心问题上，证据更支持我的观点。

**欢迎理性讨论，拒绝人身攻击。**

---
赞同请点赞，反对请评论，别只收藏不点赞 😄`,
  },
};

// 盐选故事类型
const SALT_GENRES = [
  {
    name: '都市情感',
    opening: `我叫林夏，今年28岁。

三天前，我在老公的手机里发现了一个秘密。

那是一个加密相册，密码是我们结婚纪念日——我试了一次就打开了。
打开的那一刻，我的手在发抖。

不是因为恐惧。
是因为愤怒。

……

[故事在最精彩的地方戛然而止]

---
🔒 「以下内容为盐选专栏付费内容」
📖 想看完整故事？开通盐选会员即可阅读全文`,
  },
  {
    name: '职场暗战',
    opening: `入职第一天，我的领导就告诉我一句话：

"在这里，不要相信任何人。包括我。"

当时我以为他在开玩笑。
三个月后，我才明白这句话的分量。

我叫陈默，985硕士毕业，进了一家世界500强。
本以为前途一片光明，却不知道——
我即将卷入一场精心设计的职场阴谋。

……

[故事在关键转折处停止]

---
🔒 「以下内容为盐选专栏付费内容」
📖 完整故事共12章，已有10万+人阅读`,
  },
  {
    name: '悬疑推理',
    opening: `2019年11月17日，凌晨3点。

我被一阵急促的敲门声惊醒。

打开门，走廊空无一人。
地上放着一个牛皮纸信封，上面写着四个字：

**「别再查了。」**

我是一名记者。
三天前，我接到一个匿名线索，说某知名企业的慈善基金会
背后隐藏着一个惊天秘密。

我本以为这只是又一个普通的调查报道。
直到这封信出现在我家门口。

我意识到，我可能碰到了不该碰的东西。

……

[悬念拉满，读者欲罢不能]

---
🔒 「以下内容为盐选专栏付费内容」
📖 本故事已获盐选年度推荐，累计阅读50万+`,
  },
];

// 标题模板
const TITLE_TEMPLATES = [
  // 数字型
  { tmpl: '关于{topic}，这{n}个真相可能颠覆你的认知', slots: ['topic', 'n'] },
  { tmpl: '{topic}：{n}个你不知道的冷知识', slots: ['topic', 'n'] },
  { tmpl: '做了{n}年{topic}，我总结出这{n2}条血泪经验', slots: ['n', 'topic', 'n2'] },
  // 反问型
  { tmpl: '为什么说{topic}是这个时代最被低估的？', slots: ['topic'] },
  { tmpl: '{topic}真的那么重要吗？看完你就明白了', slots: ['topic'] },
  { tmpl: '你真的了解{topic}吗？', slots: ['topic'] },
  // 争议型
  { tmpl: '关于{topic}，99%的人都想错了', slots: ['topic'] },
  { tmpl: '{topic}的真相，说出来你可能不信', slots: ['topic'] },
  { tmpl: '别再被忽悠了，{topic}的水到底有多深', slots: ['topic'] },
  // 故事型
  { tmpl: '从月薪3000到年入百万，{topic}教会我的事', slots: ['topic'] },
  { tmpl: '在{topic}行业十年，我终于看清了这个残酷的真相', slots: ['topic'] },
  { tmpl: '辞职后我才明白，{topic}到底意味着什么', slots: ['topic'] },
  // 问答型
  { tmpl: '如何评价{topic}？这可能是最真诚的回答', slots: ['topic'] },
  { tmpl: '有哪些关于{topic}的建议，是你希望自己早点知道的？', slots: ['topic'] },
  { tmpl: '{topic}有哪些外行人不知道的内幕？', slots: ['topic'] },
];

// 随机取数组中一个元素
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 随机打乱数组（Fisher-Yates）
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 工具实现：生成知乎回答框架
function generateAnswer({ question, style = 'professional' }) {
  const styleData = ANSWER_STYLES[style];
  if (!styleData) {
    return {
      error: `未知风格 "${style}"，可选值：professional | story | data | debate`,
    };
  }
  const opening = randomChoice(styleData.openings);
  const body = styleData.structure(question);
  return {
    style: styleData.name,
    question,
    framework: `${opening}\n${body}`,
  };
}

// 工具实现：生成知乎专栏文章框架
function generateArticle({ topic }) {
  const openings = [
    '这篇文章，我酝酿了很久。',
    '写这篇文章的契机，源于最近的一次思考。',
    `关于${topic}，我一直想写一篇深度分析。`,
    `最近关于${topic}的讨论很多，我来梳理一下。`,
  ];
  const opening = randomChoice(openings);
  const framework = `# ${topic}

${opening}

## 前言

[引入话题背景，说明写这篇文章的动机]
[可以用一个小故事或热点事件开头]

## 一、${topic}的现状

### 1.1 行业概览
[描述当前状况，用数据支撑]

### 1.2 存在的问题
[指出痛点，引起读者共鸣]

## 二、深层原因分析

### 2.1 [原因一]
[深入分析]

### 2.2 [原因二]
[补充分析]

### 2.3 [原因三]
[进一步展开]

## 三、解决思路

### 3.1 短期策略
[可立即执行的方案]

### 3.2 长期规划
[需要持续投入的方向]

## 四、案例研究

[用1-2个真实案例验证你的观点]

## 五、总结与展望

[总结核心观点]
[对未来的预判]

---

**关于作者：** [简短自我介绍，建立专业形象]

如果这篇文章对你有启发，请点赞+关注，我会持续输出${topic}相关的深度内容。

> 本文首发于知乎专栏，未经授权禁止转载。`;

  return { topic, framework };
}

// 工具实现：生成知乎爆款标题
function generateTitle({ topic }) {
  const nums = [3, 5, 7, 8, 10];
  const selected = shuffle(TITLE_TEMPLATES).slice(0, 5);
  const titles = selected.map((item, index) => {
    let title = item.tmpl;
    // 替换 {topic}
    title = title.replace(/{topic}/g, topic);
    // 替换数字占位符
    title = title.replace(/{n}/g, randomChoice(nums));
    title = title.replace(/{n2}/g, randomChoice(nums));
    return `${index + 1}. ${title}`;
  });

  return {
    topic,
    titles: titles.join('\n'),
    tips: [
      '数字型标题点击率最高（如「7个」「5条」）',
      '反问型标题激发好奇心',
      '争议型标题引发讨论，但注意不要标题党',
      '故事型标题适合个人经历分享',
    ],
  };
}

// 工具实现：生成知乎盐选故事开头
function generateSalt({ topic }) {
  const genre = randomChoice(SALT_GENRES);
  return {
    topic,
    genre: genre.name,
    framework: `## 「${topic}」\n\n${genre.opening}`,
    writingTips: [
      '盐选故事的核心：前3段必须抓住读者',
      '使用短句、断句，制造节奏感',
      '关键信息延迟揭露，保持悬念',
      '在最精彩的地方设置付费墙',
      '标题要有冲突感：「我在XX发现了XX」',
    ],
    hotTags: '#真实故事 #职场 #情感 #悬疑 #人间百态',
  };
}

// Craft 项目契约：execute(input, context)，工具名通过 context.toolName 分发
async function execute(input, context) {
  const toolName = context && context.toolName;
  switch (toolName) {
    case 'zhihu_answer':
      return generateAnswer(input);
    case 'zhihu_article':
      return generateArticle(input);
    case 'zhihu_title':
      return generateTitle(input);
    case 'zhihu_salt':
      return generateSalt(input);
    default:
      return { error: `未知工具：${toolName}` };
  }
}

module.exports = { execute };
