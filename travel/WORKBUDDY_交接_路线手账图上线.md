# Workbuddy 交接：旅行路线手账图上线

## 交接目标

将旅行网站新增的“路线手账图”功能及其背景图下载修复推送到 GitHub Pages 正式站：

https://daozhu1993-oss.github.io/travel/

本次 Codex 已完成本地代码修改和浏览器级验收，未执行线上推送。

## 本次已完成

### 1. 新增路线手账图

- 在旅行路线生成结果下方增加“生成路线手账图”入口。
- 生成一张 1080 × 1440 的纵向 SVG 路线手账图。
- 左侧为纸张卡片式行程信息，右侧为目的地风景图和纵向路线。
- 路线图使用当前真实生成结果，不是固定示例文案。
- 自驾路线会展示：
  - 总公里数
  - 总车程
  - 分段车程
  - 最后一天“返回出发地”
- 支持下载 PNG 和 SVG。

### 2. 修复下载后背景图丢失

问题原因：预览中的风景图原先是 SVG 外部图片地址。下载 PNG 时，浏览器只转换了 SVG 的文字和线条，没有把外部图片一起嵌入，所以下载文件中背景图消失。

现在的处理方式：

1. 点击下载前，先读取路线图涉及的每张目的地照片。
2. 将照片转换为内嵌 `data:image/jpeg;base64,...` 数据。
3. 用内嵌图片重新生成 SVG。
4. 再分别导出 SVG 或 PNG。

同时兼容本地 `file://` 预览，在线环境使用 HTTP/HTTPS 图片时保留跨域兼容处理。

## 必须推送的文件

请只处理以下目标文件：

- `travel/app.js`
- `travel/index.html`
- `travel/styles.css`
- `travel/WORKBUDDY_交接_路线手账图上线.md`

不要把以下无关备份文件加入提交：

- `yayashou/index.html.bak-20260818-v01`

## 推送前验收

在仓库根目录执行：

```bash
cd /Users/gx/workbududdy/dao-site
node --check travel/app.js
git diff --check
```

预期结果：两个命令均无错误输出。

然后打开本地页面：

```text
file:///Users/gx/workbududdy/dao-site/travel/index.html
```

按以下路径验收：

1. 点击“生成路线”。
2. 点击“生成路线手账图”。
3. 确认右侧路线图出现多段目的地风景图。
4. 点击“下载 SVG”，打开下载文件，确认仍有风景图。
5. 点击“下载 PNG”，打开下载文件，确认右侧背景图、路线线条、节点和文字都存在。

如果页面中照片加载较慢，先等待照片加载完成再点击下载。

## 建议提交与推送命令

先确认状态：

```bash
git status --short
```

只暂存本次文件：

```bash
git add travel/app.js travel/index.html travel/styles.css travel/WORKBUDDY_交接_路线手账图上线.md
```

提交：

```bash
git commit -m "新增路线手账图并修复背景图导出"
```

推送：

```bash
git push origin main
```

## 上线后验收

等待 GitHub Pages 更新后打开：

https://daozhu1993-oss.github.io/travel/

确认：

- 路线页面正常打开。
- 原有路线生成、自驾闭环、公里数和车程信息不受影响。
- “生成路线手账图”入口可用。
- 下载 PNG 后右侧背景图不再消失。
- 下载 SVG 后仍保留背景图。

## 边界说明

- 公里数和车程仍是城市坐标结合道路系数的路线级估算，不是实时导航数据。
- 图片是网站已有的目的地封面图，作为路线图的视觉背景。
- 本次不新增依赖，不改动 `yayashou/` 等其他页面。
- 如果 `git push` 遇到 GitHub 权限或 token 失效问题，不要强行修改远程配置；保留错误信息并反馈。
