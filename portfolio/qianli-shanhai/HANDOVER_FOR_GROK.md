# 《千里江山 · 借笔还魂》项目全景技术交接与深度重构指南 (Handover for Grok Bot)

> **致接手工程师 / Grok Bot：**  
> 本项目目标是达到国际顶级数字艺术大奖（**Awwwards Site of the Day / FWA of the Day / Webby Awards**）品质的北宋院体青绿重彩 WebGL 交互体验。  
> **核心对标基准**：[《穿越清明上河图》(qingming-riverside)](https://xianxie6.github.io/qingming-riverside/)  
> **线上正式环境**：[https://qianli.daozhuai.cn](https://qianli.daozhuai.cn) （备用镜像：[https://shanhai.daozhuai.cn](https://shanhai.daozhuai.cn)）  
> **当前状态客观评估**：基础框架与四大阶段（展卷、穿越、漫步、唤醒）已打通，底色黑屏等致命 Bug 已修复；但**在真实视觉品质、交互沉浸感、移动端操控和物体细节上，距离 SOTD 殿堂级水准仍有显著差距**（用户直言“还有很多没做好”）。  
> 请仔细阅读本指南，直接切入核心缺陷进行深度升级！

---

## 1. 核心世界观与设计目标 (Core Vision & Story)

* **核心叙事隐喻**：【北宋政和三年 · 十八岁少年王希孟的一场借笔还魂】
* **文学设定**：王希孟并未早夭，而是将《山海经》六方神兽、山魂水魄，借石青石绿矿物重彩封印在十二米长卷中。
* **用户角色**：九百年后的“入画知音”与“借笔还魂者”，从展卷、穿越粒子风暴、与希孟相逢，再入画漫步，最终提笔唤醒六方神兽。
* **品质对标**：**拒绝粗糙的“程序员 3D”与塑料玩具感**，追求北宋院体画的物质性（Materiality）——双丝古绢的呼吸纹理、矿物晶体（石青/石绿/泥金）的折光微芒、宋代马远《水图》网巾水纹与空濛留白。

---

## 2. 工程环境与部署流程 (Environments & Commands)

* **主工作区目录**：  
  `/Users/gx/.gemini/antigravity/scratch/qianli-shanhai`
* **主站单体仓同构目录**（修改后需使用 rsync 同步）：  
  `/Users/gx/.gemini/antigravity/scratch/daozhu-island/portfolio/qianli-shanhai`
* **Cloudflare 配置文件**：  
  `wrangler.jsonc` (绑定域名 `qianli.daozhuai.cn` 与 `shanhai.daozhuai.cn`)
* **一键安全部署命令**（⚠️ 必须清除系统代理环境变量，否则 Cloudflare 会报 SSL 握手超时）：
  ```bash
  cd /Users/gx/.gemini/antigravity/scratch/qianli-shanhai
  env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy npx wrangler deploy
  ```

---

## 3. 当前系统各模块成熟度评估 (Maturity & Deficiency Audit)

| 体验阶段 / 模块 | 当前实现状态 | 现有优点 | ⚠️ 核心痛点与缺陷（Grok 重点攻坚） |
| :--- | :--- | :--- | :--- |
| **阶段 1：长卷展卷** (`src/atlas.js`) | 85% 良好 | 12米千亿像素真迹平移、6大胜景图钉、底部药丸导航平滑定位 | 1. 胜景卡片视觉仍偏普通网页弹窗，缺少宋锦画轴装裱感；<br>2. 拖拽滚动阻尼与惯性稍显生硬。 |
| **阶段 2：粒子穿越** (`src/crossing.js`, `src/crossing-curl-physics.js`) | 80% 良好 | 16,000 粒子无散度 Curl Noise 流体、破卷冲击波、王希孟 3D 笔墨人偶 | 1. 对话系统为普通文本按钮，缺少书法墨迹逐字书写动效；<br>2. 粒子爆发后的归位动画缺少音画级联顿挫感。 |
| **阶段 3：3D 画境漫步** (`src/world3d.js`, `src/water-ssr-shader.js`) | 65% **需重点重构** | 真迹分层立体弧幕、SSR 水体波纹、四时昼夜切换、仙鹤巡天 | **1. 场景物体塑料感重**：茅舍、小桥、草木采用低模几何体拼接，缺乏工笔古画质感；<br>**2. 无接触阴影 (Contact Shadow)**：物体漂浮在地面上，无接地厚重感；<br>**3. 弧幕与 3D 地形交界生硬**：画幕底部缺少体积云海与渐变过渡，产生“贴图立牌”感；<br>**4. 移动端无法行走**：缺少虚拟触控摇杆，手机端无法漫步。 |
| **阶段 4：借笔点睛唤醒** (`src/awakening-director.js`, `src/ui.js`) | 60% **需升级交互** | 电影级黑边、螺旋运镜、85m 水墨冲击环、朱砂印砸落动画 | **缺少“借笔点睛”的核心交互**：靠近神兽只是按 E 键看动画，缺乏用鼠标/手指“一笔点睛/连线画符”的主动参与感（对标清明上河图拉绳）。 |
| **后处理渲染管线** (`src/inkPostProcess.js`) | 75% 良好 | 拉普拉斯工笔铁线描、双丝古绢经纬织纹、矿物分染 | 边缘检测对平展地面的过渡仍偶有噪点，夜间墨色调色可以更深邃通透。 |
| **声景系统** (`src/audio.js`) | 70% 可用 | 纯 Web Audio 合成古琴五音正调、泛音和弦、80Hz 砸印低频声 | 缺少近场 3D 空间音效（如靠近瀑布水声变大、风吹松涛声、近水鸥鹭微鸣）。 |

---

## 4. 重点攻坚缺陷与重构方案 (Actionable Punch List for Grok)

### 任务 1：彻底消灭“塑料低模与纸片立牌感”，重塑北宋院体画质感
* **缺陷现象**：当前 3D 场景中的茅舍（Cube + Cone）、古桥、石矶、树木带有明显的初级 Three.js 几何体感；背景的 5 层故宫真迹弧幕底部与 3D 地形拼接处缺乏自然过渡，一眼看出是“立牌”。
* **解决方案**：
  1. **地面接触阴影与环境光遮蔽 (Contact Shadows / Fake AO)**：为茅舍、桥墩、石矶、神兽底部生成贴地的柔和暗墨阴影贴图（Soft Ground Decal/Shadow），解决物体悬浮问题。
  2. **画幕底部注入三远水墨雾带 (Volumetric Ink Mist)**：在真迹画幕底部高度区间（y ∈ [0, 5]）挂载基于平移噪声的高度水墨雾层，使 3D 山石与 2D 真迹画幕如从云雾中生长出来般浑然一体。
  3. **丰富宋式工笔景物**：优化茅舍草顶材质（加入草茎线条纹理）、千步长桥红木望柱古石肌理，并在江岸补充随风摆动的写意芦苇与汀洲苇草。

### 任务 2：开发移动端双摇杆与触控漫步系统 (Mobile Touch System)
* **缺陷现象**：目前在手机端仅能触摸旋转视角，**没有任何行走前进后退的控件**，导致手机用户完全无法探索场景。
* **解决方案**：
  1. 在 `src/ui.js` 与 `src/style.css` 中增加**宋代罗盘造型的虚拟半透明摇杆（Virtual Joystick）**（仅在 touch 设备或屏幕宽度 < 768px 时显示）。
  2. 监听 TouchStart/TouchMove/TouchEnd，输出归一化方向向量 `vec2(x, y)`，无缝驱动 `world3D.keys['KeyW/S/A/D']`。
  3. 支持双指捏合缩放视野（FOV 缩放）。

### 任务 3：升级“借笔点睛 · 四幕互动”（从“按E看动画”到“提笔画符唤醒”）
* **对标参考**：《穿越清明上河图》在虹桥过船时需要玩家“接绳向左拖拽拉缆绳”。
* **重构方案**（在 `src/awakening-director.js` 中集成）：
  1. **第一幕（凝神，0.0s~0.7s）**：上下展开电影黑边，镜头螺旋俯冲至神兽正前方仰角特写。
  2. **第二幕（借笔点睛交互，0.7s~2.0s）**：
     * 画面时间缩放变慢，神兽额顶与周身浮现 **3 枚金色星枢（宣和泥金星点）**。
     * 屏幕提示：**“借希孟之笔，一笔连星还魂”**。
     * 玩家使用鼠标或手指划过连接 3 颗星点，划过轨迹拉出金色毛笔墨线粒子，并按顺序触发古琴“宫、商、角”轮指泛音。
  3. **第三幕（破封 · 天地异象，2.0s~3.2s）**：
     * 连线成功瞬间，爆发 85m 水墨冲击环，触发该神兽专属的天地异象（如夫诸触发时雨双彩虹、鹿蜀漫天绯红桃花飞舞、驳兽引动天际金碧雷光）。
  4. **第四幕（落款成札，3.2s~）**：
     * 优雅弹出《山海经》绢本画札，【希孟亲历】朱砂印带重力砸落并震荡屏幕。

### 任务 4：昼夜切换平滑渐变与万家渔火
* **缺陷现象**：当前 `setNight(true/false)` 是瞬间切换色值，显得非常生硬。
* **解决方案**：
  * 在 `src/world3d.js` 中引入 1.8 秒的平滑补间动画，背景色、雾气色、光照强度与色温逐渐由晨曦暖绢过渡到深邃石青墨色。
  * 沿江茅舍与桥头的红灯笼依次、随机延迟点亮，展现“日暮炊烟起，江村万火明”的诗性画卷。

### 任务 5：3D 空间音效与环境声景层叠
* **现状**：目前只有背景古琴泛音与固定脚步声。
* **解决方案**：
  * 在 `src/audio.js` 中引入 Web Audio `PannerNode` 或根据玩家到胜景的距离动态调节声轨音量：
    - 靠近【桃溪浅滩】：微风拂草声、溪水潺潺声逐渐增大；
    - 靠近【悬瀑幽涧】：百丈飞瀑轰鸣水雾声居于主导；
    - 靠近【麦陇晚烟】：阵阵稻浪沙沙声与秋蝉微鸣；
    - 靠近【孤刹悬云】：高山风声与古刹铜铃隐隐作响。

---

## 5. 绝对不可触碰的技术禁区 (Strict Traps & Caveats)

Grok 在编写代码时，**必须严格遵守以下 5 条前人踩坑总结出的血泪禁区**：

1. **绝对不要在 CSS 中对 `#viewport-3d` 设置 `display: none`**：  
   `#viewport-3d` 一旦 `display: none`，Three.js 容器宽高立刻沦为 `0x0`，导致 `camera.aspect = 0/0 = NaN`，投影矩阵崩溃，页面永久卡死在纯黄褐色清屏色（`#7A6946`）。必须保持 `pointer-events: none` 布局存活。
2. **GLSL 着色器严禁反向 `smoothstep(edge0, edge1, x)`（$edge0 > edge1$）**：  
   GLSL 规范规定 $edge0 \ge edge1$ 是未定义行为，在 macOS (Metal) 及各类移动 GPU 上会产生 `NaN` 导致片元全黑被丢弃。反向渐变必须写成 `1.0 - smoothstep(minVal, maxVal, x)`。
3. **16,000 枚矿物粒子必须保持 `THREE.NormalBlending`**：  
   切勿为追求发光感改用 `AdditiveBlending`！大量粒子在重聚时叠加会发生极度刺眼的白爆，破坏宋画矿物重彩沉稳温润的古典质感。
4. **传送摄影机必须即时同步并由 `_calculateTerrainHeight` 校验地表**：  
   调用 `teleportToBeast` 时必须先计算地面高程，防止玩家落入地表以下；且必须在第 0 帧直接设置 `camera.position` 与 `camera.lookAt`，否则会发生从原点 `(0,0,0)` 穿模飞跃的恶性视觉抖动。
5. **部署时必须清除代理环境变量**：  
   运行 `npx wrangler deploy` 时，必须使用 `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY ...` 清除代理，否则 Cloudflare CLI 会因代理握手失败而退出。

---

## 6. Grok Bot 的第一步行动指引 (First Steps for Grok)

建议 Grok 按以下顺序推进：
1. **优先落地【任务 2：移动端虚拟触控摇杆】**：在 `src/ui.js` 与 `src/style.css` 中增加触控摇杆，彻底解决手机端无法漫步的严重可用性缺陷。
2. **着手攻克【任务 1：消除塑料感】**：为茅舍、桥梁、神兽增加接地暗部投影（Ground Shadow Decal），并在 `src/world3d.js` 画幕底部注入水墨云雾带，消除贴图割裂感。
3. **升级【任务 3：借笔点睛星点连线】**：在 `src/awakening-director.js` 加入 3 星点触控连线画符交互，拉升 Awwwards 级高潮兑现。
4. **运行同步与部署命令**，推送到 `https://qianli.daozhuai.cn` 验证效果。
