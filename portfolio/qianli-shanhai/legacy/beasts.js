/**
 * 《千里江山 · 山海入画》神兽谱与文学注解
 * 核心设定：【十八岁少年的一场借笔还魂】
 * 北宋政和三年，十八岁的王希孟将《山海经》六方山魂水魄借石青石绿封印于绢帛之中。
 * 玩家作为“提笔知音”，漫步于千峰翠微、飞瀑长桥之间，唤醒沉睡神兽，让古卷重现灵动。
 */

export const STORY_PROLOGUE = {
  title: "千里江山 · 借笔还魂",
  subheading: "北宋政和三年 · 十八岁少年的天地大化",
  paragraphs: [
    "北宋政和三年，十八岁的王希孟画出近十二米长卷《千里江山图》，随即悄然消逝于历史尘埃中。",
    "传说他并非早夭，而是参透了天地大化——他将《山海经》里那些古老的神仙异兽、山魂水魄，尽数借着石青石绿的矿物重彩，封印在了这幅绵延千里的绢帛之间。",
    "随着岁月流转，画中灵气渐沉，山兽沉眠，江山静止。",
    "你并非猎人，而是“入画游人”与“提笔知音”：漫步于峰峦绝壁、长桥水榭与渔舟松涛之间，去唤醒那些沉睡的山海神兽，让这幅古卷重现天地灵动。"
  ],
  callToAction: "提笔入画 · 步入江山"
};

export const BEASTS = [
  {
    id: "lushu",
    name: "鹿蜀",
    title: "桃溪和音 · 杻阳之灵",
    sealText: "鹿蜀和音",
    iconSymbol: "🐎",
    virtualX: 3300,
    virtualY: 520,
    sectionIndex: 1,
    scrollProgress: 0.147,
    scenicSpot: "卷一 · 桃溪浅滩",
    hint: "浅滩水草繁茂处，微风掠过，隐闻宛如民谣轻吟的啼鸣。",
    classicQuote: "杻阳之山，有兽焉，其状如马而白首，其文如虎而赤尾，其音如谣，其名曰鹿蜀，佩之宜子孙。",
    classicSource: "《山海经 · 南山经》",
    reflection: "十八岁落笔第一笔春水，我把杻阳山上的鹿蜀藏进了桃溪。徽宗皇帝要的是天下承平的赞歌，我却在画卷开篇画下了最朴素的渔舟、苇草与草木微澜。鹿蜀其音如谣，它是凡间生生不息的呼吸——流水不争先，争的是滔滔不绝。",
    themeColor: "#E06D53", // 赭红赤尾
    goldColor: "#F4D068",
    mutationType: "waterRipple",
    mutationDesc: "溪流泛起琉璃光晕，两岸桃花飞瓣随风如雪",
    coordinates: { x: -45, y: 1.5, z: 28 }
  },
  {
    id: "fuzhu",
    name: "夫诸",
    title: "飞瀑灵鹿 · 兆水之神",
    sealText: "夫诸水魄",
    iconSymbol: "🦌",
    virtualX: 7500,
    virtualY: 460,
    sectionIndex: 2,
    scrollProgress: 0.334,
    scenicSpot: "卷二 · 悬瀑幽涧",
    hint: "百丈悬瀑激荡的水雾深处，石青岩石旁立有一双若隐若现的白玉四角。",
    classicQuote: "中次三经萯山之首，曰敖岸之山……有兽焉，其状如白鹿而四角，名曰夫诸，见则其邑大水。",
    classicSource: "《山海经 · 中次三经》",
    reflection: "世人皆畏大水，宋徽宗亦畏江河覆亡。我偏要将夫诸封进这道百丈双叠飞瀑。奔涌之水，方能涤净尘寰；夫诸踏水而行，四角如初生冰枝。它带来的不是灾厄，而是让千里江山九百年不干涸的元气奔流。",
    themeColor: "#75B9BE", // 灵水青蓝
    goldColor: "#FFE17D",
    mutationType: "waterfallGold",
    mutationDesc: "幽涧飞瀑喷薄出金石清响，深潭水纹流转如融化之金",
    coordinates: { x: -18, y: 3.2, z: -35 }
  },
  {
    id: "dangkang",
    name: "当康",
    title: "丰穰之兆 · 陇亩地灵",
    sealText: "当康穰岁",
    iconSymbol: "🌾",
    virtualX: 11100,
    virtualY: 550,
    sectionIndex: 3,
    scrollProgress: 0.494,
    scenicSpot: "卷三 · 麦陇晚烟",
    hint: "山脚梯田竹篱之下，泥土温润，青麦随微弱节奏轻轻起伏。",
    classicQuote: "钦山，多金玉而无石……有兽焉，其状如豚而有牙，其名曰当康，其鸣自叫，见则天下大穰。",
    classicSource: "《山海经 · 东山经》",
    reflection: "江山之重，不在帝王金殿，而在柴扉饭稻。我画下这片层叠梯田与草舍时，悄悄唤来了当康。天下大穰，不靠金銮殿上的祷告，而在陇亩地灵温润的泥土里。青绿山水间那些小小的茅亭农舍，才是这千里锦绣最深厚的底色。",
    themeColor: "#D1A350", // 丰收秋麦金
    goldColor: "#FFF099",
    mutationType: "goldenFields",
    mutationDesc: "层层梯田荡漾起金色麦浪，远村炊烟泛起温暖暖黄辉光",
    coordinates: { x: 12, y: 2.1, z: 42 }
  },
  {
    id: "bo",
    name: "驳",
    title: "天堑玄兽 · 御兵避凶",
    sealText: "驳兽辟兵",
    iconSymbol: "🛡️",
    virtualX: 13200,
    virtualY: 490,
    sectionIndex: 3,
    scrollProgress: 0.587,
    scenicSpot: "卷四 · 关隘石桥",
    hint: "横跨两座险峰的危木悬桥旁，苍松虬枝间有一双如铜铃般镇定威严的眼眸。",
    classicQuote: "中曲之山，有兽焉，其状如马而白身黑尾，一角，虎牙爪，音如鼓音，其名曰驳，是食虎豹，可以御兵。",
    classicSource: "《山海经 · 西山经》",
    reflection: "天堑不险，何以见天地之阔？我将驳兽的骨血铸进了这道横贯两座危峰的千步木拱飞桥。风雨再烈、金戈再盛，只要有脊骨在暗处撑着，这片山河便永远折不断。驳兽踞于隘口，以鼓音镇风止戈。",
    themeColor: "#587291", // 玄黑石青
    goldColor: "#E8C547",
    mutationType: "ironRock",
    mutationDesc: "危峰石骨泛出玄金重彩，苍松松针在山风中激昂铮鸣",
    coordinates: { x: 38, y: 8.5, z: -15 }
  },
  {
    id: "qingniao",
    name: "青鸟",
    title: "绝顶神禽 · 瑶池信使",
    sealText: "青鸟飞信",
    iconSymbol: "🪶",
    virtualX: 16600,
    virtualY: 360,
    sectionIndex: 4,
    scrollProgress: 0.738,
    scenicSpot: "卷五 · 孤刹悬云",
    hint: "直插云霄的孤峰悬崖绝顶，云海翻涌之间，有一抹翠羽青光绕古松盘旋。",
    classicQuote: "三危之山，三青鸟居之。郭璞注：三青鸟主为西王母取食者，别自栖息于此山积石之穴。",
    classicSource: "《山海经 · 西次三经》",
    reflection: "我登不上九重天门，便画出这尊直插青冥的孤峰，引来瑶池信使青鸟。十八岁那年我已猜到了自己的结局——肉身虽将归于历史尘埃，而一羽青光早已越过千山万壑，去往人类对未知天地最轻盈辽阔的遐想深处。",
    themeColor: "#2F9E87", // 翠孔雀绿
    goldColor: "#FFF275",
    mutationType: "cloudSurge",
    mutationDesc: "峰顶云海化为五色金霞，长空回荡远寺铜磐悠扬长音",
    coordinates: { x: 62, y: 16.0, z: 10 }
  },
  {
    id: "baize",
    name: "白泽",
    title: "万象先知 · 归海圣兽",
    sealText: "白泽灵明",
    iconSymbol: "🐉",
    virtualX: 20200,
    virtualY: 520,
    sectionIndex: 5,
    scrollProgress: 0.898,
    scenicSpot: "卷六 · 水心高阁",
    hint: "千里江山浩荡归海的大泽中心，百尺水榭飞檐之下，笼罩着贯通古今的浩瀚祥光。",
    classicQuote: "东望山有兽，名曰白泽，能言，达于万物之情，通万物之灵。王者有德，怀远人之时则出。",
    classicSource: "《抱朴子》与《山海经拾遗》",
    reflection: "卷末烟波浩渺，万壑归海。白泽居于水心高阁，能辨天下万物一万一千五百二十种生灵之真名。当我落下画卷最后一笔，便将整座江山的魂魄尽数托付于它。后世知音若至，天地在此大圆满。",
    themeColor: "#FFFFFF", // 白玉圣灵
    goldColor: "#F3C93E",
    mutationType: "allWorldResonance",
    mutationDesc: "千里江山万峰石青石绿与金碧重彩齐声共振，万物有灵长卷大圆满",
    coordinates: { x: 88, y: 4.8, z: -8 }
  }
];

export const SCENIC_SECTIONS = [
  { id: 0, title: "引首 · 卷起沧溟", subtitle: "宋绢玉轴 · 乾隆御题", range: [0, 0.059] },
  { id: 1, title: "卷一 · 桃溪清流", subtitle: "烟霭初醒 · 渔舟唱晚", range: [0.059, 0.248] },
  { id: 2, title: "卷二 · 雄峰叠翠", subtitle: "悬泉飞瀑 · 绝壁翠微", range: [0.248, 0.439] },
  { id: 3, title: "卷三 · 关隘长桥", subtitle: "万木苍松 · 危桥飞渡", range: [0.439, 0.626] },
  { id: 4, title: "卷四 · 凌云高插", subtitle: "孤刹云表 · 万仞天风", range: [0.626, 0.814] },
  { id: 5, title: "卷五 · 万壑归海", subtitle: "烟波浩渺 · 蔡京跋语", range: [0.814, 1.0] }
];
