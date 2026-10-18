/** 六兽谱。M1 只有夫诸可玩，其余画札页先作谜面。卷首在右，x = 1。 */

export const FUZHU_ID = 'fuzhu';

export const BEASTS = [
  {
    id: 'lushu',
    name: '鹿蜀',
    place: '桃溪浅滩',
    x: 0.812,
    y: 0.40,
    span: [0.792, 0.832],
    quote: '其音如谣',
    classic: '有兽焉，其状如马而白首，其文如虎而赤尾，其音如谣，其名曰鹿蜀。',
    source: '《南山经》',
    playable: false,
  },
  {
    id: 'bo',
    name: '驳',
    place: '千步长桥',
    x: 0.722,
    y: 0.46,
    span: [0.700, 0.745],
    quote: '音如鼓音',
    classic: '有兽焉，其状如马而白身黑尾，一角，虎牙爪，音如鼓音，其名曰驳。',
    source: '《西山经》',
    playable: false,
  },
  {
    id: 'fuzhu',
    name: '夫诸',
    place: '悬瀑幽涧',
    x: 0.679,
    y: 0.60,
    span: [0.663, 0.695],
    quote: '见则其邑大水',
    classic: '敖岸之山，有兽焉，其状如白鹿而四角，名曰夫诸，见则其邑大水。',
    source: '《中山经》',
    title: '悬瀑引泉',
    playable: true,
  },
  {
    id: 'dangkang',
    name: '当康',
    place: '麦陇晚烟',
    x: 0.469,
    y: 0.38,
    span: [0.452, 0.486],
    quote: '其鸣自叫',
    classic: '有兽焉，其状如豚而有牙，其名曰当康，其鸣自叫，见则天下大穰。',
    source: '《东山经》',
    playable: false,
  },
  {
    id: 'qingniao',
    name: '青鸟',
    place: '孤峰古刹',
    x: 0.395,
    y: 0.72,
    span: [0.375, 0.415],
    quote: '赤首黑目',
    classic: '有三青鸟，赤首黑目，一名曰大鵹，一名少鵹，一名曰青鸟。',
    source: '《大荒西经》',
    playable: false,
  },
  {
    id: 'wenyao',
    name: '文鳐鱼',
    place: '江心孤帆',
    x: 0.262,
    y: 0.34,
    span: [0.235, 0.290],
    quote: '以夜飞',
    classic: '是多文鳐鱼，状如鲤鱼，鱼身而鸟翼，苍文而白首赤喙，以夜飞。',
    source: '《西山经》',
    playable: false,
  },
];

export const BAIZE = {
  id: 'baize',
  name: '白泽',
  place: '终章',
  quote: '六页齐，方可点睛',
  locked: true,
};

export function beastById(id) {
  return BEASTS.find((b) => b.id === id) || null;
}
