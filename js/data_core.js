// js/data_core.js — 合并产物（data.js + rules_data.js + stems_data.js，勿手改，重跑 scripts/rebuild-data.sh）
// Basic Korean Web App - Data Layer
// This file contains all learning data

var DATA = {
  version: "1.0",
  built: "2026-07-04"
};

console.log("Data layer loaded");

// Rules Data - 7 大骨架规则
var RULES = [
  {
    id: 1,
    title: "句尾规则：主宾谓结构",
    icon: "①",
    summary: "韩语句子必须以动词或形容词结尾。改变'主谓宾'思维为'主宾谓'。",
    details: "英语/中文：主语 → 动词 → 宾语（我吃苹果）\n韩语：主语 → 宾语 → 动词（我苹果吃）",
    examples: [
      { kr: "저는 밥을 먹어요", breakdown: [["저+는","我(主题)"], ["밥+을","饭(宾语)"], ["먹+어요","吃(敬语)"]] },
      { kr: "나는 학교에 가요", breakdown: [["나+는","我(主题)"], ["학교+에","学校(到)"], ["가+요","去(敬语)"]] },
      { kr: "날씨가 좋아요", breakdown: [["날씨+가","天气(主语)"], ["좋+아요","好(敬语)"]] }
    ],
    tip: "读韩语句子时，看到名词的助词就知道其角色，不等动词出现就能猜意思"
  },
  {
    id: 2,
    title: "助词系统：名词贴标签",
    icon: "②",
    summary: "韩语名词后面必须跟助词，告诉别人这个词在句子里的角色。",
    details: "은/는=主题标记, 이/가=主语标记, 을/를=宾语标记, 에=时间/地点, 에서=动作场所, 로/으로=方向/方式",
    examples: [
      { kr: "저는 집에서 밥을 먹어요", breakdown: [["저+는","我(主题)"], ["집+에서","家(在)"], ["밥+을","饭(宾语)"], ["먹+어요","吃"]] },
      { kr: "친구하고 영화를 봤어요", breakdown: [["친구+하고","朋友(和)"], ["영화+를","电影(宾语)"], ["봤+어요","看了"]] },
      { kr: "아침부터 저녁까지 공부해요", breakdown: [["아침+부터","早上(从)"], ["저녁+까지","晚上(到)"], ["공부해요","学习"]] }
    ],
    tip: "看到助词 = 知道这个词的角色，不需要等句子读完再分析"
  },
  {
    id: 3,
    title: "动词时态：词尾告诉你时间",
    icon: "③",
    summary: "韩语的时态不在时间词上，而在动词词尾上。",
    details: "现在: -아/어요 | 过去: -았/었어요 | 未来: -을 거예요 | 进行: -고 있어요",
    examples: [
      { kr: "어제 영화를 봤어요", breakdown: [["어제","昨天"], ["영화+를","电影"], ["봤+어요","看+过去=看了"]] },
      { kr: "내일 친구를 만날 거예요", breakdown: [["내일","明天"], ["친구+를","朋友"], ["만날 거예요","见+未来=要见"]] },
      { kr: "지금 공부하고 있어요", breakdown: [["지금","现在"], ["공부하고 있어요","学习+正在=正在学习"]] }
    ],
    tip: "读句子时，先找到动词词尾就知道这件事发生在什么时候"
  },
  {
    id: 4,
    title: "敬语体系：社交规则",
    icon: "④",
    summary: "韩语根据说话对象改变动词形式。初学阶段只用 -요 体就够用。",
    details: "해요체(-요体)=日常敬语，初学只需要这一种\n합쇼체(-습니다体)=正式(新闻/演讲)，了解即可\n部分动词有专用敬语形式(먹다→드시다, 있다→계시다)，初学不需要背",
    examples: [
      { kr: "저는 커피를 마셔요", breakdown: [["저+는","我(主题)"], ["커피+를","咖啡"], ["마시+어요","喝(敬语)"]] },
      { kr: "엄마는 집에 있어요", breakdown: [["엄마+는","妈妈(主题)"], ["집+에","家"], ["있+어요","在(敬语)"]] },
      { kr: "안녕하세요", breakdown: [["안녕하세요","您好(固定敬语)"]] }
    ],
    tip: "-요 是句子的社交收官符，加上它就安全了——日常所有场景都不会错"
  },
  {
    id: 5,
    title: "连接词尾：替代 and/so/but/because",
    icon: "⑤",
    summary: "英语用独立连词，韩语把第一个动词的词尾换掉表示连接。",
    details: "-고=并且/然后 | -아/어서=所以/因为 | -지만=但是 | -면=如果 | -려고=为了",
    examples: [
      { kr: "밥을 먹고 영화를 봤어요", breakdown: [["밥+을","饭"], ["먹+고","吃+并且"], ["영화+를","电影"], ["봤어요","看了"]] },
      { kr: "비가 와서 집에 있었어요", breakdown: [["비+가","雨"], ["와+서","下+所以"], ["집+에","家"], ["있었어요","呆了"]] },
      { kr: "한국어는 어렵지만 재미있어요", breakdown: [["한국어+는","韩语"], ["어렵+지만","难+但是"], ["재미있어요","有趣"]] }
    ],
    tip: "看到动词词干后面不是 -요 而是 -고/-서/-지만/-면，就知道句子还没完"
  },
  {
    id: 6,
    title: "否定结构：안 / 못 / -지 않다",
    icon: "⑥",
    summary: "韩语有两种否定方式。안=主观不做，못=客观不能。",
    details: "안 + 动词(短否定) | -지 않다(长否定) | 못 + 动词(能力否定) | -지 못하다(长否定)",
    examples: [
      { kr: "나는 안 먹어요", breakdown: [["나+는","我"], ["안","不"], ["먹어요","吃"]] },
      { kr: "한국어를 못 해요", breakdown: [["한국어+를","韩语"], ["못","不能"], ["해요","做"]] },
      { kr: "매운 음식을 먹지 못해요", breakdown: [["매운","辣的"], ["음식+을","食物"], ["먹지 못해요","吃+不能"]] }
    ],
    tip: "안/못 是否定警报——听到它们后面的动词意思就是反的"
  },
  {
    id: 7,
    title: "疑问 / 命令 / 提议",
    icon: "⑦",
    summary: "改变词尾，同一个动词可以表达三种不同语气。",
    details: "疑问: -어요? / -을까요? | 命令: -세요 | 提议: -을까요?",
    examples: [
      { kr: "뭐 먹을까요?", breakdown: [["뭐","什么"], ["먹+을까요?","吃+要不要呢?"]] },
      { kr: "여기에 앉으세요", breakdown: [["여기+에","这里"], ["앉+으세요","坐+请"]] },
      { kr: "같이 먹어요!", breakdown: [["같이","一起"], ["먹+어요!","吃(敬语)!"]] }
    ],
    tip: "同样的动词词干 + 不同的结尾 = 完全不同的语气"
  }
];
// Stems Data - 核心词干
// 所有例句统一用 -요 体活用形，让学习者直接看到"词干 + 词尾 = 完整句子"
var STEMS = {
  verbs: [
    { stem: "가", proto: "가다", meaning: "去", example: "학교에 가요" },
    { stem: "오", proto: "오다", meaning: "来", example: "집에 와요" },
    { stem: "하", proto: "하다", meaning: "做", example: "공부해요" },
    { stem: "먹", proto: "먹다", meaning: "吃", example: "밥을 먹어요" },
    { stem: "마시", proto: "마시다", meaning: "喝", example: "물을 마셔요" },
    { stem: "보", proto: "보다", meaning: "看", example: "영화를 봐요" },
    { stem: "듣", proto: "듣다", meaning: "听", example: "음악을 들어요", irreg: "ㅅ不规则" },
    { stem: "말하", proto: "말하다", meaning: "说", example: "한국어를 말해요" },
    { stem: "읽", proto: "읽다", meaning: "读", example: "책을 읽어요" },
    { stem: "쓰", proto: "쓰다", meaning: "写/用", example: "편지를 써요" },
    { stem: "배우", proto: "배우다", meaning: "学习", example: "한국어를 배워요" },
    { stem: "가르치", proto: "가르치다", meaning: "教", example: "학생을 가르쳐요" },
    { stem: "만나", proto: "만나다", meaning: "见面", example: "친구를 만나요" },
    { stem: "주", proto: "주다", meaning: "给", example: "선물을 줘요" },
    { stem: "받", proto: "받다", meaning: "收", example: "선물을 받아요" },
    { stem: "사", proto: "사다", meaning: "买", example: "음식을 사요" },
    { stem: "팔", proto: "팔다", meaning: "卖", example: "물건을 팔아요", irreg: "ㄹ不规则" },
    { stem: "만들", proto: "만들다", meaning: "制造", example: "음식을 만들어요" },
    { stem: "알", proto: "알다", meaning: "知道", example: "이름을 알아요" },
    { stem: "모르", proto: "모르다", meaning: "不知道", example: "주소를 몰라요" },
    { stem: "좋아하", proto: "좋아하다", meaning: "喜欢", example: "음악을 좋아해요" },
    { stem: "싫어하", proto: "싫어하다", meaning: "讨厌", example: "매운 것 싫어해요" },
    { stem: "필요하", proto: "필요하다", meaning: "需要", example: "도움이 필요해요" },
    { stem: "있", proto: "있다", meaning: "有/在", example: "시간이 있어요" },
    { stem: "없", proto: "없다", meaning: "没有", example: "시간이 없어요" },
    { stem: "되", proto: "되다", meaning: "成为/可以", example: "의사가 돼요" },
    { stem: "살", proto: "살다", meaning: "生活/住", example: "서울에 살아요", irreg: "ㄹ不规则" },
    { stem: "일하", proto: "일하다", meaning: "工作", example: "회사에서 일해요" },
    { stem: "쉬", proto: "쉬다", meaning: "休息", example: "좀 쉬어요" },
    { stem: "자", proto: "자다", meaning: "睡觉", example: "일찍 자요" },
    { stem: "일어나", proto: "일어나다", meaning: "起床", example: "아침에 일어나요" },
    { stem: "씻", proto: "씻다", meaning: "洗", example: "손을 씻어요" },
    { stem: "입", proto: "입다", meaning: "穿(衣服)", example: "옷을 입어요" },
    { stem: "운동하", proto: "운동하다", meaning: "运动", example: "매일 운동해요" },
    { stem: "요리하", proto: "요리하다", meaning: "烹饪", example: "한식을 요리해요" },
    { stem: "청소하", proto: "청소하다", meaning: "打扫", example: "방을 청소해요" },
    { stem: "기다리", proto: "기다리다", meaning: "等待", example: "버스를 기다려요" },
    { stem: "찾", proto: "찾다", meaning: "找", example: "길을 찾아요" },
    { stem: "열", proto: "열다", meaning: "打开", example: "문을 열어요", irreg: "ㄹ不规则" },
    { stem: "닫", proto: "닫다", meaning: "关闭", example: "문을 닫아요" },
    { stem: "켜", proto: "켜다", meaning: "开(开关)", example: "불을 켜요" },
    { stem: "끄", proto: "끄다", meaning: "关(开关)", example: "불을 꺼요" },
    { stem: "보내", proto: "보내다", meaning: "发送/度过", example: "문자를 보내요" },
    { stem: "도와주", proto: "도와주다", meaning: "帮助", example: "도와줘요" },
    { stem: "물어보", proto: "물어보다", meaning: "问", example: "길을 물어봐요" },
    { stem: "생각하", proto: "생각하다", meaning: "想/认为", example: "그렇게 생각해요" },
    { stem: "약속하", proto: "약속하다", meaning: "约定", example: "친구와 약속해요" },
    { stem: "여행하", proto: "여행하다", meaning: "旅行", example: "한국에 여행해요" },
    { stem: "놀", proto: "놀다", meaning: "玩", example: "친구랑 놀아요", irreg: "ㄹ不规则" },
    { stem: "걷", proto: "걷다", meaning: "走", example: "천천히 걸어요", irreg: "ㄷ不规则" },
    { stem: "달리", proto: "달리다", meaning: "跑", example: "공원에서 달려요" },
    { stem: "앉", proto: "앉다", meaning: "坐", example: "여기에 앉아요" }
  ],
  adjectives: [
    { stem: "크", proto: "크다", meaning: "大", example: "집이 커요" },
    { stem: "작", proto: "작다", meaning: "小", example: "가방이 작아요" },
    { stem: "길", proto: "길다", meaning: "长", example: "머리가 길어요", irreg: "ㄹ不规则" },
    { stem: "짧", proto: "짧다", meaning: "短", example: "시간이 짧아요" },
    { stem: "높", proto: "높다", meaning: "高", example: "값이 높아요" },
    { stem: "낮", proto: "낮다", meaning: "低", example: "목소리가 낮아요" },
    { stem: "많", proto: "많다", meaning: "多", example: "사람이 많아요" },
    { stem: "적", proto: "적다", meaning: "少", example: "시간이 적어요" },
    { stem: "좋", proto: "좋다", meaning: "好", example: "날씨가 좋아요" },
    { stem: "나쁘", proto: "나쁘다", meaning: "坏", example: "기분이 나빠요" },
    { stem: "예쁘", proto: "예쁘다", meaning: "漂亮", example: "꽃이 예뻐요" },
    { stem: "멋있", proto: "멋있다", meaning: "帅气", example: "영화가 멋있어요" },
    { stem: "귀엽", proto: "귀엽다", meaning: "可爱", example: "강아지가 귀여워요", irreg: "ㅂ不规则" },
    { stem: "맛있", proto: "맛있다", meaning: "好吃", example: "음식이 맛있어요" },
    { stem: "맛없", proto: "맛없다", meaning: "不好吃", example: "이거 맛없어요" },
    { stem: "쉽", proto: "쉽다", meaning: "简单", example: "문제가 쉬워요", irreg: "ㅂ不规则" },
    { stem: "어렵", proto: "어렵다", meaning: "难", example: "한국어가 어려워요", irreg: "ㅂ不规则" },
    { stem: "재미있", proto: "재미있다", meaning: "有趣", example: "영화가 재미있어요" },
    { stem: "재미없", proto: "재미없다", meaning: "无聊", example: "수업이 재미없어요" },
    { stem: "바쁘", proto: "바쁘다", meaning: "忙", example: "오늘 바빠요" },
    { stem: "춥", proto: "춥다", meaning: "冷(天气)", example: "겨울에 추워요", irreg: "ㅂ不规则" },
    { stem: "덥", proto: "덥다", meaning: "热(天气)", example: "여름에 더워요", irreg: "ㅂ不规则" },
    { stem: "시원하", proto: "시원하다", meaning: "凉爽", example: "바람이 시원해요" },
    { stem: "따뜻하", proto: "따뜻하다", meaning: "温暖", example: "방이 따뜻해요" },
    { stem: "맵", proto: "맵다", meaning: "辣", example: "음식이 매워요", irreg: "ㅂ不规则" },
    { stem: "짜", proto: "짜다", meaning: "咸", example: "국이 짜요" },
    { stem: "비싸", proto: "비싸다", meaning: "贵", example: "옷이 비싸요" },
    { stem: "싸", proto: "싸다", meaning: "便宜", example: "이게 더 싸요" },
    { stem: "가깝", proto: "가깝다", meaning: "近", example: "역이 가까워요", irreg: "ㅂ不规则" },
    { stem: "멀", proto: "멀다", meaning: "远", example: "집이 멀어요" },
    { stem: "빠르", proto: "빠르다", meaning: "快", example: "시간이 빨라요" },
    { stem: "느리", proto: "느리다", meaning: "慢", example: "버스가 느려요" }
  ]
};
