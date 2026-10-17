# 《千里江山 · 借笔还魂》项目交接与优化指南 (Handover for Codex)

> **致接手工程师 Codex：**  
> 本项目旨在以国际顶级 WebGL 沉浸式互动品质（Awwwards / FWA / Webby Awards 水准），打造北宋王希孟《千里江山图》的跨媒介数字艺术交互体验。  
> **核心对标基准**：[https://xianxie6.github.io/qingming-riverside/](https://xianxie6.github.io/qingming-riverside/)（穿越清明上河图）  
> 请仔细阅读本交接文档，快速理解世界观设定、架构设计、各模块职责以及后续优化任务清单。

---

## 1. 世界观与核心叙事设定 (Story & Lore)

> **【设定：十八岁少年的一场借笔还魂】**  
> 北宋政和三年，十八岁的王希孟绘就近十二米长卷《千里江山图》，随即悄然消逝于历史尘埃中。  
> 传说他并非早夭，而是参透了天地大化——他将《山海经》里那些古老的神仙异兽、山魂水魄，尽数借着石青石绿的矿物重彩，封印在了这幅绵延千里的绢帛之间。  
> 随着岁月流转，画中灵气渐沉，山兽沉眠，江山静止。  
> 玩家并非猎人，而是**“入画游人”**或**“提笔知音”**：漫步于峰峦绝壁、长桥水榭与渔舟松涛之间，去唤醒那些沉睡的山海神兽，让这幅古卷重现天地灵动。

---

## 2. 线上环境与仓库路径 (Deployment & Workspaces)

* **正式生产域名（已全量上线 CDN）**：  
  * 主域名：[https://qianli.daozhuai.cn](https://qianli.daozhuai.cn)  
  * 备用镜像：[https://shanhai.daozhuai.cn](https://shanhai.daozhuai.cn)
* **本地开发目录**：  
  `/Users/gx/.gemini/antigravity/scratch/qianli-shanhai`
* **主站单体仓同构目录**：  
  `/Users/gx/.gemini/antigravity/scratch/daozhu-island/portfolio/qianli-shanhai`
* **Cloudflare 配置文件**：  
  `/Users/gx/.gemini/antigravity/scratch/qianli-shanhai/wrangler.jsonc`
* **快速部署命令**：  
  ```bash
  cd /Users/gx/.gemini/antigravity/scratch/qianli-shanhai
  npx wrangler deploy
  ```

---

## 3. 核心架构与四大体验阶段 (Four Experience Stages)

整个项目严格按照《穿越清明上河图》的用户旅程闭环重构，分为四大无缝切换模式：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        《千里江山 · 借笔还魂》全流程体验闭环             │
└────────────────────────────────────────────────────────────────────────┘
       │
       ▼
【阶段 1 · 长卷展卷】 故宫近 12 米高清真迹全景横卷 + 6 大胜景热点 + 胜景浮窗
       │ (用户点击【提笔穿越 ↗】或双击具体胜景点位)
       ▼
【阶段 2 · 穿越仪式】 16,000 枚矿物粒子拔地汇聚 +【打散·重聚】物理爆破
                     + 舒啸石台相逢 18 岁【王希孟】+【问问江山】多轮互动对语
       │ (用户点击【随他入画 ↗】)
       ▼
【阶段 3 · 画境漫步】 故宫真迹分层立体弧幕 3D 青绿山河 + 四时更迭 (春·夏·秋·冬)
                     +【时雨】气象 +【夜景】渔火 + 随时按【Esc / M / 全景】返回长卷
       │ (漫步至神兽身侧按下【E 键】)
       ▼
【阶段 4 · 借笔还魂】 山海天地共鸣 + 弹出《山海经》古卷题记画札 + 动态加盖【希孟亲历】朱砂印
```

### 路由与深度链接支持 (Deep Linking)
* `https://qianli.daozhuai.cn/`：默认进入【阶段 1：长卷展卷】模式。
* `https://qianli.daozhuai.cn/?mode=crossing` 或 `#crossing`：直通【阶段 2：穿越仪式】。
* `https://qianli.daozhuai.cn/?mode=roam` 或 `#roam`：直通【阶段 3：画境漫步】。

---

## 4. 关键文件清单与职责说明 (File Manifest)

### 4.1 核心控制器与路由
* **`index.html`**：  
  单页容器结构，内置 `#atlas`（展卷视窗）、`#canvas-container`（3D 漫步画布）、HUD 导航顶栏（全景印章、四时胶囊栏、时雨夜景）、司南罗盘、神兽画札 Dialog（`#beastSketch`）与全璧御览藏书票 Dialog（`#certDialog`）。
* **`src/main.js`**：  
  顶层调度器。协调 `AtlasManager`、`CrossingCeremony`、`World3D` 和 `UIManager` 的生命周期，负责各模式间的无缝显隐平滑过渡。

### 4.2 长卷展卷模块
* **`src/atlas.js` (`AtlasManager`)**：  
  * 管理横向平移画轴，加载故宫近 12 米无缝原卷图像（`assets/painting/qianli_panorama_hi.jpg`）。
  * 标记 6 大胜景地标：
    1. `01 桃溪浅滩 · 鹿蜀` (14.7%)
    2. `02 飞瀑幽涧 · 夫诸` (31.2%)
    3. `03 麦陇晚烟 · 当康` (47.8%)
    4. `04 关隘长桥 · 驳` (63.5%)
    5. `05 孤刹悬云 · 青鸟` (79.1%)
    6. `06 水心高阁 · 白泽` (92.4%)
  * 负责胜景浮窗卡片弹出、平滑定位滚动与底部 6 颗导航胶囊药丸交互。

### 4.3 穿越仪式模块
* **`src/crossing.js` (`CrossingCeremony`)**：  
  * 对标清明上河图中的【穿越】仪式。
  * 独立 Three.js 粒子引擎：16,000 枚软边缘矿物粒子（石青、石绿、泥金、岩赭）。
  * 粒子弹簧物理系统：支持时间轨推进、相机轨道运镜、`burstAndReassemble()` 打散重聚爆炸。
  * 舒啸石台三维王希孟人物网格：身着青绿儒袍，手持金色发光神毫（借笔）。
  * 王希孟对话状态机与【问问江山】多轮互动交互逻辑。

### 4.4 3D 画境漫步模块
* **`src/world3d.js` (`World3D`)**：  
  * **真迹立体化方案**：采用卷一至卷五分层半弧形曲面画幕（Curved Scroll Mesh），利用自定义着色器实现王希孟真迹的微风摆动与古绢呼吸感，彻底摒弃了塑料模型感。
  * **北宋地貌高程函数**：`_calculateTerrainHeight(x, z)` 精确刻画舒啸矶头、南侧沙洲、千步长桥引桥与飞瀑幽谷。
  * **四时系统**：`setSeason('spring' | 'summer' | 'autumn' | 'winter')`，动态更新光照色温、雾气颜色与 550 枚季节性飞絮漂浮粒子（桃花瓣/叠翠光斑/红枫/冬雪）。
  * **气象与昼夜**：
    * `setWeather('rain' | 'clear')`：1200 根水墨细雨竖线与谷雾加浓。
    * `setNight(boolean)`：幽夜石青墨色天空，点亮水村茅舍暖黄灯笼，神兽天际信标光柱辉度翻倍。
  * **按键控制**：WASD / 方向键漫步，Shift 疾行，Space 跳跃，鼠标拖拽观察，`E` 唤醒神兽，`Esc` 或 `KeyM` 触发 `onExitToScroll()` 返回长卷。

### 4.5 故事与界面呈现
* **`src/beasts.js`**：  
  定义 6 方神兽的原典数据、经文引文、王希孟 18 岁亲历画札文字、坐标位置与唤醒后的天地异象参数。
* **`src/ui.js` (`UIManager`)**：  
  * 绑定顶部中岛栏（`#atlasReturn`、四时切换按钮、时雨、夜景、古琴声音控制）。
  * 渲染神兽画札弹窗（`#beastSketch`）：宣和绢本排版、经文展示、王希孟画札、加盖朱砂神印【希孟亲历】。
  * 唤醒进度计数器（`已唤醒神兽 0 / 6`）与全璧藏书票下载。
* **`src/audio.js`**：  
  纯 Web Audio API 合成北宋声景，无需依赖重型外部音频，开箱即用：古琴五音泛音（宫商角徵羽）、空谷流泉雨声、踏草脚步声。
* **`src/style.css`**：  
  宋代古典美学样式表。采用宋刻本书法字体、宣和暖黄古绢底色（`#7A6946`）、赤金描边与朱砂印章样式，全自适应支持桌面与移动端。

---

## 5. 建议 Codex 优先推进的优化清单 (Optimization Roadmap)

为协助 Codex 继续将本项目打磨至国际设计大奖（Awwwards Site of the Day / FWA）水准，建议按以下优先级开展优化：

### 优先级 1：视觉质感与着色器深化 (Visual Polish)
1. **水体着色器升级 (Screen-Space Water Reflection)**：
   * 当前江水着色器具备基础波光扰动与青绿流速，可考虑加入简单的平面镜像反射（Planar Reflection）或屏幕空间近岸倒影，让远山与茅舍倒映在江水之中。
2. **后处理管线精细化 (Stylized Ink Post-Processing)**：
   * 在 `src/postprocessing.js` 中进一步调优工笔边缘检测（Sobel Edge）与绢本噪点（Paper Grain Texture），让 3D 渲染画面与背景的真迹画幕更加浑然一体。
3. **昼夜平滑过渡动画**：
   * 目前 `setNight` 是通过阶跃式设置颜色，可加入 1.5 秒的 GSAP 或 lerp 插值补间，呈现北宋千里江山“晚霞落尽，千家渔火渐次亮起”的平滑渐变动效。

### 优先级 2：叙事与音画共鸣 (Narrative & Audio)
1. **王希孟对话打字机特效与动态立绘表情**：
   * 在穿越仪式相逢阶段，加入逐字呈现的书法打字机动效，并伴随细微的蘸墨书写音效，强化与 18 岁少年灵魂交流的代入感。
2. **神兽唤醒的高潮演出 (Cinematic Beast Awakening)**：
   * 靠近按下 `E` 键唤醒时，建议短暂接管相机（2~3 秒特写镜头运镜），让神兽展现舒展动作（如鹿蜀扬蹄和鸣、青鸟振翅掠过天际），随后天地大放光明。
3. **更沉浸的环境声景层叠**：
   * 为每个区域配置专属的空间音效（如靠近飞瀑幽涧时瀑布水声增大；靠近麦陇时蝉鸣与风吹稻浪声）。

### 优先级 3：性能与设备兼容性 (Performance & Mobile)
1. **移动端触控摇杆与性能降级**：
   * 目前已支持单指滑屏观察视角，建议在手机端左下角渲染一个半透明虚拟摇杆（Virtual Joystick），提升移动端漫步操作手感。
   * 针对低配移动设备，动态调节粒子数（如从 16,000 降至 6,000）与画幕着色器分辨率，确保持续稳定 60 FPS。
2. **真迹切片渐进式加载 (Progressive Loading)**：
   * 8000px 的真迹全景图目前为 541KB，已相当轻量。后续若扩充更高清的局部原画，可采用切片分块（Tile Loading）以保证弱网环境下的秒开体验。

---

## 6. 避坑指南与开发注意事项 (Traps & Caveats)

1. **ES 模块 DOM 就绪陷阱**：  
   在 `<script type="module">` 中，脚本天然延迟执行。务必使用：
   ```javascript
   if (document.readyState === 'loading') {
     document.addEventListener('DOMContentLoaded', init);
   } else {
     init();
   }
   ```
2. **长卷全景图钉的绝对定位基准**：  
   `#atlasMarkers` 的百分比定位依赖 `#atlasContent`（必须保持 `position: relative; display: inline-flex; width: max-content;`），切勿将其直接挂载到 `overflow: auto` 的外层 `#atlas` 视窗，否则标记会跟随屏幕窗口居中而非固定在画卷真实山脉位置。
3. **Three.js 粒子混合模式陷阱**：  
   千峰重彩粒子数量高达 16,000 枚，请保持使用 `THREE.NormalBlending` 配合 `vertexColors` 与天然矿物调色盘；**切勿使用大尺寸的 `AdditiveBlending`**，否则大量粒子重叠会造成画面曝光过度（白爆）。
4. **Cloudflare 部署约束**：  
   部署请进入 `/Users/gx/.gemini/antigravity/scratch/qianli-shanhai` 运行 `npx wrangler deploy`。主站仓 `/daozhu-island` 根目录下存在超过 25MB 的其他历史大文件，直接在根目录部署会触发 Cloudflare 25MB 单文件上限拦截。

---

*文档编写时间：2026年10月14日*  
*交接状态：代码已通过完整真机与线上测试，正式环境运行平稳。*
