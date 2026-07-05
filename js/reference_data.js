// Reference Data - 标签速查
const REFERENCE = {
  particles: [
    { tag: "은/는", type: "主题标记", meaning: "至于…", level: "核心", example: "저는 (至于我)" },
    { tag: "이/가", type: "主语标记", meaning: "谁/什么作主语", level: "核心", example: "날씨가 (天气)" },
    { tag: "을/를", type: "宾语标记", meaning: "动作的对象", level: "核心", example: "밥을 (饭)" },
    { tag: "에", type: "时间/地点", meaning: "在/到/于", level: "核心", example: "학교에 (到学校)" },
    { tag: "에서", type: "场所", meaning: "在…做某事", level: "核心", example: "집에서 (在家里)" },
    { tag: "로/으로", type: "方向/方式", meaning: "朝/用", level: "常用", example: "버스로 (乘公交)" },
    { tag: "하고/와/과", type: "伴随", meaning: "和/跟", level: "常用", example: "친구하고 (和朋友)" },
    { tag: "부터", type: "起点", meaning: "从…开始", level: "常用", example: "아침부터 (从早上)" },
    { tag: "까지", type: "终点", meaning: "到…为止", level: "常用", example: "저녁까지 (到晚上)" },
    { tag: "도", type: "包含", meaning: "也/都", level: "核心", example: "저도 (我也是)" },
    { tag: "만", type: "限制", meaning: "只/仅", level: "常用", example: "이것만 (只要这个)" }
  ],
  endings: [
    { tag: "-아/어요", type: "现在敬语", meaning: "日常陈述", level: "核心", example: "먹어요 (吃)" },
    { tag: "-았/었어요", type: "过去敬语", meaning: "过去", level: "核心", example: "먹었어요 (吃了)" },
    { tag: "-을 거예요", type: "未来", meaning: "未来/推测", level: "常用", example: "먹을 거예요 (要吃)" },
    { tag: "-고 있어요", type: "进行", meaning: "正在做", level: "常用", example: "먹고 있어요 (正在吃)" },
    { tag: "-습니다/ㅂ니다", type: "正式敬语", meaning: "正式陈述", level: "常用", example: "갑니다 (去)" },
    { tag: "-입니다/예요", type: "系动词(是)", meaning: "是(敬语)", level: "核心", example: "학생이에요 (是学生)" },
    { tag: "-을까요?", type: "疑问/提议", meaning: "要不要", level: "常用", example: "갈까요? (去吗?)" },
    { tag: "-세요", type: "命令", meaning: "请做", level: "核心", example: "가세요 (请去)" },
    { tag: "-주세요", type: "请求/给", meaning: "请给我", level: "核心", example: "커피 주세요 (请给咖啡)" },
    { tag: "-줄래요?", type: "征求意愿", meaning: "愿意…吗", level: "常用", example: "도와줄래요? (能帮忙吗?)" },
    { tag: "-고 싶어요", type: "愿望", meaning: "想要", level: "常用", example: "먹고 싶어요 (想吃)" },
    { tag: "-아/어야 하다", type: "义务", meaning: "必须/应该", level: "核心", example: "가야 해요 (得走)" },
    { tag: "-네요", type: "感慨", meaning: "…啊！", level: "常用", example: "맛있네요! (好吃啊!)" },
    { tag: "-죠?", type: "确认", meaning: "…对吧？", level: "常用", example: "그렇죠? (对吧?)" },
    { tag: "-자", type: "提议(亲密)", meaning: "吧", level: "了解", example: "가자 (去吧)" },
    { tag: "-고", type: "连接(并列)", meaning: "并且/然后", level: "核心", example: "먹고 (吃并且)" },
    { tag: "-아/어서", type: "连接(因果)", meaning: "所以/因为", level: "核心", example: "배고파서 (肚子饿所以)" },
    { tag: "-지만", type: "连接(转折)", meaning: "但是/虽然", level: "核心", example: "어렵지만 (难但是)" },
    { tag: "-면/으면", type: "连接(条件)", meaning: "如果", level: "常用", example: "있으면 (如果有)" },
    { tag: "-려고", type: "连接(目的)", meaning: "为了", level: "了解", example: "먹으려고 (为了吃)" }
  ],
  questionWords: [
    { word: "뭐", meaning: "什么" },
    { word: "누구", meaning: "谁" },
    { word: "언제", meaning: "什么时候" },
    { word: "어디", meaning: "哪里" },
    { word: "왜", meaning: "为什么" },
    { word: "어떻게", meaning: "怎么" },
    { word: "얼마", meaning: "多少钱/多少" },
    { word: "몇", meaning: "几/多少" }
  ]
};
