/**
 * 《千里江山 · 山海入画》神兽谱与文学注解
 * 收录《山海经》六方祥瑞古灵，融合王希孟青绿山水意象与岛主文学札记
 */

export const BEASTS = [
  {
    id: "lushu",
    name: "鹿蜀",
    title: "桃溪和音 · 杻阳之灵",
    sealText: "鹿蜀和音",
    sectionIndex: 0,
    scrollProgress: 0.14,
    scenicSpot: "卷一 · 桃溪浅滩",
    hint: "浅滩水草繁茂处，微风掠过，隐闻宛如民谣轻吟的啼鸣。",
    classicQuote: "杻阳之山，有兽焉，其状如马而白首，其文如虎而赤尾，其音如谣，其名曰鹿蜀，佩之宜子孙。",
    classicSource: "《山海经 · 南山经》",
    reflection: "少年王希孟落笔的第一笔春水，便是这片桃溪。流水不争先，争的是滔滔不绝。鹿蜀之音不是征战的号角，而是人间最朴素的生生不息——如谣如歌，岁岁年年。",
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
    sectionIndex: 1,
    scrollProgress: 0.31,
    scenicSpot: "卷二 · 悬瀑幽涧",
    hint: "百丈悬瀑激荡的水雾深处，石青岩石旁立有一双若隐若现的白玉四角。",
    classicQuote: "中次三经萯山之首，曰敖岸之山……有兽焉，其状如白鹿而四角，名曰夫诸，见则其邑大水。",
    classicSource: "《山海经 · 中次三经》",
    reflection: "世人皆畏大水，不知唯有奔涌方能洗净尘寰。夫诸踏水而行，四角如初生之枝，它带来的不是灾厄，而是让千里江山永不干涸的元气奔流。",
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
    sectionIndex: 2,
    scrollProgress: 0.48,
    scenicSpot: "卷三 · 麦陇晚烟",
    hint: "山脚梯田竹篱之下，泥土温润，青麦随微弱节奏轻轻起伏。",
    classicQuote: "钦山，多金玉而无石……有兽焉，其状如豚而有牙，其名曰当康，其鸣自叫，见则天下大穰。",
    classicSource: "《山海经 · 东山经》",
    reflection: "江山之重，不在帝王金殿，而在柴扉饭稻。当康一鸣，四海升平。青绿山水间那些小小的茅亭农舍，才是这千里锦绣最深厚的底色。",
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
    sectionIndex: 3,
    scrollProgress: 0.65,
    scenicSpot: "卷四 · 关隘石桥",
    hint: "横跨两座险峰的危木悬桥旁，苍松虬枝间有一双如铜铃般镇定威严的眼眸。",
    classicQuote: "中曲之山，有兽焉，其状如马而白身黑尾，一角，虎牙爪，音如鼓音，其名曰驳，是食虎豹，可以御兵。",
    classicSource: "《山海经 · 西山经》",
    reflection: "险峰之所以能安然耸立千年，皆因有脊骨在暗处支撑。驳兽踞于深涧隘口，以鼓音镇风止戈。山川不险，何以见天地之阔？",
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
    sectionIndex: 4,
    scrollProgress: 0.81,
    scenicSpot: "卷五 · 孤刹悬云",
    hint: "直插云霄的孤峰悬崖绝顶，云海翻涌之间，有一抹翠羽青光绕古松盘旋。",
    classicQuote: "三危之山，三青鸟居之。郭璞注：三青鸟主为西王母取食者，别自栖息于此山积石之穴。",
    classicSource: "《山海经 · 西次三经》",
    reflection: "古人登高望远，所望者非名利，乃万里音书。青鸟飞越千山万壑，羽翼所掠之处，便是人类对未知天地最轻盈辽阔的遐想。",
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
    sectionIndex: 5,
    scrollProgress: 0.94,
    scenicSpot: "卷六 · 水心高阁",
    hint: "千里江山浩荡归海的大泽中心，百尺水榭飞檐之下，笼罩着贯通古今的浩瀚祥光。",
    classicQuote: "东望山有兽，名曰白泽，能言，达于万物之情，通万物之灵。王者有德，怀远人之时则出。",
    classicSource: "《抱朴子》与《山海经拾遗》",
    reflection: "天地无全功，圣人无全能，万物无全用。唯白泽知晓世间一万一千五百二十种精灵的真名。当它在浩瀚江心苏醒，整幅画卷的青绿与泥金才算真正有了魂魄。",
    themeColor: "#FFFFFF", // 白玉圣灵
    goldColor: "#F3C93E",
    mutationType: "allWorldResonance",
    mutationDesc: "千里江山万峰石青石绿与金碧重彩齐声共振，万物有灵长卷大圆满",
    coordinates: { x: 88, y: 4.8, z: -8 }
  }
];

export const SCENIC_SECTIONS = [
  { id: 0, title: "卷一 · 展卷起势", subtitle: "桃溪清流 · 烟霭初醒", range: [0, 0.2] },
  { id: 1, title: "卷二 · 雄峰叠翠", subtitle: "悬泉飞瀑 · 绝壁翠微", range: [0.2, 0.38] },
  { id: 2, title: "卷三 · 麦陇秋色", subtitle: "平沙落雁 · 渔歌晚烟", range: [0.38, 0.56] },
  { id: 3, title: "卷四 · 关隘叠嶂", subtitle: "千步横桥 · 峭壁危栈", range: [0.56, 0.74] },
  { id: 4, title: "卷五 · 凌云高蹈", subtitle: "孤刹云表 · 万仞天风", range: [0.74, 0.88] },
  { id: 5, title: "卷六 · 万壑归海", subtitle: "烟波浩渺 · 水心大成", range: [0.88, 1.0] }
];
