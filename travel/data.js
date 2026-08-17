/* =========================================================================
 * 岛主和佳佳的旅行手账 · 数据层
 * -------------------------------------------------------------------------
 * 这是整个旅行网站的"原料库"。
 *  - destinations：可被 AI 路线引擎调取的目的地池（按大区归类，带标签）
 *  - footprints  ：岛主 & 佳佳真实走过的足迹（种子数据，见到真实日记后替换）
 *  - chinaBoundary / hainan / taiwan：用于在地图上画出中国轮廓与路线
 *
 * 想换成你们真实去过的地儿，只改 footprints 与 destinations 即可，
 * 其余逻辑（生成、渲染、地图）都会自动跟上。
 * ========================================================================= */

window.TRAVEL_DATA = (function () {
  "use strict";

  /* ----- 大区定义（用于路线聚类，避免东奔西跑） ----- */
  const REGIONS = {
    north:     { name: "华北", color: "#3e759f" },
    northeast: { name: "东北", color: "#6f7f42" },
    east:      { name: "华东", color: "#bd8c2f" },
    central:   { name: "华中", color: "#bd5732" },
    south:     { name: "华南", color: "#c98a3a" },
    southwest: { name: "西南", color: "#9f6f3a" },
    northwest: { name: "西北", color: "#a8743a" },
  };

  /* ----- 标签含义 -----
   * 自然：山水风光   人文：古镇/历史/寺庙   美食：吃喝
   * 出片：拍照好看   亲子：带娃友好
   */

  const destinations = [
    /* ===================== 华北 ===================== */
    {
      id: "beijing", name: "北京", city: "北京", region: "north", coord: [116.4, 39.9],
      tags: ["人文", "美食", "出片"], best: ["4", "5", "9", "10"], baseDays: 3,
      intro: "故宫的红墙、胡同的晨光，还有涮肉升腾的热气。",
      highlights: [
        { time: "上午", title: "故宫 · 中轴线", note: "从午门进，沿中轴走到神武门，提前约票。", fixed: true },
        { time: "中午", title: "牛街吃喝", note: "聚宝源涮肉、奶酪魏，回族小吃的集合地。", fixed: false },
        { time: "下午", title: "胡同慢走", note: "东四/杨梅竹斜街，咖啡馆与旧书铺夹杂。", fixed: false },
        { time: "晚上", title: "景山看城", note: "万春亭俯瞰紫禁城金顶，落日最佳。", fixed: false },
      ],
      food: [{ name: "铜锅涮肉", note: "清汤才见羊肉本味" }, { name: "炸酱面", note: "家常但讲究" }, { name: "驴打滚", note: "糯叽叽的甜" }],
      photo: [{ name: "角楼倒影", note: "护城河边拍西北角楼" }, { name: "红墙光影", note: "午后斜光打在宫墙上" }],
      story: "第一次带佳佳来，她在角楼边站了很久，说原来课本里的'紫禁城'是这么大。",
    },
    {
      id: "pingyao", name: "平遥", city: "晋中·平遥", region: "north", coord: [112.18, 37.20],
      tags: ["人文", "出片"], best: ["4", "5", "9", "10"], baseDays: 2,
      intro: "两千年的县城，城墙完整得像被时间忘了。",
      highlights: [
        { time: "上午", title: "古城墙走一圈", note: "南门上城，环城一圈约 3 公里。", fixed: true },
        { time: "中午", title: "洪武记饭店", note: "平遥牛肉、莜面栲栳栳。", fixed: false },
        { time: "下午", title: "日昇昌票号", note: "中国第一家银行的旧址。", fixed: false },
        { time: "晚上", title: "又见平遥", note: "沉浸式演出，旺季要提前订。", fixed: false },
      ],
      food: [{ name: "平遥牛肉", note: "红而香，不腻" }, { name: "碗托", note: "荞麦凉食，酸辣开胃" }],
      photo: [{ name: "灯笼长街", note: "入夜后明清街挂满红灯" }, { name: "城楼星轨", note: "南门城楼配星空" }],
      story: "晚上没灯的地方黑得彻底，佳佳攥着我的手说'这才有古代的感觉'。",
    },
    {
      id: "chengde", name: "承德", city: "河北·承德", region: "north", coord: [117.96, 40.95],
      tags: ["人文", "自然", "亲子"], best: ["6", "7", "8", "9"], baseDays: 2,
      intro: "避暑山庄，皇帝们夏天的办公室兼后花园。",
      highlights: [
        { time: "上午", title: "避暑山庄", note: "山区环湖，建议坐环山车。", fixed: true },
        { time: "下午", title: "外八庙", note: "普陀宗乘之庙，小布达拉宫既视感。", fixed: false },
        { time: "晚上", title: "市区小吃", note: "驴打滚、烧饼、杏仁露。", fixed: false },
      ],
      food: [{ name: "驴打滚", note: "承德更软糯" }, { name: "杏仁茶", note: "本地特产" }],
      photo: [{ name: "山庄烟雨", note: "湖区晨雾" }, { name: "红台白台", note: "外八庙建筑群" }],
      story: "带娃来也不累，山庄大、树多、能坐车，是少数'遛娃+看景'两不误的地方。",
    },
    {
      id: "ulanbutong", name: "乌兰布统", city: "内蒙古·赤峰", region: "north", coord: [117.2, 42.5],
      tags: ["自然", "出片"], best: ["7", "8", "9", "10"], baseDays: 2,
      intro: "草原、白桦、影视基地，秋天的调色盘。",
      highlights: [
        { time: "清晨", title: "影视基地看日出", note: "晨雾 + 草甸，出片率极高。", fixed: true },
        { time: "下午", title: "公主湖 & 白桦林", note: "秋天金黄一片。", fixed: false },
        { time: "晚上", title: "草原星空", note: "光污染少，银河肉眼可见。", fixed: false },
      ],
      food: [{ name: "手把肉", note: "蘸韭菜花" }, { name: "奶茶", note: "咸口，暖身" }],
      photo: [{ name: "晨雾奔马", note: "请牧民牵马入镜" }, { name: "白桦金叶", note: "逆光拍通透感" }],
      story: "佳佳说这是她见过最'开阔'的地方，天 Blu 得不像话。",
    },

    /* ===================== 东北 ===================== */
    {
      id: "harbin", name: "哈尔滨", city: "黑龙江·哈尔滨", region: "northeast", coord: [126.53, 45.80],
      tags: ["人文", "美食", "亲子"], best: ["12", "1", "2"], baseDays: 2,
      intro: "冰雪大世界，和中央大街的面包石。",
      highlights: [
        { time: "上午", title: "中央大街 + 圣索菲亚", note: "俄式建筑，马迭尔冰棍必吃。", fixed: true },
        { time: "下午", title: "冰雪大世界", note: "下午进场，等到夜景亮灯。", fixed: true },
        { time: "晚上", title: "松花江冰雪", note: "江面结冰可走。", fixed: false },
      ],
      food: [{ name: "锅包肉", note: "酸甜酥脆" }, { name: "马迭尔冰棍", note: "零下也要吃" }, { name: "红肠", note: "秋林里道斯" }],
      photo: [{ name: "冰雪城堡", note: "蓝调时刻拍灯饰" }, { name: "穹顶教堂", note: "圣索菲亚内景" }],
      story: "佳佳冻得直跺脚，却不肯走，说'这辈子没见过这么亮的大雪'。",
    },
    {
      id: "yanji", name: "延吉", city: "吉林·延边", region: "northeast", coord: [129.51, 42.91],
      tags: ["美食", "出片"], best: ["6", "7", "8", "9", "12", "1"], baseDays: 2,
      intro: "满街朝鲜文招牌，是东北最'好吃得不正经'的城市。",
      highlights: [
        { time: "上午", title: "水上市场", note: "早市，打糕、米肠、泡菜现做。", fixed: true },
        { time: "中午", title: "全州拌饭 / 冷面", note: "延吉冷面配锅包肉是本地吃法。", fixed: false },
        { time: "下午", title: "朝鲜族民俗园", note: "穿韩服拍照出片。", fixed: false },
      ],
      food: [{ name: "延吉冷面", note: "冰镇牛肉汤" }, { name: "米肠", note: "糯叽叽" }, { name: "烤串", note: "啤酒屋深夜营业" }],
      photo: [{ name: "网红弹幕墙", note: "延大对面那面招牌墙" }, { name: "韩服写真", note: "民俗园逆光" }],
      story: "我们在弹幕墙前拍了二十分钟，佳佳说'这座城市像韩剧取景地'。",
    },

    /* ===================== 华东 ===================== */
    {
      id: "hangzhou", name: "杭州", city: "浙江·杭州", region: "east", coord: [120.15, 30.27],
      tags: ["自然", "人文", "美食", "出片", "亲子"], best: ["3", "4", "5", "9", "10", "11"], baseDays: 2,
      intro: "西湖不必多说，龙井和桂花才是本地人的杭州。",
      highlights: [
        { time: "清晨", title: "苏堤晨跑 / 断桥", note: "七点前人少，雾里的湖最静。", fixed: true },
        { time: "上午", title: "龙井村喝茶", note: "清明前后采茶季最佳。", fixed: false },
        { time: "下午", title: "西溪湿地", note: "摇橹船，人比西湖少。", fixed: false },
        { time: "晚上", title: "河坊街夜食", note: "定胜糕、葱包桧。", fixed: false },
      ],
      food: [{ name: "西湖醋鱼", note: "楼外楼经典" }, { name: "龙井虾仁", note: "茶香清鲜" }, { name: "桂花糕", note: "秋天限定" }],
      photo: [{ name: "雷峰夕照", note: "黄昏拍塔与湖" }, { name: "苏堤春晓", note: "桃柳烟柳" }],
      story: "和佳佳在龙井村泡了一下午，什么也没干，却觉得最该这样。",
    },
    {
      id: "suzhou", name: "苏州", city: "江苏·苏州", region: "east", coord: [120.62, 31.30],
      tags: ["人文", "出片", "美食"], best: ["3", "4", "5", "10", "11"], baseDays: 2,
      intro: "园林是立体的诗，平江路是活着的宋。",
      highlights: [
        { time: "上午", title: "拙政园", note: "开门就进，避开人流。", fixed: true },
        { time: "中午", title: "哑巴生煎 / 苏面", note: "同得兴枫镇大肉面。", fixed: false },
        { time: "下午", title: "平江路 + 耦园", note: "小桥流水，评弹可听一段。", fixed: false },
      ],
      food: [{ name: "苏式汤面", note: "头汤面最鲜" }, { name: "松鼠桂鱼", note: "酸甜酥脆" }, { name: "蟹壳黄", note: "酥饼" }],
      photo: [{ name: "园林漏窗", note: "框景构图" }, { name: "平江夜灯", note: "河沿红灯" }],
      story: "佳佳在耦园说：'苏州人把日子过成了画。'",
    },
    {
      id: "shanghai", name: "上海", city: "上海", region: "east", coord: [121.47, 31.23],
      tags: ["人文", "美食", "出片", "亲子"], best: ["3", "4", "5", "10", "11"], baseDays: 2,
      intro: "武康路的梧桐、外滩的万国建筑，和永远排队的本帮菜。",
      highlights: [
        { time: "上午", title: "武康路漫步", note: "武康大楼 + 安福路小店。", fixed: true },
        { time: "下午", title: "外滩 + 陆家嘴", note: "白天看建筑，晚上看天际线。", fixed: false },
        { time: "晚上", title: "苏州河夜游", note: "或南京路逛吃。", fixed: false },
      ],
      food: [{ name: "红烧肉", note: "本帮浓油赤酱" }, { name: "生煎", note: "底脆汁多" }, { name: "葱油拌面", note: "简单上头" }],
      photo: [{ name: "武康大楼", note: "街角仰拍" }, { name: "外滩夜景", note: "对岸陆家嘴" }],
      story: "佳佳说上海适合'什么都不计划，就逛'。",
    },
    {
      id: "huangshan", name: "黄山", city: "安徽·黄山", region: "east", coord: [118.34, 30.13],
      tags: ["自然", "出片"], best: ["4", "5", "9", "10", "11"], baseDays: 2,
      intro: "奇松、怪石、云海、温泉，四绝都在山上。",
      highlights: [
        { time: "清晨", title: "光明顶 / 始信峰看日出", note: "住山上才能赶得上。", fixed: true },
        { time: "上午", title: "西海大峡谷", note: "地轨缆车下行，景色最震撼。", fixed: true },
        { time: "下午", title: "迎客松 + 玉屏索道下", note: "体力不支可早下。", fixed: false },
      ],
      food: [{ name: "臭鳜鱼", note: "闻着臭吃着香" }, { name: "毛豆腐", note: "煎过配辣酱" }, { name: "笋干", note: "山货" }],
      photo: [{ name: "云海日出", note: "雨后概率高" }, { name: "迎客松剪影", note: "悬崖边" }],
      story: "爬到一半佳佳说腿断了，看完日出又活了。",
    },
    {
      id: "xiamen", name: "厦门", city: "福建·厦门", region: "east", coord: [118.09, 24.48],
      tags: ["美食", "出片", "亲子", "人文"], best: ["3", "4", "10", "11"], baseDays: 2,
      intro: "鼓浪屿的琴声，和八市的烟火气。",
      highlights: [
        { time: "上午", title: "八市吃早餐", note: "沙茶面、海蛎煎、花生汤。", fixed: true },
        { time: "下午", title: "鼓浪屿", note: "提前买船票，岛上慢走。", fixed: true },
        { time: "傍晚", title: "环岛路骑车", note: "椰风寨到会展中心。", fixed: false },
      ],
      food: [{ name: "沙茶面", note: "汤头浓郁" }, { name: "海蛎煎", note: "配甜辣酱" }, { name: "姜母鸭", note: "滋补助眠" }],
      photo: [{ name: "双子塔日落", note: "演武大桥观景" }, { name: "鼓浪屿红顶", note: "琴岛俯拍" }],
      story: "佳佳在鼓浪屿一家旧书店待了一小时，买了一张明信片。",
    },
    {
      id: "wuyuan", name: "婺源", city: "江西·上饶", region: "east", coord: [117.86, 29.25],
      tags: ["自然", "人文", "出片"], best: ["3", "4", "10", "11"], baseDays: 2,
      intro: "春天油菜花海，秋天晒秋，是中国最美的村子。",
      highlights: [
        { time: "清晨", title: "篁岭晒秋", note: "错落民居 + 红黄作物，出片王。", fixed: true },
        { time: "上午", title: "江岭梯田", note: "春天油菜花满山。", fixed: false },
        { time: "下午", title: "李坑 / 晓起", note: "小桥流水古村。", fixed: false },
      ],
      food: [{ name: "糊豆腐", note: "本地家常" }, { name: "荷包红鲤鱼", note: "微甜" }, { name: "蒸汽糕", note: "米糕" }],
      photo: [{ name: "晒秋人家", note: "篁岭全景" }, { name: "花海梯田", note: "江岭俯拍" }],
      story: "三月来，佳佳说'像掉进了一碗蛋黄里'。",
    },
    {
      id: "qingdao", name: "青岛", city: "山东·青岛", region: "east", coord: [120.38, 36.07],
      tags: ["美食", "出片", "亲子"], best: ["6", "7", "8", "9"], baseDays: 2,
      intro: "红瓦绿树、碧海蓝天，还有塑料袋装的原浆。",
      highlights: [
        { time: "上午", title: "栈桥 + 小青岛", note: "老城海岸线。", fixed: true },
        { time: "下午", title: "八大关 + 第二海水浴场", note: "万国建筑 + 沙滩。", fixed: false },
        { time: "晚上", title: "台东夜市 + 啤酒", note: "塑料袋啤酒打卡。", fixed: false },
      ],
      food: [{ name: "原浆啤酒", note: "当天才好喝" }, { name: "辣炒蛤蜊", note: "配酒" }, { name: "鲅鱼水饺", note: "本地特色" }],
      photo: [{ name: "红瓦航拍", note: "信号山俯拍老城" }, { name: "浴场日落", note: "第二海水浴场" }],
      story: "佳佳第一次喝塑料袋啤酒，笑得直不起腰。",
    },
    {
      id: "nanjing", name: "南京", city: "江苏·南京", region: "east", coord: [118.80, 32.06],
      tags: ["人文", "美食", "出片"], best: ["3", "4", "10", "11"], baseDays: 2,
      intro: "梧桐大道、城墙、和一碗皮肚面的温度。",
      highlights: [
        { time: "上午", title: "中山陵 + 音乐台", note: "梧桐大道徒步。", fixed: true },
        { time: "下午", title: "夫子庙 + 老门东", note: "秦淮烟火。", fixed: false },
        { time: "晚上", title: "城墙看灯", note: "中华门段夜景。", fixed: false },
      ],
      food: [{ name: "皮肚面", note: "料足汤鲜" }, { name: "盐水鸭", note: "凉菜经典" }, { name: "梅花糕", note: "甜点" }],
      photo: [{ name: "梧桐光影", note: "陵园路仰拍" }, { name: "秦淮灯影", note: "河边夜景" }],
      story: "深秋的梧桐大道，佳佳捡了一片叶子夹进书里。",
    },
    {
      id: "wuyishan", name: "武夷山", city: "福建·南平", region: "east", coord: [118.03, 27.72],
      tags: ["自然", "人文", "美食"], best: ["4", "5", "9", "10"], baseDays: 2,
      intro: "九曲溪竹筏，和大红袍的岩骨花香。",
      highlights: [
        { time: "上午", title: "九曲溪竹筏", note: "漂流的视角看丹霞。", fixed: true },
        { time: "下午", title: "天游峰", note: "登高看云海。", fixed: false },
        { time: "晚上", title: "印象大红袍", note: "实景演出。", fixed: false },
      ],
      food: [{ name: "岚谷熏鹅", note: "烟熏辣香" }, { name: "文公菜", note: "本地宴菜" }, { name: "大红袍", note: "岩茶" }],
      photo: [{ name: "九曲漂流", note: "筏上拍丹霞" }, { name: "茶山晨雾", note: "岩茶产区" }],
      story: "竹筏上的艄公讲了好多传说，佳佳听得入迷。",
    },

    /* ===================== 华中 ===================== */
    {
      id: "zhangjiajie", name: "张家界", city: "湖南·张家界", region: "central", coord: [110.48, 29.12],
      tags: ["自然", "出片"], best: ["4", "5", "9", "10"], baseDays: 3,
      intro: "三千奇峰拔地而起，像误入潘多拉。",
      highlights: [
        { time: "上午", title: "袁家界 + 乾坤柱", note: "《阿凡达》取景地。", fixed: true },
        { time: "下午", title: "天子山索道", note: "俯瞰峰林。", fixed: false },
        { time: "清晨", title: "天门山玻璃栈道", note: "第二天早起，云海最佳。", fixed: true },
      ],
      food: [{ name: "三下锅", note: "土家炖菜" }, { name: "酸鱼", note: "腊味" }, { name: "莓茶", note: "本地藤茶" }],
      photo: [{ name: "峰林云海", note: "雨后清晨" }, { name: "玻璃栈道", note: "悬空感" }],
      story: "佳佳恐高，硬是被我拉上了玻璃栈道，下来腿软但很骄傲。",
    },
    {
      id: "wuhan", name: "武汉", city: "湖北·武汉", region: "central", coord: [114.30, 30.59],
      tags: ["美食", "人文", "出片"], best: ["3", "4", "10", "11"], baseDays: 2,
      intro: "滚滚长江、樱花开满的珞珈山，和过早的江湖。",
      highlights: [
        { time: "清晨", title: "户部巷过早", note: "热干面、豆皮、糊汤粉。", fixed: true },
        { time: "上午", title: "黄鹤楼 + 长江大桥", note: "登楼看江。", fixed: false },
        { time: "下午", title: "东湖绿道", note: "骑车环湖。", fixed: false },
      ],
      food: [{ name: "热干面", note: "芝麻酱香" }, { name: "豆皮", note: "糯米煎饼" }, { name: "鸭脖", note: "周黑鸭" }],
      photo: [{ name: "樱花大道", note: "武大三月" }, { name: "江城夜色", note: "两江四岸" }],
      story: "三月武大的樱花，佳佳说'这才叫春天的仪式感'。",
    },
    {
      id: "luoyang", name: "洛阳", city: "河南·洛阳", region: "central", coord: [112.45, 34.62],
      tags: ["人文", "出片"], best: ["4", "5", "9", "10"], baseDays: 2,
      intro: "龙门石窟的佛，和牡丹花开时的全城。",
      highlights: [
        { time: "上午", title: "龙门石窟", note: "卢舍那大佛必看。", fixed: true },
        { time: "下午", title: "白马寺", note: "中国第一古刹。", fixed: false },
        { time: "晚上", title: "洛邑古城", note: "汉服夜游出片。", fixed: false },
      ],
      food: [{ name: "水席", note: "24 道汤菜" }, { name: "牛肉汤", note: "清晨喝" }, { name: "牡丹饼", note: "应季" }],
      photo: [{ name: "卢舍那夜灯", note: "石窟亮灯" }, { name: "汉服古城", note: "洛邑夜景" }],
      story: "佳佳穿了汉服在洛邑古城走了一圈，说'终于当了一回古人'。",
    },

    /* ===================== 华南 ===================== */
    {
      id: "guilin", name: "桂林 / 阳朔", city: "广西·桂林", region: "south", coord: [110.29, 25.27],
      tags: ["自然", "出片", "亲子", "人文"], best: ["4", "5", "9", "10"], baseDays: 3,
      intro: "桂林山水甲天下，阳朔是山水里的封面。",
      highlights: [
        { time: "上午", title: "漓江竹筏（杨堤—兴坪）", note: "20 元人民币背景取景地。", fixed: true },
        { time: "下午", title: "遇龙河漂流", note: "更静更秀。", fixed: false },
        { time: "傍晚", title: "阳朔西街", note: "吃喝 + 骑行。", fixed: false },
        { time: "清晨", title: "相公山看日出", note: "俯瞰漓江第一湾。", fixed: true },
      ],
      food: [{ name: "桂林米粉", note: "卤水灵魂" }, { name: "啤酒鱼", note: "阳朔招牌" }, { name: "田螺酿", note: "酿菜" }],
      photo: [{ name: "漓江渔火", note: "老翁 + 鸬鹚" }, { name: "相公山云海", note: "日出湾流" }],
      story: "佳佳在遇龙河上睡着了，说'漂着漂着就什么烦恼都没了'。",
    },
    {
      id: "sanya", name: "三亚", city: "海南·三亚", region: "south", coord: [109.51, 18.25],
      tags: ["自然", "美食", "亲子", "出片"], best: ["11", "12", "1", "2", "3"], baseDays: 3,
      intro: "冬天逃离寒冷的唯一合法理由。",
      highlights: [
        { time: "上午", title: "亚龙湾 / 海棠湾", note: "沙细水清。", fixed: true },
        { time: "下午", title: "蜈支洲岛", note: "潜水、拖曳伞。", fixed: false },
        { time: "晚上", title: "第一市场海鲜", note: "加工店现买现做。", fixed: false },
      ],
      food: [{ name: "清补凉", note: "椰奶甜品" }, { name: "文昌鸡", note: "白切" }, { name: "和乐蟹", note: "膏满" }],
      photo: [{ name: "椰林沙滩", note: "逆光剪影" }, { name: "玻璃海", note: "蜈支洲水下" }],
      story: "带佳佳第一次看海，她在浪里笑得像孩子。",
    },
    {
      id: "guangzhou", name: "广州", city: "广东·广州", region: "south", coord: [113.26, 23.13],
      tags: ["美食", "人文", "亲子"], best: ["3", "4", "10", "11", "12"], baseDays: 2,
      intro: "食在广州，从早茶到宵夜，一天能吃六顿。",
      highlights: [
        { time: "清晨", title: "老茶馆饮早茶", note: "虾饺、烧卖、凤爪。", fixed: true },
        { time: "下午", title: "沙面 + 永庆坊", note: "欧陆建筑 + 西关风情。", fixed: false },
        { time: "晚上", title: "珠江夜游", note: "小蛮腰灯光。", fixed: false },
      ],
      food: [{ name: "早茶", note: "一盅两件" }, { name: "肠粉", note: "布拉肠" }, { name: "烧鹅", note: "皮脆" }],
      photo: [{ name: "小蛮腰夜景", note: "珠江对岸" }, { name: "沙面骑楼", note: "欧陆街拍" }],
      story: "佳佳的胃在广州彻底被征服，回程还在念肠粉。",
    },
    {
      id: "chaozhou", name: "潮州", city: "广东·潮州", region: "south", coord: [116.63, 23.66],
      tags: ["美食", "人文", "出片"], best: ["3", "4", "10", "11"], baseDays: 2,
      intro: "工夫茶、牌坊街，和一碗牛骨汤的慢。",
      highlights: [
        { time: "上午", title: "牌坊街 + 广济桥", note: "十八梭船廿四洲。", fixed: true },
        { time: "中午", title: "牛肉火锅", note: "现切吊龙最嫩。", fixed: false },
        { time: "下午", title: "工夫茶体验", note: "老茶馆学泡一壶。", fixed: false },
      ],
      food: [{ name: "牛肉火锅", note: "鲜切" }, { name: "粿条", note: "汤粉" }, { name: "鸭母捻", note: "甜汤" }],
      photo: [{ name: "广济桥晨雾", note: "浮桥开启" }, { name: "牌坊长街", note: "骑楼街拍" }],
      story: "在潮州学会了'关公巡城'的斟茶手法，佳佳说我有模有样。",
    },

    /* ===================== 西南 ===================== */
    {
      id: "chengdu", name: "成都", city: "四川·成都", region: "southwest", coord: [104.07, 30.57],
      tags: ["美食", "人文", "亲子", "出片"], best: ["3", "4", "5", "9", "10"], baseDays: 2,
      intro: "熊猫、火锅、和喝茶摆龙门阵的从容。",
      highlights: [
        { time: "清晨", title: "大熊猫基地", note: "早去看活跃的幼崽。", fixed: true },
        { time: "下午", title: "宽窄巷子 / 锦里", note: "喝茶、掏耳朵。", fixed: false },
        { time: "晚上", title: "火锅", note: "微辣起步，配唯怡。", fixed: false },
      ],
      food: [{ name: "火锅", note: "牛油现炒" }, { name: "串串香", note: "市井" }, { name: "甜水面", note: "麻辣甜" }],
      photo: [{ name: "熊猫啃竹", note: "基地抓拍" }, { name: "锦里夜灯", note: "红灯笼" }],
      story: "佳佳说成都是'来了就不想走'的城市，我们比较后觉得她说得对。",
    },
    {
      id: "chongqing", name: "重庆", city: "重庆", region: "southwest", coord: [106.55, 29.56],
      tags: ["美食", "出片", "人文"], best: ["3", "4", "10", "11"], baseDays: 2,
      intro: "8D 魔幻立体城，火锅味的江湖。",
      highlights: [
        { time: "上午", title: "李子坝轻轨 + 洪崖洞", note: "穿楼轻轨必看。", fixed: true },
        { time: "下午", title: "山城步道", note: "爬坡上坎看江。", fixed: false },
        { time: "晚上", title: "两江夜游", note: "灯火璀璨。", fixed: false },
      ],
      food: [{ name: "重庆火锅", note: "九宫格" }, { name: "小面", note: "麻辣鲜香" }, { name: "酸辣粉", note: "街边" }],
      photo: [{ name: "洪崖洞夜景", note: "千与千寻既视感" }, { name: "轻轨穿楼", note: "李子坝" }],
      story: "重庆把佳佳绕晕了，却在每个转角给她惊喜。",
    },
    {
      id: "dali", name: "大理", city: "云南·大理", region: "southwest", coord: [100.27, 25.60],
      tags: ["自然", "人文", "出片", "亲子"], best: ["3", "4", "5", "9", "10", "11"], baseDays: 3,
      intro: "苍山洱海间，风花雪月，时间会自己慢下来。",
      highlights: [
        { time: "清晨", title: "洱海生态廊道骑行", note: "才村到喜洲一段最美。", fixed: true },
        { time: "上午", title: "喜洲古镇", note: "白族扎染、稻田。", fixed: false },
        { time: "下午", title: "双廊看海", note: "海边咖啡发呆。", fixed: false },
        { time: "晚上", title: "大理古城", note: "洋人街夜生活。", fixed: false },
      ],
      food: [{ name: "乳扇", note: "烤或炸" }, { name: "喜洲粑粑", note: "麦香" }, { name: "酸辣鱼", note: "洱海鱼" }],
      photo: [{ name: "洱海倒影", note: "无风如镜" }, { name: "喜洲稻田", note: "秋天金黄" }],
      story: "和佳佳在洱海边租了辆车，什么都不赶，只是沿着海走。",
    },
    {
      id: "lijiang", name: "丽江", city: "云南·丽江", region: "southwest", coord: [100.23, 26.86],
      tags: ["人文", "自然", "出片"], best: ["3", "4", "5", "9", "10", "11"], baseDays: 2,
      intro: "玉龙雪山下的古城，和束河的安静。",
      highlights: [
        { time: "上午", title: "玉龙雪山 + 蓝月谷", note: "大索道上冰川公园。", fixed: true },
        { time: "下午", title: "束河古镇", note: "比大研清静。", fixed: false },
        { time: "晚上", title: "古城民谣", note: "酒吧听现场。", fixed: false },
      ],
      food: [{ name: "腊排骨", note: "火锅" }, { name: "鸡豆凉粉", note: "本地小吃" }, { name: "鲜花饼", note: "现烤" }],
      photo: [{ name: "雪山倒影", note: "蓝月谷" }, { name: "古城夜色", note: "红灯木楼" }],
      story: "佳佳在玉龙雪山脚下许了个愿，没告诉我是什么。",
    },
    {
      id: "kunming", name: "昆明 / 抚仙湖", city: "云南·昆明", region: "southwest", coord: [102.83, 24.88],
      tags: ["自然", "美食", "亲子"], best: ["3", "4", "5", "9", "10", "11"], baseDays: 2,
      intro: "四季如春，抚仙湖是云南最干净的那滴蓝。",
      highlights: [
        { time: "上午", title: "抚仙湖环湖", note: "禄充、孤山，水清见底。", fixed: true },
        { time: "下午", title: "翠湖 + 滇池", note: "冬天红嘴鸥。", fixed: false },
        { time: "晚上", title: "南强街夜市", note: "小吃集合。", fixed: false },
      ],
      food: [{ name: "过桥米线", note: "滚汤烫熟" }, { name: "汽锅鸡", note: "蒸制" }, { name: "鲜花饼", note: "伴手礼" }],
      photo: [{ name: "抚仙湖蓝", note: "晴天纯净" }, { name: "红嘴鸥", note: "滇池冬季" }],
      story: "佳佳说昆明的云'低得伸手就能摸到'。",
    },
    {
      id: "qianxi", name: "黔东南（西江千户苗寨）", city: "贵州·黔东南", region: "southwest", coord: [108.0, 26.4],
      tags: ["人文", "出片", "美食"], best: ["4", "5", "6", "9", "10"], baseDays: 2,
      intro: "全世界最大的苗寨，千户吊脚楼依山亮灯。",
      highlights: [
        { time: "下午", title: "苗寨入寨", note: "观景台看千户灯海。", fixed: true },
        { time: "晚上", title: "长桌宴 + 拦门酒", note: "体验苗家礼。", fixed: false },
        { time: "清晨", title: "晨雾梯田", note: "早起拍云雾。", fixed: false },
      ],
      food: [{ name: "酸汤鱼", note: "红酸汤" }, { name: "糯米饭", note: "五彩" }, { name: "腊肉", note: "柴火" }],
      photo: [{ name: "千户灯海", note: "夜景全景" }, { name: "晨雾苗岭", note: "清晨" }],
      story: "佳佳在长桌宴上被灌了拦门酒，脸红了一整晚。",
    },
    {
      id: "lhasa", name: "拉萨", city: "西藏·拉萨", region: "southwest", coord: [91.14, 29.65],
      tags: ["人文", "自然", "出片"], best: ["5", "6", "7", "8", "9"], baseDays: 3,
      intro: "日光之城的信仰，和纳木错的蓝。",
      highlights: [
        { time: "上午", title: "布达拉宫", note: "提前预约，慢爬上去。", fixed: true },
        { time: "下午", title: "大昭寺 + 八廓街", note: "转经道，酥油灯。", fixed: false },
        { time: "第二天", title: "纳木错", note: "圣湖一日。", fixed: false },
      ],
      food: [{ name: "藏面", note: "清汤" }, { name: "酥油茶", note: "咸香" }, { name: "牦牛肉", note: "风干" }],
      photo: [{ name: "布宫日出", note: "广场倒影池" }, { name: "纳木错蓝", note: "圣湖" }],
      story: "在海拔三千六，佳佳走几步就喘，却说'离天近的地方，心也静'。",
    },
    {
      id: "daocheng", name: "稻城亚丁", city: "四川·甘孜", region: "southwest", coord: [100.3, 29.0],
      tags: ["自然", "出片"], best: ["4", "5", "9", "10"], baseDays: 3,
      intro: "蓝色星球上最后一片净土，三神山与海子。",
      highlights: [
        { time: "上午", title: "稻城亚丁长线", note: "牛奶海、五色海，高反需慢。", fixed: true },
        { time: "下午", title: "珍珠海看仙乃日", note: "短线轻松。", fixed: false },
        { time: "晚上", title: "香格里拉镇休整", note: "海拔高，早休息。", fixed: false },
      ],
      food: [{ name: "牦牛汤锅", note: "暖身" }, { name: "青稞饼", note: "干粮" }, { name: "松茸", note: "应季" }],
      photo: [{ name: "牛奶海", note: "雪山环抱" }, { name: "秋色万亩", note: "稻城红黄" }],
      story: "佳佳高反吐了，却坚持看完牛奶海，说'这辈子值了'。",
    },
    {
      id: "jiuzhai", name: "九寨沟", city: "四川·阿坝", region: "southwest", coord: [103.92, 33.26],
      tags: ["自然", "出片", "亲子"], best: ["9", "10", "11"], baseDays: 2,
      intro: "五彩的海子，像打翻的调色盘。",
      highlights: [
        { time: "上午", title: "日则沟（五花海 / 珍珠滩）", note: "精华段。", fixed: true },
        { time: "下午", title: "则查洼沟（长海 / 五彩池）", note: "坐车上行。", fixed: false },
        { time: "晚上", title: "《九寨千古情》", note: "演出可选。", fixed: false },
      ],
      food: [{ name: "藏式火锅", note: "牦牛" }, { name: "洋芋糍粑", note: "黏糯" }, { name: "青稞酒", note: "少饮" }],
      photo: [{ name: "五花海", note: "正午最艳" }, { name: "诺日朗", note: "瀑布群" }],
      story: "佳佳说九寨的水'假得像 PS 的'，可它就是真的。",
    },

    /* ===================== 西北 ===================== */
    {
      id: "xian", name: "西安", city: "陕西·西安", region: "northwest", coord: [108.94, 34.34],
      tags: ["人文", "美食", "出片", "亲子"], best: ["3", "4", "5", "9", "10"], baseDays: 3,
      intro: "十三朝古都，兵马俑与回民街的烟火。",
      highlights: [
        { time: "上午", title: "兵马俑", note: "一号坑最震撼，请讲解。", fixed: true },
        { time: "下午", title: "城墙骑行", note: "南门上，环城一圈。", fixed: false },
        { time: "晚上", title: "回民街 + 大唐不夜城", note: "吃喝 + 灯光。", fixed: false },
      ],
      food: [{ name: "肉夹馍", note: "腊汁" }, { name: "biangbiang面", note: "宽面" }, { name: "羊肉泡馍", note: "手掰" }],
      photo: [{ name: "大唐不夜城", note: "夜景灯光" }, { name: "城墙落日", note: "骑行俯拍" }],
      story: "佳佳在兵马俑前沉默了很久，说'两千年的人，还在排队'。",
    },
    {
      id: "dunhuang", name: "敦煌", city: "甘肃·酒泉", region: "northwest", coord: [94.66, 40.14],
      tags: ["人文", "自然", "出片"], best: ["5", "6", "7", "8", "9", "10"], baseDays: 2,
      intro: "莫高窟的壁画，和鸣沙山月牙泉的孤勇。",
      highlights: [
        { time: "上午", title: "莫高窟", note: "A 类票看 8 个窟 + 数字中心。", fixed: true },
        { time: "傍晚", title: "鸣沙山月牙泉", note: "日落爬沙山。", fixed: true },
        { time: "晚上", title: "沙洲夜市", note: "杏皮水、驴肉黄面。", fixed: false },
      ],
      food: [{ name: "驴肉黄面", note: "招牌" }, { name: "杏皮水", note: "解腻" }, { name: "羊肉粉汤", note: "早餐" }],
      photo: [{ name: "月牙泉夜", note: "沙山映泉" }, { name: "雅丹落日", note: "魔鬼城" }],
      story: "佳佳在莫高窟听得眼睛发亮，说这是'会呼吸的历史'。",
    },
    {
      id: "zhangye", name: "张掖", city: "甘肃·张掖", region: "northwest", coord: [100.45, 38.93],
      tags: ["自然", "出片"], best: ["6", "7", "8", "9"], baseDays: 1,
      intro: "七彩丹霞，大地被泼了颜料。",
      highlights: [
        { time: "清晨/黄昏", title: "七彩丹霞地质公园", note: "4 号、1 号观景台最出片。", fixed: true },
        { time: "下午", title: "马蹄寺", note: "祁连山中的石窟。", fixed: false },
      ],
      food: [{ name: "搓鱼面", note: "本地面食" }, { name: "牛肉小饭", note: "粒状" }, { name: "酿皮", note: "凉食" }],
      photo: [{ name: "丹霞条纹", note: "侧光最艳" }, { name: "祁连雪线", note: "背景" }],
      story: "佳佳说张掖是'一天看完全年颜色'的地方。",
    },
    {
      id: "qinghai", name: "青海湖", city: "青海·海北", region: "northwest", coord: [100.2, 36.9],
      tags: ["自然", "出片", "亲子"], best: ["6", "7", "8"], baseDays: 2,
      intro: "高原上的蓝，和七月铺天的油菜花。",
      highlights: [
        { time: "上午", title: "青海湖二郎剑", note: "环湖骑行一段。", fixed: true },
        { time: "下午", title: "茶卡盐湖", note: "天空之镜，需晴天。", fixed: false },
        { time: "晚上", title: "黑马河看日出", note: "湖边住宿。", fixed: false },
      ],
      food: [{ name: "炕锅羊肉", note: "土豆+羊排" }, { name: "酸奶", note: "厚脂" }, { name: "狗浇尿", note: "油饼" }],
      photo: [{ name: "天空之镜", note: "茶卡倒影" }, { name: "湖畔花海", note: "七月" }],
      story: "佳佳在茶卡盐湖拍了'倒影照'，说这是她最满意的一张。",
    },
    {
      id: "kashgar", name: "喀什", city: "新疆·喀什", region: "northwest", coord: [75.99, 39.47],
      tags: ["人文", "美食", "出片"], best: ["5", "6", "7", "8", "9", "10"], baseDays: 3,
      intro: "中国最西的城，老茶馆里的时间停在百年前。",
      highlights: [
        { time: "上午", title: "喀什古城", note: "开城仪式、百年老茶馆。", fixed: true },
        { time: "下午", title: "香妃园 / 艾提尕尔", note: "人文厚重。", fixed: false },
        { time: "第二天", title: "帕米尔高原（慕士塔格）", note: "冰山之父。", fixed: false },
      ],
      food: [{ name: "烤包子", note: "皮脆馅香" }, { name: "缸子肉", note: "茶缸炖" }, { name: "鸽子汤", note: "滋补" }],
      photo: [{ name: "古城巷陌", note: "土黄高墙" }, { name: "冰山之父", note: "雪峰" }],
      story: "佳佳在老茶馆听维族老人弹都塔尔，说'音乐不用懂，也能醉'。",
    },
    {
      id: "yinchuan", name: "银川", city: "宁夏·银川", region: "northwest", coord: [106.23, 38.49],
      tags: ["人文", "自然", "美食"], best: ["5", "6", "7", "8", "9"], baseDays: 2,
      intro: "西夏王陵、沙湖，和黄河边的枸杞红。",
      highlights: [
        { time: "上午", title: "西夏王陵", note: "东方金字塔。", fixed: true },
        { time: "下午", title: "沙湖", note: "沙与水共生。", fixed: false },
        { time: "晚上", title: "怀远夜市", note: "辣糊糊、羊肉串。", fixed: false },
      ],
      food: [{ name: "手抓羊肉", note: "原味" }, { name: "辣糊糊", note: "夜市" }, { name: "枸杞", note: "特产" }],
      photo: [{ name: "王陵剪影", note: "戈壁土冢" }, { name: "沙湖飞鸟", note: "芦苇" }],
      story: "佳佳第一次见'沙里有水'，说宁夏像个矛盾体。",
    },
    {
      id: "hulunbuir", name: "呼伦贝尔", city: "内蒙古·呼伦贝尔", region: "northeast", coord: [119.7, 49.2],
      tags: ["自然", "出片", "亲子"], best: ["6", "7", "8"], baseDays: 3,
      intro: "风吹草低见牛羊，是中国最大的绿。",
      highlights: [
        { time: "上午", title: "莫日格勒河", note: "天下第一曲水。", fixed: true },
        { time: "下午", title: "额尔古纳湿地", note: "亚洲第一湿地。", fixed: false },
        { time: "第二天", title: "满洲里", note: "中俄蒙风情边城。", fixed: false },
      ],
      food: [{ name: "手把肉", note: "蘸韭菜花" }, { name: "奶茶", note: "咸口" }, { name: "列巴", note: "俄式" }],
      photo: [{ name: "草原落日", note: "地平线极宽" }, { name: "湿地晨雾", note: "额尔古纳" }],
      story: "佳佳在草原上跑了很远，回头喊'原来天真的这么大'。",
    },

    /* ===================== 青甘大环线新增站点（供"青甘大环线"路线模板调用） ===================== */
    {
      id: "xining", name: "西宁", city: "青海·西宁", region: "northwest", coord: [101.78, 36.62],
      tags: ["人文", "美食", "出片"], best: ["6", "7", "8", "9"], baseDays: 1,
      intro: "青藏门户，出发前先吃碗酿皮、喝碗酸奶。",
      highlights: [
        { time: "上午", title: "东关清真大寺", note: "西北最大清真寺之一。", fixed: true },
        { time: "下午", title: "青海省博物馆", note: "先做功课再上路。", fixed: false },
      ],
      food: [{ name: "酿皮", note: "酸辣" }, { name: "酸奶", note: "厚奶皮" }, { name: "手抓羊肉", note: "原味" }],
      photo: [{ name: "东关大寺", note: "穹顶" }, { name: "城市天际线", note: "湟水畔" }],
      story: "西宁是西北环线的起点，油箱加满、胃也加满。",
    },
    {
      id: "chaka", name: "茶卡盐湖", city: "青海·海西", region: "northwest", coord: [99.08, 36.75],
      tags: ["自然", "出片"], best: ["6", "7", "8"], baseDays: 1,
      intro: "天空之镜，白盐铺到天边。",
      highlights: [
        { time: "上午", title: "天空之镜", note: "清晨人少、倒影最干净。", fixed: true },
        { time: "下午", title: "盐雕群", note: "盐做的雕塑。", fixed: false },
      ],
      food: [{ name: "盐湖鱼", note: "湖鱼" }, { name: "青稞饼", note: "主食" }],
      photo: [{ name: "镜面倒影", note: "红衣最出片" }, { name: "白盐小火车", note: "铁轨延伸" }],
      story: "佳佳说，站进湖里像踩在云上。",
    },
    {
      id: "dachaidan", name: "大柴旦", city: "青海·海西", region: "northwest", coord: [95.37, 37.83],
      tags: ["自然", "出片"], best: ["6", "7", "8", "9"], baseDays: 1,
      intro: "翡翠湖，一汪汪绿松石色的水。",
      highlights: [
        { time: "下午", title: "翡翠湖", note: "无人机视角最绝。", fixed: true },
        { time: "傍晚", title: "大柴旦镇", note: "补给住宿。", fixed: false },
      ],
      food: [{ name: "炕锅羊肉", note: "铁锅焖" }, { name: "牦牛酸奶", note: "酸" }],
      photo: [{ name: "翡翠湖色块", note: "俯拍" }, { name: "雅丹夕照", note: "附近" }],
      story: "从茶卡一路向西，颜色越来越不真实。",
    },
    {
      id: "jiayuguan", name: "嘉峪关", city: "甘肃·嘉峪关", region: "northwest", coord: [98.29, 39.77],
      tags: ["人文", "出片"], best: ["5", "6", "7", "8", "9", "10"], baseDays: 1,
      intro: "天下第一雄关，明长城的西端。",
      highlights: [
        { time: "上午", title: "嘉峪关城楼", note: "登楼望戈壁。", fixed: true },
        { time: "下午", title: "悬壁长城", note: "攀爬感强。", fixed: false },
      ],
      food: [{ name: "嘉峪关烤肉", note: "孜然香" }, { name: "糊锅", note: "本地早饭" }],
      photo: [{ name: "关城剪影", note: "逆光" }, { name: "戈壁城墙", note: "远景" }],
      story: "从这里往西，长城到了尽头，丝路才刚开始。",
    },
    {
      id: "qilian", name: "祁连山脉", city: "青海·祁连", region: "northwest", coord: [100.25, 38.18],
      tags: ["自然", "出片"], best: ["6", "7", "8"], baseDays: 1,
      intro: "雪山下草原连着油菜花，车窗外的风景一直在换。",
      highlights: [
        { time: "全天", title: "卓尔山 + 祁连山草原", note: "红岩绿地配雪峰，出片王。", fixed: true },
        { time: "傍晚", title: "阿柔大寺", note: "安静的藏传寺院。", fixed: false },
      ],
      food: [{ name: "牦牛酸奶", note: "酸厚" }, { name: "手抓羊肉", note: "原味" }],
      photo: [{ name: "卓尔山红岩", note: "侧光最艳" }, { name: "草原与雪峰", note: "远景" }],
      story: "佳佳摇下车窗说，这一路像在画里开车。",
    },
    {
      id: "baoji", name: "宝鸡", city: "陕西·宝鸡", region: "northwest", coord: [107.24, 34.36],
      tags: ["人文", "美食"], best: ["3", "4", "5", "9", "10"], baseDays: 1,
      intro: "出西安第一站，青铜器之乡，法门寺在此。",
      highlights: [
        { time: "上午", title: "法门寺", note: "佛指舍利，唐风地宫。", fixed: true },
        { time: "下午", title: "宝鸡青铜器博物院", note: "何尊——'中国'二字最早出处。", fixed: false },
      ],
      food: [{ name: "擀面皮", note: "酸辣" }, { name: "臊子面", note: "酸汤" }],
      photo: [{ name: "法门寺合十舍利塔", note: "" }, { name: "何尊", note: "" }],
      story: "佳佳在博物院看到'中国'二字最早的出处，愣了很久。",
    },
    {
      id: "tengger", name: "腾格里沙漠", city: "内蒙古·阿拉善", region: "northwest", coord: [105.5, 38.3],
      tags: ["自然", "出片"], best: ["5", "6", "7", "8", "9"], baseDays: 1,
      intro: "沙海里的星空，静得能听见风。",
      highlights: [
        { time: "傍晚", title: "沙漠日落 + 露营", note: "沙丘曲线最柔。", fixed: true },
        { time: "夜晚", title: "银河", note: "无光害，长曝出片。", fixed: false },
      ],
      food: [{ name: "骆驼肉", note: "尝鲜" }, { name: "羊杂汤", note: "暖身" }],
      photo: [{ name: "沙丘曲线", note: "逆光" }, { name: "沙漠银河", note: "长曝" }],
      story: "佳佳说，沙漠的安静是城市里没有的。",
    },
    {
      id: "wuwei", name: "武威", city: "甘肃·武威", region: "northwest", coord: [102.63, 37.93],
      tags: ["人文"], best: ["5", "6", "7", "8", "9", "10"], baseDays: 1,
      intro: "河西走廊门户，马踏飞燕的故乡。",
      highlights: [
        { time: "上午", title: "雷台汉墓", note: "马踏飞燕出土地。", fixed: true },
        { time: "下午", title: "鸠摩罗什寺", note: "译经大师驻锡地。", fixed: false },
      ],
      food: [{ name: "三套车", note: "行面+卤肉+茯茶" }, { name: "凉州羊羔肉", note: "" }],
      photo: [{ name: "铜奔马", note: "" }, { name: "古城", note: "" }],
      story: "佳佳说，武威把'凉州'两个字念出了历史的厚重。",
    },
    {
      id: "hami", name: "哈密大海道", city: "新疆·哈密", region: "northwest", coord: [93.5, 42.8],
      tags: ["自然", "出片"], best: ["4", "5", "6", "9", "10"], baseDays: 1,
      intro: "雅丹与戈壁，像开进了火星。",
      highlights: [
        { time: "傍晚", title: "大海道雅丹穿越", note: "越野，落日最魔幻。", fixed: true },
        { time: "夜晚", title: "戈壁露营", note: "极静，星河低垂。", fixed: false },
      ],
      food: [{ name: "哈密瓜", note: "甜" }, { name: "烤肉", note: "孜然" }],
      photo: [{ name: "雅丹群剪影", note: "" }, { name: "戈壁落日", note: "" }],
      story: "佳佳说，这里的空旷让人忘记时间。",
    },
    {
      id: "ulungur", name: "乌伦古湖", city: "新疆·阿勒泰", region: "northwest", coord: [87.5, 47.1],
      tags: ["自然", "出片", "美食"], best: ["6", "7", "8", "9"], baseDays: 1,
      intro: "戈壁尽头突然出现的那片蓝。",
      highlights: [
        { time: "上午", title: "乌伦古湖（福海）", note: "冷水鱼 + 湖景。", fixed: true },
        { time: "下午", title: "黄金海岸", note: "沙丘临湖。", fixed: false },
      ],
      food: [{ name: "五道黑鱼", note: "冷水鱼鲜" }, { name: "烤狗鱼", note: "" }],
      photo: [{ name: "湖蓝", note: "晴日" }, { name: "水上雅丹", note: "" }],
      story: "佳佳说，在沙漠跑了一天，突然见湖像见了救星。",
    },
    {
      id: "tianshan", name: "北疆天山", city: "新疆·天山", region: "northwest", coord: [86.5, 43.0],
      tags: ["自然", "出片"], best: ["6", "7", "8", "9"], baseDays: 1,
      intro: "雪线下的草原与松林。",
      highlights: [
        { time: "上午", title: "天山天池", note: "雪峰倒映。", fixed: true },
        { time: "下午", title: "江布拉克草原", note: "麦浪与雪岭。", fixed: false },
      ],
      food: [{ name: "大盘鸡", note: "皮带面" }, { name: "奶茶", note: "咸口" }],
      photo: [{ name: "天池雪峰", note: "" }, { name: "松林", note: "" }],
      story: "佳佳说，天山的绿是带凉意的绿。",
    },
    {
      id: "kanas", name: "喀纳斯", city: "新疆·阿勒泰", region: "northwest", coord: [87.0, 48.7],
      tags: ["自然", "出片"], best: ["9", "10"], baseDays: 3,
      intro: "三道湾晨雾，湖水会自己变颜色。",
      highlights: [
        { time: "清晨", title: "神仙湾 / 月亮湾晨雾", note: "6 点前到。", fixed: true },
        { time: "上午", title: "观鱼台", note: "俯瞰全湖。", fixed: false },
        { time: "第二天", title: "禾木村", note: "童话木屋 + 晨雾。", fixed: false },
      ],
      food: [{ name: "冷水鱼", note: "贵但鲜" }, { name: "手抓饭", note: "" }],
      photo: [{ name: "月亮湾秋色", note: "" }, { name: "禾木晨雾", note: "" }],
      story: "佳佳在喀纳斯住了三天，说这是'舍不得走的地方'。",
    },
    {
      id: "xiata", name: "夏塔", city: "新疆·伊犁", region: "northwest", coord: [80.8, 42.5],
      tags: ["自然", "出片"], best: ["6", "7", "8"], baseDays: 1,
      intro: "徒步进山谷，终点是冰川。",
      highlights: [
        { time: "全天", title: "夏塔古道徒步", note: "雪山 + 鲜花台。", fixed: true },
        { time: "傍晚", title: "温泉", note: "徒步后泡汤。", fixed: false },
      ],
      food: [{ name: "熏马肠", note: "哈萨克风味" }, { name: "奶茶", note: "" }],
      photo: [{ name: "夏塔冰川", note: "" }, { name: "野花台", note: "" }],
      story: "佳佳说，走到冰川前那一刻，腿酸也值了。",
    },
    {
      id: "kangding", name: "康定", city: "四川·甘孜·康定", region: "southwest", coord: [101.96, 30.05],
      tags: ["人文", "自然", "出片"], best: ["6", "7", "8", "9", "10"], baseDays: 1,
      intro: "跑马溜溜的城，翻过折多山就进了高原。",
      highlights: [
        { time: "上午", title: "折多山垭口", note: "进藏第一关，海拔 4298，经幡铺满坡。", fixed: true },
        { time: "下午", title: "跑马山", note: "《康定情歌》里那座山，俯瞰全城。", fixed: true },
        { time: "傍晚", title: "木格措", note: "高山湖，徒步栈道看杜鹃。", fixed: false },
      ],
      food: [{ name: "牦牛肉汤锅", note: "高原暖身" }, { name: "康定凉粉", note: "街边小食" }],
      photo: [{ name: "折多山经幡", note: "风里翻卷" }, { name: "木格措湖蓝", note: "雪山倒映" }],
      story: "佳佳在折多山垭口第一次懂了'眼睛在天堂，身体在炼狱'。",
    },
    {
      id: "xindugiao", name: "新都桥", city: "四川·甘孜·新都桥", region: "southwest", coord: [101.489, 30.068],
      tags: ["自然", "出片", "人文"], best: ["6", "7", "8", "9", "10"], baseDays: 1,
      intro: "318 上的摄影家天堂，光一铺下来，草甸就成了画。",
      highlights: [
        { time: "清晨", title: "十里长廊光影", note: "晨光斜照河谷，藏寨炊烟。", fixed: true },
        { time: "下午", title: "塔公草原 · 雅拉雪山", note: "远眺雪峰，经幡谷地。", fixed: false },
        { time: "傍晚", title: "居里寺", note: "安静的格鲁派寺院。", fixed: false },
      ],
      food: [{ name: "藏式酸奶", note: "稠得挂壁" }, { name: "牦牛火锅", note: "高原暖锅" }],
      photo: [{ name: "光影草甸", note: "摄影家常驻" }, { name: "雅拉雪峰", note: "远景" }],
      story: "佳佳说，这里的下午光，像有人专门打了一层。",
    },
    {
      id: "litang", name: "理塘", city: "四川·甘孜·理塘", region: "southwest", coord: [100.2736, 30.0396],
      tags: ["人文", "自然", "出片"], best: ["6", "7", "8", "9", "10"], baseDays: 1,
      intro: "G318 上的天空之城，海拔四千米的小城。",
      highlights: [
        { time: "上午", title: "千户藏寨", note: "依山坡层叠而建的藏族村落。", fixed: true },
        { time: "下午", title: "长青春科尔寺", note: "康区最大黄教寺院。", fixed: true },
        { time: "远眺", title: "格聂神山", note: "晴天雪峰清晰。", fixed: false },
      ],
      food: [{ name: "高原鳕鱼", note: "冷水鲜鱼" }, { name: "牦牛酸奶", note: "" }],
      photo: [{ name: "理塘晨雾", note: "" }, { name: "格聂雪峰", note: "远眺" }],
      story: "佳佳在海拔四千米的小城，走两步就喘，却笑得最开心。",
    },
  ];

  /* ----- 岛主 & 佳佳的真实足迹 -----
   * 两条规则：
   *  1) 若带 id 且匹配 destinations，则名称/城市/照片/坐标都复用目的地池；
   *  2) 新去过的地儿（不在目的地池里）直接在这里写 name/city/coord/img，
   *     照片命名为 images/<slug>.jpg（下载脚本会补齐），坐标用于地图打点。
   * when = 行程阶段标签；city = 更细的属地。
   */
  const footprints = [
    // —— 生活 & 早年同游 ——
    { id: "beijing", when: "曾生活", note: "在胡同和角楼边，把日子过成了习惯。" },
    { id: "ulanbutong", name: "内蒙古", city: "乌兰布统草原", when: "早年同游", note: "天蓝得不像话，第一次懂了'开阔'两个字。" },
    { name: "山海关", city: "河北·山海关", when: "早年同游", note: "天下第一关，老龙头把长城伸进了海里。", coord: [119.75, 40.0], img: "images/shanhaiguan.jpg" },
    { name: "秦皇岛", city: "河北·秦皇岛", when: "早年同游", note: "北戴河的海风，和夏天里的汽水。", coord: [119.6, 39.94], img: "images/qinhuangdao.jpg" },
    { id: "qingdao", when: "同游", note: "红瓦绿树，塑料袋啤酒的第一口笑。" },
    { name: "大连", city: "辽宁·大连", when: "同游", note: "有轨电车和滨海路的浪漫。", coord: [121.62, 38.92], img: "images/dalian.jpg" },
    { name: "烟台", city: "山东·烟台", when: "同游", note: "海边的城，慢得刚刚好。", coord: [121.39, 37.54], img: "images/yantai.jpg" },
    { name: "大同", city: "山西·大同", when: "同游", note: "云冈石窟的佛，比想象中离人更近。", coord: [113.3, 40.08], img: "images/datong.jpg" },
    { name: "恒山（北岳）", city: "山西·浑源", when: "同游", note: "爬上去的那座山，悬空寺贴在崖壁上。", coord: [113.7, 39.68], img: "images/hengshan.jpg" },
    { name: "天津", city: "天津", when: "同游", note: "五大道的小洋楼，和海河的夜。", coord: [117.2, 39.13], img: "images/tianjin.jpg" },

    // —— 回西安，开启西北自驾 ——
    { id: "xian", name: "西安", city: "陕西·西安", when: "后来回西安", note: "十三朝古都，回来就像回了家。" },
    { name: "宝鸡", city: "陕西·宝鸡", when: "西北自驾", note: "出西安第一站，青铜器之乡。", coord: [107.24, 34.36], img: "images/baoji.jpg" },
    { id: "yinchuan", name: "银川 · 宁夏", city: "宁夏·银川", when: "西北自驾", note: "西夏王陵像盖在大地上的印章。" },
    { name: "腾格里沙漠", city: "内蒙古·阿拉善", when: "西北自驾", note: "沙海里的星空，静得能听见风。", coord: [105.5, 38.3], img: "images/tengger.jpg" },
    { name: "武威", city: "甘肃·武威", when: "西北自驾", note: "河西走廊的门户，马踏飞燕的故乡。", coord: [102.63, 37.93], img: "images/wuwei.jpg" },
    { name: "祁连山脉", city: "青海·祁连", when: "西北自驾", note: "雪山、草原、油菜花，一路都在窗外。", coord: [100.25, 38.18], img: "images/qilian.jpg" },
    { id: "qinghai", name: "青海湖", city: "青海·海北", when: "西北自驾", note: "七月油菜花，配蓝得发亮的湖。" },

    // —— 进新疆，北疆大环线 ——
    { name: "哈密大海道", city: "新疆·哈密", when: "西北自驾", note: "雅丹与戈壁，像开进了火星。", coord: [93.5, 42.8], img: "images/hami.jpg" },
    { name: "乌伦古湖", city: "新疆·阿勒泰", when: "西北自驾", note: "戈壁尽头突然出现的那片蓝。", coord: [87.5, 47.1], img: "images/ulungur.jpg" },
    { name: "北疆天山", city: "新疆·天山", when: "西北自驾", note: "雪线下的草原与松林。", coord: [86.5, 43.0], img: "images/tianshan.jpg" },
    { name: "喀纳斯", city: "新疆·阿勒泰", when: "西北自驾", note: "三道湾的晨雾，湖水会自己变颜色。", coord: [87.0, 48.7], img: "images/kanas.jpg" },
    { name: "夏塔", city: "新疆·伊犁", when: "西北自驾", note: "徒步进山谷，终点是冰川。", coord: [80.8, 42.5], img: "images/xiata.jpg" },

    // —— 成都 · 川西行 ——
    { id: "chengdu", name: "成都", city: "四川·成都", when: "川西行", note: "火锅和熊猫，出发前先把胃安顿好。", img: "images/chengdu.jpg" },
    { name: "理塘", city: "四川·甘孜·理塘", when: "川西行", note: "G318 上的天空之城，海拔四千米的小城。", coord: [100.2736, 30.0396], img: "images/litang.jpg" },
    { name: "新都桥 · 318", city: "四川·甘孜·新都桥", when: "川西行", note: "318 国道上的摄影家天堂，光影铺在草甸上。", coord: [101.489, 30.068], img: "images/xindugiao.jpg" },
  ];

  /* ----- 中国轮廓（简化手绘版，[经度, 纬度] 顺时针） -----
   * 用于旅行地图底图，风格化、非测绘精度，重在神似。
   */
  const chinaBoundary = [
    [134.3, 48.4], [130.7, 48.9], [127.5, 50.3], [125.2, 53.5], [121.5, 53.3],
    [119.9, 50.4], [115.5, 49.0], [111.5, 43.7], [105.0, 42.0], [97.2, 42.8],
    [90.9, 43.0], [82.5, 45.0], [80.0, 42.5], [75.0, 40.5], [73.5, 39.4],
    [74.5, 37.0], [78.5, 35.0], [81.0, 31.0], [84.5, 28.5], [88.0, 27.8],
    [92.0, 28.0], [95.5, 27.8], [97.5, 28.5], [98.7, 25.8], [99.0, 22.5],
    [101.8, 21.2], [103.5, 22.5], [106.7, 22.0], [108.0, 21.5], [110.0, 21.0],
    [113.5, 22.2], [117.0, 23.5], [120.5, 27.0], [122.0, 30.5], [121.8, 31.4],
    [120.5, 34.0], [119.5, 37.5], [122.5, 40.5], [121.0, 41.0], [123.5, 40.0],
    [124.5, 42.5], [125.5, 44.0], [130.5, 44.5], [134.3, 48.4],
  ];

  const hainan = { center: [109.8, 19.2], rx: 1.6, ry: 1.5 };   // 海南（点缀）
  const taiwan = { center: [121.0, 23.7], rx: 0.9, ry: 1.6 };    // 台湾（中国不可分割的一部分）

  /* ----- 路线灵感模板（一键预填 + 可选固定序列） -----
   * form  : 预填定制面板的字段
   * fixed : 若存在，则按此顺序生成"不走样的固定路线"（青甘大环线等经典线）；
   *         为 null 时仍走常规评分引擎。
   */
  const presets = [
    {
      key: "qinggan",
      label: "青甘大环线 · 8天",
      desc: "西宁出发，青海湖—茶卡—大柴旦—敦煌—嘉峪关—张掖—祁连，经典西北大环。",
      form: { origin: "xining", days: 8, month: "7", budget: "mid", pace: "slow",
               tags: ["自然", "人文", "出片", "美食"], constraints: ["nohike"], transport: "drive" },
      fixed: ["qinghai", "chaka", "dachaidan", "dunhuang", "jiayuguan", "zhangye", "qilian"],
      cover: "qinghai",
    },
    {
      key: "xjloop",
      label: "岛主同款 · 西北进疆 15天",
      desc: "西安出发，宝鸡—银川—腾格里—武威—祁连—青海—哈密—乌伦古湖—天山—喀纳斯—夏塔，我们走过的同款环线。",
      form: { origin: "xian", days: 15, month: "7", budget: "mid", pace: "slow",
               tags: ["自然", "人文", "出片"], constraints: ["nohike"], transport: "drive" },
      fixed: ["baoji", "yinchuan", "tengger", "wuwei", "qilian", "qinghai", "hami", "ulungur", "tianshan", "kanas", "xiata"],
      cover: "kanas",
    },
    {
      key: "island",
      label: "江南慢游 · 6天",
      desc: "杭州—苏州—上海，吃茶看园子，慢慢晃。",
      form: { origin: "shanghai", days: 6, month: "4", budget: "mid", pace: "slow",
               tags: ["人文", "美食", "出片"], constraints: [], transport: "rail" },
      fixed: null,
    },
    {
      key: "chuanxi",
      label: "川西 · G318 线 · 6天",
      desc: "成都出发，康定—新都桥—理塘—稻城亚丁，沿 318 翻折多山，一路雪山、草甸与藏寨。",
      form: { origin: "chengdu", days: 6, month: "9", budget: "mid", pace: "slow",
               tags: ["自然", "人文", "出片"], constraints: [], transport: "drive" },
      fixed: ["kangding", "xindugiao", "litang", "daocheng"],
      cover: "xindugiao",
    },
  ];

  return {
    meta: { siteName: "岛主和佳佳的旅行手账", built: "2026" },
    REGIONS,
    destinations,
    footprints,
    chinaBoundary,
    hainan,
    taiwan,
    presets,
  };
})();
