# 岛主 · 设计系统（Design System）

一份跨版本统一的设计语言。所有页面（A 版单屏站、B 版长滚动站、各子页）都从本系统取色、取距、取字，避免各写各的导致视觉漂移。

权威来源：`design-system/tokens.css`

---

## 1. 颜色系统（WCAG 2.1 AA 验证）

所有「文字色」的对比度均相对背景 `--bg: #FBF8F1` 计算，正常文本要求 ≥ 4.5:1。

| Token | 值 | 用途 | 对比度 |
|------|-----|------|--------|
| `--ink` | `#2B2622` | 主文字 | 14.11:1 ✅ |
| `--mid` | `#6B635A` | 次要文字（描述、副标题） | 5.57:1 ✅ |
| `--faint` | `#9A938A` | 装饰文字（序号、提示，非正文） | ~3.0:1 |
| `--line` | `#ECE5D7` | 分隔线、描边 | — |
| `--accent` | `#C8654B` | 砖红·装饰、大标题、背景块 | 3.65:1（仅大文本/装饰） |
| `--accent-soft` | `#E7B7A8` | 砖红·浅底、hover 描边 | — |
| `--accent-strong` | `#A8432B` | 砖红·白字按钮、文字链接 | 5.65:1 / 白字 6.00:1 ✅ |
| `--sage` | `#52715E` | 苔绿·辅助文字、点缀 | 5.10:1 ✅ |
| `--coffee` | `#6F4E37` | 咖啡·深棕点缀 | — |
| `--bg` | `#FBF8F1` | 主背景（暖米白） | — |
| `--bg-2` | `#F4EEE2` | 次级背景（分区） | — |
| `--surface` | `#FFFFFF` | 卡片/浮层表面 | — |

**使用规则**
- 正文 / 描述：用 `--ink` 或 `--mid`（已达标）。
- 文字链接 / 按钮上的白字：必须用 `--accent-strong`，不要用 `--accent`（`--accent` 对白字仅 3.88:1，不达标）。
- `--accent` 只用于大号标题、色块、图标描边、hover 态等「非小正文」场景。
- `--faint` 只用于序号、装饰性提示，不要放关键信息。

---

## 2. 字体系统

- 标题：`--serif`（Noto Serif SC / Songti SC）—— 编辑、人文调性
- 正文 / UI：`--sans`（Noto Sans SC / PingFang SC）—— 清晰易读
- 正文 `line-height: 1.8`；标题 `1.25` 左右。

---

## 3. 字号阶梯（px）

```
--fs-xs  12   --fs-sm  13   --fs-base 14   --fs-md  16
--fs-lg  18   --fs-xl  20   --fs-2xl 24   --fs-3xl 30
--fs-4xl 36   --fs-5xl 44
```
大屏标题用 `clamp()` 做响应式，下限对齐阶梯（如 `clamp(28px, 4vw, 44px)`）。

---

## 4. 间距（8pt 系统）

```
--sp-1:4  --sp-2:8  --sp-3:12 --sp-4:16
--sp-5:20 --sp-6:24 --sp-8:32 --sp-10:40 --sp-12:48 --sp-16:64
```
组件内边距、栅格 gap、段落间距统一从这取，禁止出现 `13px / 17px` 这类游离值。

---

## 5. 圆角

```
--radius-sm:8  --radius-md:12  --radius-lg:16  --radius-xl:20  --radius-pill:999
```
卡片用 `--radius-lg` / `--radius-xl`；按钮、标签用 `--radius-pill`；小元素用 `--radius-sm`。

---

## 6. 阴影层级

```
--shadow-sm  浮起 1 层（hover 微光）
--shadow-md  卡片常态
--shadow-lg  浮层 / 弹窗 / 悬停强浮起
```
统一暖色投影 `rgba(60,45,30,*)`，避免冷灰投影破坏暖调。

---

## 7. 动效

```
--dur-fast:160ms   --dur-normal:300ms   --dur-slow:500ms
--ease:cubic-bezier(0.22,1,0.36,1)
```
- 微交互（hover、下划线展开）用 `--dur-fast`
- 页面/卡片过渡用 `--dur-normal`
- 大位移（弹窗、遮罩）用 `--dur-slow`
- 尊重 `prefers-reduced-motion`：减少位移与循环动画

---

## 8. 组件规范（要点）

- **链接**：默认 `--ink`，hover `--accent-strong`，可加下划线或箭头微动。
- **按钮（实心）**：背景 `--accent-strong`，文字 `#fff`，hover 上浮 + `--shadow-md`。
- **按钮（描边）**：1px `--line`，hover 边框 `--accent-soft`、文字 `--accent-strong`。
- **卡片**：`--surface` + `--radius-lg` + `--shadow-md`，hover 上浮 8px + `--shadow-lg`。
- **标签 / 状态**：`--radius-pill` + 浅底（`--accent-soft` / `--bg-2`）+ `--mid` 文字。

---

## 9. 迁移映射（A 版 → Token）

A 版当前用冷灰体系，迁移到本系统时：

| A 版变量 | 对应 Token | 备注 |
|---------|-----------|------|
| `--text` | `--ink` | |
| `--mid` `#9a958c` | `--mid` `#6B635A` | 加深到 AA |
| `--line` | `--line` | 一致 |
| `--bg` | `--bg` | 一致 |
| `--surface` | `--surface` | 一致 |
| `--shadow` | `--shadow` / `--shadow-md` | |
| `--ease-out` | `--ease` | |

A 版若跟进，建议整体改用暖色编辑风（与 B 版统一调性），或保留冷灰但套用同一套间距/字号/圆角/动效 Token，保证「组件语言」一致。

---

_设计系统维护：新增颜色/字号请先算对比度、补齐阶梯，不要内联魔法值。_
