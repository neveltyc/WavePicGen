# 04 · 初步架构方案

> 目的：在已确定的「首选路线 R1（Web/Tauri + Rust 引擎 + resvg）」之上，给出**以可维护性为第一公民**的架构：
> 模块划分、依赖规则（高内聚低耦合）、**复用既有轮子（Reuse Map）**、**自研 vs 复用（Build-vs-Reuse）**、
> 渲染/导出管线与数据流。备选路线 R3（Qt/PySide6）共享其中与外壳无关的部分。
>
> 注：本架构与另一份独立调研方案高度一致（模型驱动单一真相源、引擎/外壳分离、SVG 中间产物），
> 本文在其基础上**强化了模块边界、依赖方向与复用策略**，以回应「高内聚低耦合 + 用现成轮子魔改」的诉求。

---

## 1. 三条架构原则（决定一切）

1. **模型驱动 · 单一真相源（Single Source of Truth）**：有且只有一个**文档模型（Document Model）**是真相；
   GUI、文本/命令、导入导出、渲染都是它的「视图」或「变换」。GUI 操作 = 对模型打补丁（patch），天然支持撤销/重做。
2. **引擎 / 外壳分离（Headless Core）**：核心引擎（模型 + 校验 + 布局 + SVG 生成 + 栅格化）与 GUI 外壳彻底解耦；
   同一引擎服务 **GUI / CLI / 未来 Web 嵌入** 三个入口，保证三处出图**逐像素一致、可复现**。
3. **SVG 作为渲染中间产物（矢量优先）**：统一管线 `模型 → 布局 → SVG →（屏显 / 落盘 / resvg 栅格化）`。
   位图导出**不走屏幕渲染器**，而走确定性栅格器 resvg，跨平台、任意 DPI 一致。

> 这三条同时就是「高内聚低耦合」的落地：每个模块只做一件事（高内聚），跨模块只经由**模型**与**明确接口**通信（低耦合）。

---

## 2. 分层与模块划分（高内聚、低耦合）

依赖方向**严格单向、自上而下**；上层可依赖下层，下层**绝不**反向依赖上层（这是低耦合的硬约束）。

```
┌──────────────────────────────────────────────────────────────┐
│  L4  入口 / 外壳 (Entrypoints)                                  │
│   ├─ gui-shell   : Tauri 外壳 + 前端 UI（画布、文本面板、命令面板）  │
│   ├─ cli         : 批量出图 (model/DSL → svg/png/jpeg/pdf)       │
│   └─ (future) web: 浏览器嵌入                                    │
├──────────────────────────────────────────────────────────────┤
│  L3  应用服务 (Application Services)  —— 用例编排、与 UI 无关       │
│   ├─ commands    : 命令/动作 (add clock, move edge, export...)   │
│   ├─ history     : 撤销/重做 (patch 栈)                          │
│   └─ project-io  : 工程文件读写、最近文件、自动保存               │
├──────────────────────────────────────────────────────────────┤
│  L2  核心引擎 (Core Engine)  —— 纯函数式、无 IO、可单测           │
│   ├─ model       : 文档模型 + schema + 校验 + patch              │
│   ├─ parser      : DSL/WaveJSON ⇄ model（双向序列化）            │
│   ├─ layout      : 模型 → 几何布局（坐标/对齐/排版）【自研核心】    │
│   ├─ svggen      : 布局 → SVG 文档                              │
│   └─ export      : SVG → PNG/JPEG/PDF（封装 resvg）              │
├──────────────────────────────────────────────────────────────┤
│  L1  基础设施 (Vendored Libraries) —— 复用的现成轮子             │
│   resvg/usvg/tiny-skia · image · serde · Monaco/CodeMirror ·    │
│   Konva · Tauri · 字体（打捆）                                   │
└──────────────────────────────────────────────────────────────┘
```

**关键边界（low coupling 的体现）**

- **L2 核心引擎不依赖任何 UI / IO / 平台**：输入是模型或 DSL 字符串，输出是 SVG/字节流，**纯函数**。
  → 可在无 GUI 下完整单测与视觉回归（SVG 快照对比）。这是整个工程可维护性的基石。
- **GUI 与 CLI 都只是 L2 的薄外壳**：它们调用同一组用例（L3），决不内嵌渲染逻辑。
  → 「换外壳」（如从 Tauri 切到 Qt，或加 Web 版）不触碰 L2。
- **模型是唯一跨层数据契约**：各模块通过模型 + 明确接口通信，而非互相直接调用内部实现。
- **`layout` 是唯一的「自研核心 IP」**（手册级排版规则在此），其余尽量复用现成轮子（见 §4）。

**高内聚的体现**：每个模块单一职责、可独立演进——
`parser` 只管「文本 ⇄ 模型」、`layout` 只管「模型 → 几何」、`svggen` 只管「几何 → SVG」、`export` 只管「SVG → 位图/PDF」。
任一环节可单独替换或重写而不影响其它（例如未来 `svggen` 想换排版细节、或 `export` 想加 EPS，都局部可控）。

---

## 3. 数据流与往返（round-trip）

```
        ┌──────────── 文本/命令面板 (Monaco) ───────────┐
        │  DSL/WaveJSON 文本  ⇄  命令行命令              │
        └───────────────┬───────────────────────────────┘
                        │ parser（双向）
   GUI 画布 ──patch──▶  ┌─────────────┐  ──layout──▶ 几何 ──svggen──▶ SVG
   (拖拽/选择) ◀─视图─  │  文档模型     │                                  │
                        │ (真相源 JSON) │   ┌─ 屏幕显示 (WebView: SVG-in-DOM / Konva)
        history ◀─patch─┤             │   ├─ 落盘 .svg
        (撤销/重做)      └─────────────┘   ├─ resvg → .png (任意 DPI / 透明)
                        │ project-io        ├─ resvg → .jpeg (可设背景)
                        ▼                   └─ resvg → .pdf (矢量)
                   工程文件 (.wdoc, JSON)
```

- **三向往返**：GUI ↔ 模型 ↔ 文本，三者是同一模型的不同视图，编辑任一处其余实时同步（满足 FR-1/FR-2/IR-4）。
- **屏显 SVG ≈ 导出 SVG**：所见即所得；位图/ PDF 由 resvg 统一出，跨平台一致（满足 IR-2）。

---

## 4. 复用既有轮子（Reuse Map）—— 回应「用别人的轮子魔改」

原则：**商品化、难且通用的部分一律复用现成库；只在差异化核心自研。** 下表是每个能力的「轮子归属」。

| 能力 | 复用的现成轮子（候选） | 复用方式 | 备注 |
| --- | --- | --- | --- |
| **SVG 栅格化 → PNG/JPEG** | **resvg + usvg + tiny-skia**（Rust） | 直接依赖 | 业界质量标杆，确定性强；位图导出的地基 |
| **SVG → PDF** | resvg（支持 PDF 后端）/ `svg2pdf`（Rust） | 直接依赖 | 矢量 PDF，论文/手册友好 |
| **PNG/JPEG 编码** | `image` crate（Rust） | 直接依赖 | 与 tiny-skia 配合 |
| **JSON 序列化/校验** | `serde` + `serde_json` / `jsonschema` | 直接依赖 | 模型与 WaveJSON 兼容层 |
| **文本/DSL 编辑器** | **Monaco**（VS Code 同款）或 **CodeMirror 6** | 集成 + 自定义语言 | 语法高亮/补全/错误标注，省下巨量工作 |
| **画布交互（选择/拖拽/手柄）** | **Konva.js**（或原生 SVG-in-DOM 命中测试） | 集成 | 选择框、变换手柄、事件冒泡 |
| **桌面外壳 / 打包 / 文件对话框** | **Tauri 2**（或 Electron） | 框架 | 系统 WebView，小体积；原生菜单/对话框 |
| **前端 UI 框架** | **Svelte** 或 **React** | 框架 | 仅做界面外壳，画布自绘 |
| **WaveJSON 渲染参考** | **wavedrom-rs** / WaveDrom | 参考 / 选择性借用 | 见 §5「为何不直接 fork」 |
| **字体** | 打捆开源字体（如 Inter / Source Han / Noto） | 打捆 | 跨平台字形一致、可嵌入 |
| **LaTeX 导出（加分）** | tikz-timing 代码生成 | 由模型生成 | 作为导出后端，不依赖其渲染 |

> 若选备选路线 R3（Qt），则 Monaco→QScintilla、Konva→QGraphicsScene、Tauri→无（原生），导出走 QSvgGenerator/QImage/QPdfWriter，**位图仍可选择性再过 resvg** 以统一保真度。其余（model/parser/layout 概念）不变。

---

## 5. 自研 vs 复用（Build-vs-Reuse 决策）

对每个组件明确「造还是借」，这是可维护性的核心判断：

| 组件 | 决策 | 理由 |
| --- | --- | --- |
| 栅格化 / PDF / 图像编码 | **复用**（resvg 系） | 极难且通用，重写无意义 |
| 文本编辑器 / 画布交互 / 外壳 | **复用**（Monaco/Konva/Tauri） | 成熟、省时、可维护 |
| **文档模型 + 校验** | **自研**（薄） | 是我们的数据契约，需精确贴合需求（实数边沿、关系对象） |
| **parser（DSL/WaveJSON 双向）** | **自研 + 兼容层** | WaveJSON *导入*复用其格式；我们的*原生* DSL 是超集，需自研 |
| **layout 布局引擎** | **自研（核心 IP）** | 「手册级排版」就在这里；现成轮子都不满足亚周期/关系标注 |
| **svggen** | **自研（薄）** | 把几何写成 SVG，简单且需完全可控 |

### 为何不直接 fork wavedrom-rs / WaveDrom 当引擎？

很关键的一条判断（直接影响可维护性）：

- WaveDrom 系的**数据模型以「周期字符串」（`wave: 'p...'`）为中心**，**结构上假设跳变对齐周期边界**。
  而我们把**亚周期/异步实数边沿**与**关系/参数对象**作为一等公民——这与其内核假设**相冲突**。
- 在其上强行加实数边沿与关系标注，会**与其核心数据模型对抗**，导致高耦合、难维护（低内聚），违背本次诉求。

**因此采取「分层复用」而非「整体 fork」**：

- ✅ **复用**最难的商品化部件（resvg 栅格化、Monaco、Konva、Tauri）——这才是「用别人的轮子」的最大收益点；
- ✅ **复用 WaveJSON 的格式**作为*导入兼容层*（降低迁移成本）；
- ✅ **参考/可选择性借用** wavedrom-rs 的渲染技巧（边沿/总线绘制等），但**不被其数据模型绑架**；
- 🔨 **自研** small-but-cohesive 的 `model + layout + svggen`（约束在差异化核心，面积小、可测、可控）。

这样既最大化复用、又保证核心高内聚低耦合——是「魔改轮子」与「可维护性」的最佳平衡点。

---

## 6. 渲染与导出管线（细化）

```
文档模型 (model)
   │  layout：计算坐标、对齐时间栅格、排版信号名/数据标签/关系箭头、解析实数边沿
   ▼
几何场景 (scene graph，纯数据)
   │  svggen：几何 → SVG 元素（每个边沿/标签/标尺是一个可命中的节点）
   ▼
SVG 文档（矢量真相）
   ├──▶ 屏幕显示：WebView 内 SVG-in-DOM（命中测试/选择几乎免费）或 Konva 叠加交互层
   ├──▶ 直接落盘：.svg（可选字体 outline / 内嵌字体）
   ├──▶ export(resvg)：.png（任意 DPI、透明通道）
   ├──▶ export(resvg)：.jpeg（可设背景色、质量）
   └──▶ export(resvg)：.pdf（矢量，论文/手册）
```

要点：

- **几何场景（scene graph）作为 layout 与 svggen 之间的纯数据接口**，让二者解耦、各自可测。
- 位图/ PDF **不依赖屏幕渲染器**，由 resvg 决定 → 跨平台逐像素一致（手册级一致性的技术兜底）。
- 字体**打捆**并支持导出时 outline/内嵌，避免他人机器缺字形。

---

## 7. 与备选路线 R3（Qt/PySide6）的共享与差异

> 维护者强调「外壳可替换」，本架构据此设计：**L2 核心（model/parser/layout 概念）与 L3 用例与外壳无关**。

| 层 | R1（Web/Tauri，首选） | R3（Qt/PySide6，备选） |
| --- | --- | --- |
| L4 外壳 | Tauri + Web 前端 | Qt Widgets |
| 文本编辑器 | Monaco / CodeMirror | QScintilla |
| 画布交互 | SVG-in-DOM / Konva | QGraphicsScene/View |
| 屏幕渲染 | WebView 渲染 SVG | QPainter |
| SVG 导出 | svggen 直出 | QSvgGenerator（或直接复用 svggen 的 SVG 文本） |
| 位图/ PDF 导出 | resvg | QImage/QPdfWriter（可再过 resvg 统一） |
| L2/L3 | **共享**（语言取决于引擎决策 D3） | **共享**（若引擎为 Rust，可经 FFI/子进程供 Python 调用） |

> 即：**先把 model + DSL + layout + svggen 定下来，外壳后选**。这正是抗风险、保可维护性的关键。

---

## 8. 工程化（保障长期可维护）

- **仓库结构（建议，待定稿）**：`core/`（L2 引擎，可独立 build/test）、`app/`（L4 GUI 外壳）、`cli/`（L4）、`docs/`、`examples/`、`tests/`（含 SVG 快照）。
- **测试金字塔**：以 L2 纯函数单测为主；`examples/*.wdoc → 期望 .svg` 的**视觉回归快照**；少量端到端 GUI 冒烟。
- **CI 矩阵**：GitHub Actions `windows-latest + ubuntu-latest` 交叉构建 + 测试 + 出 release 产物。
- **确定性**：固定字体、固定数值精度与排版规则，保证 SVG 快照稳定（回归可比对）。
- **文档与契约**：模型带 `schemaVersion`；DSL 有正式语法说明；导出参数有 CLI/`--help`。

---

## 9. 落到需求的对账（Traceability）

| 需求 | 架构落点 |
| --- | --- |
| FR-1 GUI | L4 gui-shell（画布 + 面板） |
| FR-2 命令输入 | L3 commands + L4 命令面板/文本面板（经 parser 回写模型） |
| FR-3 可编辑波形格式 | L2 model（JSON 真相源）+ parser（DSL/WaveJSON） |
| FR-4 PNG/JPEG | L2 export（resvg） |
| FR-5 SVG/PDF | L2 svggen（SVG）+ export（PDF） |
| FR-6 跨平台 | L4 Tauri 打包 + CI 矩阵 |
| FR-7 原生/网页 | R1 网页渲染外壳；R3 原生备选（L2 共享） |
| FR-8 参考 WaveDrom/TimeGen | parser WaveJSON 兼容 + 交互借鉴 TimeGen |
| IR-2 可复现 | Headless 引擎 + resvg 统一出图 |
| IR-3 CLI | L4 cli 复用 L2 |
| IR-7 复用优先 | §4 Reuse Map + §5 Build-vs-Reuse |
| 可维护性/高内聚低耦合 | §2 分层 + 单向依赖 + 模型为唯一契约 |
