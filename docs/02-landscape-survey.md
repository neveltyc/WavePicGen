# 02 · 同类工具调研

> 目的：摸清现有数字时序图工具的设计、格式与取舍，提炼可借鉴点与待超越点，作为
> WavePicGen 选型与功能设计的依据。

## 摘要：现状全景

数字时序图工具大致分四类：

1. **文本描述 → 矢量渲染（声明式）**：WaveDrom、undulate、wavedrom-rs、tikz-timing、drawtiming。
   优点是可版本管理、可脚本化、矢量输出；缺点是不可视化直接拖拽、对传播延迟等连续时序表达力有限。
2. **GUI 直接操作（所见即所得）**：TimeGen、TimingDesigner、WaveFormer、TimingEditor。
   优点是上手快、交互直观、擅长延迟/关系标注；缺点多为商业闭源、文档格式私有、跨平台/可脚本化弱。
3. **LaTeX 原生**：tikz-timing。出版级质量、直出 PDF，但纯文本、学习曲线陡、无 GUI。
4. **采集回放（非作图工具）**：sigrok/PulseView 等逻辑分析仪软件——**不属于本项目竞品**（见 01 非目标）。

**WavePicGen 的差异化定位**：把第 1 类的「文本可编辑 + 矢量输出 + 可脚本/可复现」与第 2 类的
「GUI 直接操作 + 延迟/关系标注 + 手册级排版」**合二为一**，并做到真正跨平台与开源可控。

---

## 1. WaveDrom（最重要的参考）

- **是什么**：开源（MIT）的数字时序图渲染引擎，用 JS/HTML5/SVG 把 **WaveJSON** 文本描述渲染为 SVG 矢量图。
- **形态**：① 在线编辑器（左侧写 WaveJSON、右侧实时出图）；② 可嵌入网页；③ Node.js 库；④ 命令行（`wavedrom-cli`，从 JSON 源生成 SVG）。
- **文档格式 WaveJSON**：紧凑的 JSON，面向 HW/IC 工程师交换时序图。核心是 `signal` 数组 + 可选 `edge`、`config`、`head`/`foot`。
  - `wave` 字符串逐周期描述：`p P n N`（时钟，大写带箭头）、`0 1`（电平）、`x`（未知）、`z`（高阻）、`u d`（弱上/下拉）、`=`/`2`–`5`（带颜色的数据段）、`.`（延续上一周期）、`|`（间隔/gap）。
  - `data`：为数据段提供标签数组；`period`/`phase`：周期缩放与相位/延迟；`node`：在周期上打点，配合 `edge` 画关系箭头。
  - `edge`：如 `"a~>b setup"`，连字符/竖线/波浪线表示线型，`>`/`<`/`*` 表示箭头。
  - `config.hscale`：横向缩放；皮肤（skin）可换。
- **可借鉴**：
  - ✅ **WaveJSON 这一「可编辑波形格式」范式**：紧凑、可手写、可脚本生成、可 diff —— 直接对应我们的 FR-3。
  - ✅ **左文本 / 右实时渲染**的双栏编辑范式 —— 对应 FR-1 + FR-2。
  - ✅ **SVG 为原生产物** —— 对应 FR-5。
  - ✅ **同一引擎服务 GUI / 嵌入 / CLI** 的解耦设计 —— 对应 IR-3。
- **不足 / 待超越**：
  - ❌ 几乎**没有可视化直接操作**（拖拽编辑），纯靠改文本。
  - ❌ **跳变只能落在周期边界**：无法表达「在 2.75 周期 / 17.3 ns 处跳变」这类亚周期/异步时刻——对手册级异步时序是**硬伤**；对传播延迟、连续/模拟时序、精确时间轴的表达力也偏弱。
  - ❌ 渲染依赖浏览器/Node；CLI 出图历史上需 headless 浏览器或 Node 环境。
  - ❌ 排版细节（手册级字体/对齐/标注）可控性有限。

## 2. undulate（WaveDrom 的 Python 再实现 + 增强）

- **是什么**：基于 WaveDrom 理念的 **Python** 实现，目标是兼容 WaveJSON 并**增强**，且**不依赖浏览器/Node**。
- **增强点**：节点长名（便于跨点连边）、**亚稳态**波形、**模拟/类比波形**（阶梯、容性充放电、斜率、任意波、最多 4 路叠加）、**注释**（全局时间压缩、垂直/水平辅助线）。
- **可借鉴**：
  - ✅ 证明了「**纯本地、无浏览器**的渲染引擎」可行 —— 对我们做无头核心引擎是正向参考。
  - ✅ **模拟波形 + 亚稳态 + 时间压缩**等高级语义，是手册级时序图的真实需求（纳入 05 格式草案的「加分项」）。

## 3. tikz-timing（LaTeX，出版级标杆）

- **是什么**：LaTeX 宏包，用文本描述生成时序图，直出 **PDF** 矢量。
- **优点**：**出版级质量**、与 LaTeX 排版无缝、表达力极强（可画极复杂的图）。
- **缺点**：纯文本、**无 GUI**、学习曲线陡、迭代慢（需编译）。
- **可借鉴 / 定位**：
  - ✅ 它是「**手册级质量**」的标杆，值得对照其排版细节。
  - 💡 **可作为 WavePicGen 的一个导出后端**（导出为 tikz-timing 代码，供 LaTeX 用户嵌入论文），而非竞争对手。

## 4. drawtiming

- **是什么**：命令行时序图工具。
- **局限**：图形输出灵活性不足（历史上以 GIF 为主，非矢量友好）。
- **结论**：理念可参考，但输出形态不符合我们的矢量优先目标，参考价值低于上面几个。

## 5. TimeGen（GUI 直接操作的代表，维护者点名参考）

- **是什么**：Windows 上的商业时序图编辑器（xfusionsoftware）。鼠标拖拽修改波形即**实时重绘**；常见用法是直接复制粘贴进 Microsoft Word。
- **能力（按其官网特性）**：增删/修改时钟、信号、总线；添加**箭头关系**、文本框、**信号延迟**；字体样式/字号/颜色、填充样式、动态缩放等。
- **可借鉴**：
  - ✅ **所见即所得的鼠标直接编辑**体验（拖拽改沿、拉伸周期、加延迟）—— 正是 WaveDrom 缺的，也是我们 FR-1 要补的。
  - ✅ **箭头关系 / 信号延迟 / 文本框**这套「标注工具集」是手册时序图的刚需。
  - ✅ 「实时重绘」的交互即时性。
- **不足 / 待超越**：
  - ❌ **商业闭源、Windows 限定、格式私有**，不可脚本化、跨平台与版本管理弱。
  - ❌ 复制进 Word 的工作流暗示**矢量/高分辨率导出**与可复现性不是其强项。

## 6. 其它（TimingDesigner / WaveFormer / TimingEditor / Schemdraw.timing 等）

- **TimingDesigner / WaveFormer（SynaptiCAD）**：成熟商业工具，强在**参数化时序（setup/hold/delay）与时序分析**，闭源昂贵。可借鉴其「**时序参数即一等公民**」的建模思路。
- **TimingEditor（SourceForge）**：开源 GUI 时序图编辑器，体量小、活跃度低，可作交互细节参考。
- **Schemdraw（Python）的 timing 模块**：在绘图库里支持 WaveDrom 风格时序图，证明 WaveJSON 风格语义已成事实标准之一。
- **wavedrom-rs（Rust 实现）**：WaveDrom 的 Rust 渲染实现，对我们若选 Rust 核心引擎是直接的技术先例与潜在依赖/参考。

---

## 7. 给 WavePicGen 的设计启示（提炼）

| 启示 | 来源 | 落到我们的需求 |
| --- | --- | --- |
| 采用**紧凑、可手写、可脚本、可 diff 的文本波形格式** | WaveDrom WaveJSON | FR-3、IR-4 |
| **左文本 / 右实时渲染**的双栏编辑范式，作为 GUI 主界面骨架 | WaveDrom 编辑器 | FR-1、FR-2 |
| **SVG 作为原生产物**，再栅格化/转 PDF | WaveDrom、tikz | FR-4、FR-5 |
| **无头渲染引擎 + CLI**，与 GUI 解耦，支持批量/CI 出图 | WaveDrom CLI、undulate | IR-2、IR-3 |
| 必须补上 WaveDrom 缺失的 **GUI 鼠标直接操作（拖拽改沿、加延迟、画箭头）** | TimeGen | FR-1 |
| 把 **时序参数（setup/hold/delay）与关系箭头当一等公民** | TimingDesigner、TimeGen | 内容需求、05 草案 |
| 边沿时刻采用**实数坐标**（支持亚周期/异步），补 WaveDrom 硬伤 | TimeGen / 反观 WaveDrom | 内容需求、05 草案 |
| 提供 **WaveJSON 兼容导入**，降低迁移成本、复用既有资产 | WaveDrom | FR-8、05 草案 |
| 预留**模拟波形 / 亚稳态 / 时间压缩**等高级语义 | undulate | 内容需求（加分） |
| 把 **tikz-timing 作为导出后端**而非对手，服务 LaTeX 用户 | tikz-timing | FR-5（扩展） |
| 坚持**开源、跨平台、格式开放、可复现**，与商业工具形成差异 | TimeGen/TimingDesigner 的反面 | 项目定位 |

---

## 参考资料（Sources）

- WaveDrom 官网与教程：https://wavedrom.com/ ，https://wavedrom.com/tutorial.html
- WaveDrom 源码（MIT）：https://github.com/wavedrom/wavedrom
- WaveJSON 教程介绍（Adafruit）：https://blog.adafruit.com/2020/06/16/wavedrom-an-open-source-digital-timing-diagram-engine/
- WaveDrom 安装与用法（DeepWiki）：https://deepwiki.com/wavedrom/wavedrom/1.1-installation-and-usage
- undulate（Python 实现）：https://github.com/LudwigCRON/undulate
- wavedrom-rs（Rust 实现）：https://github.com/coastalwhite/wavedrom-rs
- TimeGen（商业 GUI）：https://www.xfusionsoftware.com/ ，特性页 http://www.xfusionsoftware.com/timegen_features.html
- 时序图工具综述（EPanorama）：https://www.epanorama.net/blog/2015/05/29/timing-waveforms-drawing-tools/
- Hackaday 对 WaveDrom 的介绍：https://hackaday.com/2015/05/25/need-timing-diagrams-try-wavedrom/
- RTL/数字设计中的时序图（Maskset）：https://www.maskset.net/blog/2022/11/09/timing-diagrams-for-rtl-and-digital-design/
- Schemdraw timing 模块：https://schemdraw.readthedocs.io/en/latest/elements/timing.html
- TimingEditor（开源 GUI）：https://sourceforge.net/projects/timingeditor/
