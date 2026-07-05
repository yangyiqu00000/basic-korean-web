// Training Sentences Data - 断句训练
const SENTENCES = [
  {
    id: 1, group: "自我介绍",
    kr: "저는 학생이에요.",
    breakdown: [
      { part: "저", tag: "词干", meaning: "我" },
      { part: "는", tag: "助词", meaning: "主题标记", label: "主题" },
      { part: "학생", tag: "词干", meaning: "学生" },
      { part: "이에요", tag: "词尾", meaning: "是(敬语)", label: "终结" }
    ],
    full: "我是学生。"
  },
  {
    id: 2, group: "自我介绍",
    kr: "저는 한국어를 공부해요.",
    breakdown: [
      { part: "저", tag: "词干", meaning: "我" },
      { part: "는", tag: "助词", meaning: "主题标记", label: "主题" },
      { part: "한국어", tag: "词干", meaning: "韩语" },
      { part: "를", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "공부해요", tag: "词尾", meaning: "学习(敬语)", label: "终结" }
    ],
    full: "我学习韩语。"
  },
  {
    id: 3, group: "自我介绍",
    kr: "만나서 반가워요.",
    breakdown: [
      { part: "만나", tag: "词干", meaning: "见" },
      { part: "서", tag: "词尾", meaning: "所以(连接)", label: "连接" },
      { part: "반갑", tag: "词干", meaning: "高兴" },
      { part: "어요", tag: "词尾", meaning: "敬语", label: "终结" }
    ],
    full: "见到你很高兴。",
    tip: "반갑다(高兴)的 ㅂ 遇到 어요 变成 워요：반갑+어요→반가워요"
  },
  {
    id: 4, group: "日常动作",
    kr: "아침에 밥을 먹어요.",
    breakdown: [
      { part: "아침", tag: "词干", meaning: "早上" },
      { part: "에", tag: "助词", meaning: "时间标记", label: "时间" },
      { part: "밥", tag: "词干", meaning: "饭" },
      { part: "을", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "먹어요", tag: "词尾", meaning: "吃(敬语)", label: "终结" }
    ],
    full: "早上吃饭。"
  },
  {
    id: 5, group: "日常动作",
    kr: "친구하고 영화를 봤어요.",
    breakdown: [
      { part: "친구", tag: "词干", meaning: "朋友" },
      { part: "하고", tag: "助词", meaning: "和(伴随)", label: "伴随" },
      { part: "영화", tag: "词干", meaning: "电影" },
      { part: "를", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "봤어요", tag: "词尾", meaning: "看+过去", label: "终结" }
    ],
    full: "和朋友看电影了。"
  },
  {
    id: 6, group: "日常动作",
    kr: "집에서 쉬고 있어요.",
    breakdown: [
      { part: "집", tag: "词干", meaning: "家" },
      { part: "에서", tag: "助词", meaning: "场所标记", label: "场所" },
      { part: "쉬", tag: "词干", meaning: "休息" },
      { part: "고 있어요", tag: "词尾", meaning: "正在做", label: "进行" }
    ],
    full: "正在家里休息。"
  },
  {
    id: 7, group: "日常动作",
    kr: "학교에 가요.",
    breakdown: [
      { part: "학교", tag: "词干", meaning: "学校" },
      { part: "에", tag: "助词", meaning: "方向标记", label: "方向" },
      { part: "가요", tag: "词尾", meaning: "去(敬语)", label: "终结" }
    ],
    full: "去学校。"
  },
  {
    id: 8, group: "描述事物",
    kr: "날씨가 좋아요.",
    breakdown: [
      { part: "날씨", tag: "词干", meaning: "天气" },
      { part: "가", tag: "助词", meaning: "主语标记", label: "主语" },
      { part: "좋아요", tag: "词尾", meaning: "好(敬语)", label: "终结" }
    ],
    full: "天气好。"
  },
  {
    id: 9, group: "描述事物",
    kr: "한국어가 재미있어요.",
    breakdown: [
      { part: "한국어", tag: "词干", meaning: "韩语" },
      { part: "가", tag: "助词", meaning: "主语标记", label: "主语" },
      { part: "재미있어요", tag: "词尾", meaning: "有趣(敬语)", label: "终结" }
    ],
    full: "韩语有趣。"
  },
  {
    id: 10, group: "描述事物",
    kr: "이 음식은 맵지만 맛있어요.",
    breakdown: [
      { part: "이", tag: "词干", meaning: "这" },
      { part: "음식", tag: "词干", meaning: "食物" },
      { part: "은", tag: "助词", meaning: "主题标记", label: "主题" },
      { part: "맵", tag: "词干", meaning: "辣" },
      { part: "지만", tag: "词尾", meaning: "但是(连接)", label: "连接" },
      { part: "맛있어요", tag: "词尾", meaning: "好吃(敬语)", label: "终结" }
    ],
    full: "这个食物辣但是好吃。"
  },
  {
    id: 11, group: "否定句",
    kr: "오늘 안 바빠요.",
    breakdown: [
      { part: "오늘", tag: "词干", meaning: "今天" },
      { part: "안", tag: "词干", meaning: "不(否定)", label: "否定" },
      { part: "바빠요", tag: "词尾", meaning: "忙(敬语)", label: "终结" }
    ],
    full: "今天不忙。"
  },
  {
    id: 12, group: "否定句",
    kr: "나는 매운 음식을 못 먹어요.",
    breakdown: [
      { part: "나", tag: "词干", meaning: "我" },
      { part: "는", tag: "助词", meaning: "主题标记", label: "主题" },
      { part: "매운", tag: "词干", meaning: "辣的" },
      { part: "음식", tag: "词干", meaning: "食物" },
      { part: "을", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "못", tag: "词干", meaning: "不能(否定)", label: "否定" },
      { part: "먹어요", tag: "词尾", meaning: "吃(敬语)", label: "终结" }
    ],
    full: "我不能吃辣的食物。"
  },
  {
    id: 13, group: "否定句",
    kr: "아직 안 왔어요.",
    breakdown: [
      { part: "아직", tag: "词干", meaning: "还" },
      { part: "안", tag: "词干", meaning: "不(否定)", label: "否定" },
      { part: "왔어요", tag: "词尾", meaning: "来+过去", label: "终结" }
    ],
    full: "还没来。"
  },
  {
    id: 14, group: "疑问/命令",
    kr: "뭐 먹을까요?",
    breakdown: [
      { part: "뭐", tag: "词干", meaning: "什么" },
      { part: "먹을까요", tag: "词尾", meaning: "吃+要不要", label: "提议" }
    ],
    full: "吃什么呢？"
  },
  {
    id: 15, group: "疑问/命令",
    kr: "여기에 앉으세요.",
    breakdown: [
      { part: "여기", tag: "词干", meaning: "这里" },
      { part: "에", tag: "助词", meaning: "位置标记", label: "位置" },
      { part: "앉으세요", tag: "词尾", meaning: "坐+请", label: "命令" }
    ],
    full: "请坐这里。"
  },
  {
    id: 16, group: "疑问/命令",
    kr: "도와주세요!",
    breakdown: [
      { part: "도와주세요", tag: "词尾", meaning: "请帮帮我", label: "命令" }
    ],
    full: "请帮帮我！"
  },
  {
    id: 17, group: "连接词尾",
    kr: "밥을 먹고 영화를 봤어요.",
    breakdown: [
      { part: "밥", tag: "词干", meaning: "饭" },
      { part: "을", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "먹", tag: "词干", meaning: "吃" },
      { part: "고", tag: "词尾", meaning: "并且(连接)", label: "连接" },
      { part: "영화", tag: "词干", meaning: "电影" },
      { part: "를", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "봤어요", tag: "词尾", meaning: "看+过去", label: "终结" }
    ],
    full: "吃了饭然后看了电影。",
    tip: "-고 告诉你：第一个动作还没完，后面还有内容"
  },
  {
    id: 18, group: "连接词尾",
    kr: "배가 고파서 밥을 먹었어요.",
    breakdown: [
      { part: "배", tag: "词干", meaning: "肚子" },
      { part: "가", tag: "助词", meaning: "主语标记", label: "主语" },
      { part: "고파", tag: "词干", meaning: "饿" },
      { part: "서", tag: "词尾", meaning: "所以(连接)", label: "连接" },
      { part: "밥", tag: "词干", meaning: "饭" },
      { part: "을", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "먹었어요", tag: "词尾", meaning: "吃+过去", label: "终结" }
    ],
    full: "肚子饿了所以吃饭了。",
    tip: "-서 告诉你：前面是原因，后面是结果"
  },
  {
    id: 19, group: "连接词尾",
    kr: "한국어는 어렵지만 재미있어요.",
    breakdown: [
      { part: "한국어", tag: "词干", meaning: "韩语" },
      { part: "는", tag: "助词", meaning: "主题标记", label: "主题" },
      { part: "어렵", tag: "词干", meaning: "难" },
      { part: "지만", tag: "词尾", meaning: "但是(连接)", label: "连接" },
      { part: "재미있어요", tag: "词尾", meaning: "有趣(敬语)", label: "终结" }
    ],
    full: "韩语难但是有趣。",
    tip: "-지만 告诉你：前后是转折关系"
  },
  {
    id: 20, group: "连接词尾",
    kr: "시간이 있으면 같이 갈까요?",
    breakdown: [
      { part: "시간", tag: "词干", meaning: "时间" },
      { part: "이", tag: "助词", meaning: "主语标记", label: "主语" },
      { part: "있", tag: "词干", meaning: "有" },
      { part: "으면", tag: "词尾", meaning: "如果(连接)", label: "条件" },
      { part: "같이", tag: "词干", meaning: "一起" },
      { part: "갈까요", tag: "词尾", meaning: "去+要不要", label: "提议" }
    ],
    full: "如果有时间的话，要不要一起去？",
    tip: "-으면 告诉你：前面是条件，后面是结果"
  },
  // ===== 新增例句 21-40 =====
  {
    id: 21, group: "购物点餐",
    kr: "이거 얼마예요?",
    breakdown: [
      { part: "이거", tag: "词干", meaning: "这个" },
      { part: "얼마", tag: "词干", meaning: "多少钱" },
      { part: "예요", tag: "词尾", meaning: "是(敬语)", label: "终结" }
    ],
    full: "这个多少钱？",
    tip: "购物必备句！记住 이거(这个) + 얼마(多少) 就能问价格"
  },
  {
    id: 22, group: "购物点餐",
    kr: "커피 한 잔 주세요.",
    breakdown: [
      { part: "커피", tag: "词干", meaning: "咖啡" },
      { part: "한", tag: "词干", meaning: "一" },
      { part: "잔", tag: "词干", meaning: "杯(量词)" },
      { part: "주세요", tag: "词尾", meaning: "给(敬语命令)", label: "命令" }
    ],
    full: "请给我一杯咖啡。",
    tip: "주세요 = 给我，点餐万能公式：名词 + 数量 + 주세요"
  },
  {
    id: 23, group: "购物点餐",
    kr: "너무 비싸요. 더 싼 것 있어요?",
    breakdown: [
      { part: "너무", tag: "词干", meaning: "太" },
      { part: "비싸요", tag: "词尾", meaning: "贵(敬语)", label: "终结" },
      { part: "더", tag: "词干", meaning: "更" },
      { part: "싼", tag: "词干", meaning: "便宜的" },
      { part: "것", tag: "词干", meaning: "东西" },
      { part: "있어요", tag: "词尾", meaning: "有(敬语)", label: "疑问" }
    ],
    full: "太贵了。有更便宜的吗？"
  },
  {
    id: 24, group: "购物点餐",
    kr: "맛있게 드세요!",
    breakdown: [
      { part: "맛있게", tag: "词干", meaning: "好吃地" },
      { part: "드세요", tag: "词尾", meaning: "吃(敬语命令)", label: "命令" }
    ],
    full: "请慢慢享用！",
    tip: "드세요 是 먹다(吃) 的敬语形式，对长辈/客人说"
  },
  {
    id: 25, group: "问路交通",
    kr: "역이 어디에 있어요?",
    breakdown: [
      { part: "역", tag: "词干", meaning: "车站" },
      { part: "이", tag: "助词", meaning: "主语标记", label: "主语" },
      { part: "어디", tag: "词干", meaning: "哪里" },
      { part: "에", tag: "助词", meaning: "位置标记", label: "位置" },
      { part: "있어요", tag: "词尾", meaning: "在(敬语)", label: "疑问" }
    ],
    full: "车站在哪里？"
  },
  {
    id: 26, group: "问路交通",
    kr: "버스를 타고 가요.",
    breakdown: [
      { part: "버스", tag: "词干", meaning: "公交车" },
      { part: "를", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "타", tag: "词干", meaning: "乘" },
      { part: "고", tag: "词尾", meaning: "并且(连接)", label: "连接" },
      { part: "가요", tag: "词尾", meaning: "去(敬语)", label: "终结" }
    ],
    full: "坐公交车去。",
    tip: "-고 连接两个动作：乘(타) + 去(가) = 乘着去"
  },
  {
    id: 27, group: "问路交通",
    kr: "지하철역까지 멀어요?",
    breakdown: [
      { part: "지하철", tag: "词干", meaning: "地铁" },
      { part: "역", tag: "词干", meaning: "站" },
      { part: "까지", tag: "助词", meaning: "到(终点)", label: "终点" },
      { part: "멀어요", tag: "词尾", meaning: "远(敬语)", label: "疑问" }
    ],
    full: "到地铁站远吗？"
  },
  {
    id: 28, group: "问路交通",
    kr: "오른쪽으로 가세요.",
    breakdown: [
      { part: "오른쪽", tag: "词干", meaning: "右边" },
      { part: "으로", tag: "助词", meaning: "方向标记", label: "方向" },
      { part: "가세요", tag: "词尾", meaning: "去(敬语命令)", label: "命令" }
    ],
    full: "请往右走。"
  },
  {
    id: 29, group: "时间计划",
    kr: "내일 뭐 할 거예요?",
    breakdown: [
      { part: "내일", tag: "词干", meaning: "明天" },
      { part: "뭐", tag: "词干", meaning: "什么" },
      { part: "할", tag: "词干", meaning: "做(未来定语)" },
      { part: "거예요", tag: "词尾", meaning: "会(未来敬语)", label: "疑问" }
    ],
    full: "明天要做什么？"
  },
  {
    id: 30, group: "时间计划",
    kr: "주말에 친구를 만날 거예요.",
    breakdown: [
      { part: "주말", tag: "词干", meaning: "周末" },
      { part: "에", tag: "助词", meaning: "时间标记", label: "时间" },
      { part: "친구", tag: "词干", meaning: "朋友" },
      { part: "를", tag: "助词", meaning: "宾语标记", label: "宾语" },
      { part: "만날", tag: "词干", meaning: "见(未来定语)" },
      { part: "거예요", tag: "词尾", meaning: "会(未来敬语)", label: "终结" }
    ],
    full: "周末要见朋友。"
  },
  {
    id: 31, group: "时间计划",
    kr: "몇 시에 만날까요?",
    breakdown: [
      { part: "몇", tag: "词干", meaning: "几" },
      { part: "시", tag: "词干", meaning: "点" },
      { part: "에", tag: "助词", meaning: "时间标记", label: "时间" },
      { part: "만날까요", tag: "词尾", meaning: "见+要不要", label: "提议" }
    ],
    full: "几点见面呢？"
  },
  {
    id: 32, group: "时间计划",
    kr: "시간이 없어요. 빨리 가요.",
    breakdown: [
      { part: "시간", tag: "词干", meaning: "时间" },
      { part: "이", tag: "助词", meaning: "主语标记", label: "主语" },
      { part: "없어요", tag: "词尾", meaning: "没有(敬语)", label: "终结" },
      { part: "빨리", tag: "词干", meaning: "快" },
      { part: "가요", tag: "词尾", meaning: "去(敬语)", label: "终结" }
    ],
    full: "没时间了。快走吧。"
  },
  {
    id: 33, group: "请求感谢",
    kr: "도와주셔서 감사해요.",
    breakdown: [
      { part: "도와주", tag: "词干", meaning: "帮助" },
      { part: "셔서", tag: "词尾", meaning: "因为(敬语连接)", label: "连接" },
      { part: "감사해요", tag: "词尾", meaning: "感谢(敬语)", label: "终结" }
    ],
    full: "感谢您的帮助。",
    tip: "셔서 = 시(敬语) + 어서(因为)，表敬语+原因"
  },
  {
    id: 34, group: "请求感谢",
    kr: "이것 좀 보여주세요.",
    breakdown: [
      { part: "이것", tag: "词干", meaning: "这个" },
      { part: "좀", tag: "词干", meaning: "稍微" },
      { part: "보여", tag: "词干", meaning: "给看" },
      { part: "주세요", tag: "词尾", meaning: "请(敬语命令)", label: "命令" }
    ],
    full: "请给我看看这个。"
  },
  {
    id: 35, group: "请求感谢",
    kr: "죄송하지만 다시 말해주세요.",
    breakdown: [
      { part: "죄송", tag: "词干", meaning: "抱歉" },
      { part: "하지만", tag: "词尾", meaning: "但是(连接)", label: "连接" },
      { part: "다시", tag: "词干", meaning: "再" },
      { part: "말해", tag: "词干", meaning: "说" },
      { part: "주세요", tag: "词尾", meaning: "请(敬语命令)", label: "命令" }
    ],
    full: "不好意思，请再说一遍。"
  },
  {
    id: 36, group: "请求感谢",
    kr: "사진 좀 찍어줄래요?",
    breakdown: [
      { part: "사진", tag: "词干", meaning: "照片" },
      { part: "좀", tag: "词干", meaning: "稍微" },
      { part: "찍어", tag: "词干", meaning: "拍" },
      { part: "줄래요", tag: "词尾", meaning: "愿意...吗(敬语)", label: "疑问" }
    ],
    full: "能帮我拍张照吗？"
  },
  {
    id: 37, group: "情感感受",
    kr: "오늘 기분이 좋아요.",
    breakdown: [
      { part: "오늘", tag: "词干", meaning: "今天" },
      { part: "기분", tag: "词干", meaning: "心情" },
      { part: "이", tag: "助词", meaning: "主语标记", label: "主语" },
      { part: "좋아요", tag: "词尾", meaning: "好(敬语)", label: "终结" }
    ],
    full: "今天心情好。"
  },
  {
    id: 38, group: "情感感受",
    kr: "피곤해서 쉬고 싶어요.",
    breakdown: [
      { part: "피곤하", tag: "词干", meaning: "疲惫" },
      { part: "아서", tag: "词尾", meaning: "因为(连接)", label: "连接" },
      { part: "쉬", tag: "词干", meaning: "休息" },
      { part: "고 싶어요", tag: "词尾", meaning: "想要(敬语)", label: "终结" }
    ],
    full: "累了所以想休息。",
    tip: "-고 싶어요 = 想要做某事，接在动词词干后面"
  },
  {
    id: 39, group: "情感感受",
    kr: "정말 재미있었어요!",
    breakdown: [
      { part: "정말", tag: "词干", meaning: "真的" },
      { part: "재미있", tag: "词干", meaning: "有趣" },
      { part: "었어요", tag: "词尾", meaning: "过去(敬语)", label: "终结" }
    ],
    full: "真的很有趣！"
  },
  {
    id: 40, group: "情感感受",
    kr: "조금 슬퍼요.",
    breakdown: [
      { part: "조금", tag: "词干", meaning: "一点" },
      { part: "슬퍼요", tag: "词尾", meaning: "伤心(敬语)", label: "终结" }
    ],
    full: "有点伤心。"
  },
  // ===== 新增例句 41-43 (新词尾) =====
  {
    id: 41, group: "日常动作",
    kr: "지금 가야 해요.",
    breakdown: [
      { part: "지금", tag: "词干", meaning: "现在" },
      { part: "가", tag: "词干", meaning: "去" },
      { part: "야 해요", tag: "词尾", meaning: "必须(敬语)", label: "终结" }
    ],
    full: "现在得走了。",
    tip: "-아/어야 하다 = 必须/应该，表示义务"
  },
  {
    id: 42, group: "情感感受",
    kr: "한국어가 정말 재미있네요!",
    breakdown: [
      { part: "한국어", tag: "词干", meaning: "韩语" },
      { part: "가", tag: "助词", meaning: "主语标记", label: "主语" },
      { part: "정말", tag: "词干", meaning: "真的" },
      { part: "재미있", tag: "词干", meaning: "有趣" },
      { part: "네요", tag: "词尾", meaning: "感慨(敬语)", label: "终结" }
    ],
    full: "韩语真有趣啊！",
    tip: "-네요 = 感慨词尾，表示新发现或感叹"
  },
  {
    id: 43, group: "疑问/命令",
    kr: "내일 오시죠?",
    breakdown: [
      { part: "내일", tag: "词干", meaning: "明天" },
      { part: "오", tag: "词干", meaning: "来" },
      { part: "시", tag: "词尾", meaning: "敬语(先语末)", label: "敬语" },
      { part: "죠", tag: "词尾", meaning: "确认(敬语)", label: "疑问" }
    ],
    full: "明天来对吧？",
    tip: "-죠? = -지요? 的缩略，表示确认\"…对吧？\""
  }
];
