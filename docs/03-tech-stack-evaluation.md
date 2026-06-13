# 03 · 技术栈评估与选型

> 目的：在「原生 vs 网页渲染」「哪种 GUI 框架」「核心引擎语言」「导出管线」四个维度上系统比较，
> 给出选型建议与理由。**这是需要维护者最终拍板的部分**（见文末「关键决策」与 06 文档）。

## 0. 选型的第一性原理

时序图工具的难点**不在 GUI 框架本身**，而在四件事：

1. **干净的文档/格式模型**（可编辑波形格式，FR-3）；
2. **高质量、确定性的渲染器**（精确排版/字体/对齐 —— 「手册级」由此而来，IR-1/IR-2）；
3. **稳健的多格式矢量导出**（SVG/PDF/PNG/JPEG，FR-4/FR-5）；
4. **同时支持文本与直接操作、且无损往返的编辑器**（FR-1/FR-2/IR-4）。

由此推出两条几乎决定全局的原则：

- **原则 A：让矢量（SVG）成为贯穿始终的内部表示**。SVG 既是文本（天然可编辑、可 diff、可版本管理，直接满足
  「可编辑波形格式」的一种解读）、又是导出产物、又能被高质量栅格化为 PNG/JPEG、转换为 PDF/EPS。
  围绕 SVG 组织，FR-4/FR-5 几乎「免费」达成。
- **原则 B：渲染/导出引擎与 GUI 解耦，做成无头核心 + CLI**。同一引擎驱动 GUI、命令输入、批量出图，
  保证 GUI 与 CLI **逐像素一致、可复现**（IR-2/IR-3），这正是学术/手册场景的刚需。

下面的对比都以「能否最自然地落实原则 A/B」为主要标尺。

---

## 1. 候选实现路线总览

| 路线 | 形态 | UI 技术 | 渲染/产物 | 桌面外壳 |
| --- | --- | --- | --- | --- |
| **R1. Web 栈 + Tauri**（首选） | 网页渲染的原生桌面应用 | TS + 框架（React/Svelte/Vue） | **SVG 原生** + Canvas 交互 | Tauri（Rust，系统 WebView） |
| R2. Web 栈 + Electron | 同上，外壳更重 | TS + 框架 | SVG 原生 | Electron（自带 Chromium） |
| **R3. Qt / PySide6**（强力备选） | 原生 | Qt Widgets + QGraphicsScene | QPainter，内置导出 PNG/JPEG/SVG/PDF/PS | 无（原生） |
| R4. Qt / C++ | 原生 | 同 R3 | 同 R3 | 无（原生） |
| R5. Avalonia / .NET (C#) | 原生（Skia 自绘） | XAML + Skia | SkiaSharp，三方 Svg.Skia 导出 | 无（原生） |
| R6. Flutter (Dart) | 原生（Skia/Impeller 自绘） | Flutter | Canvas，SVG 导出需三方/自研 | 无（原生） |
| R7. JavaFX / Compose-Desktop 等 | 原生（JVM/Kotlin） | 场景图 | Canvas + 三方导出 | 无（原生） |
| — tikz-timing / LaTeX | 非 GUI | — | PDF | — |

> tikz-timing 不作为 App 实现路线，而是作为**导出后端**纳入（见 02/04）。
> R6/R7 在「矢量导出」上短板明显（需自研 SVG 导出），与原则 A 冲突，下面不再细评，仅列在矩阵中。

---

## 2. 决策矩阵

评分：★★★（优）/ ★★（中）/ ★（弱）。权重列代表该项对本项目的重要性（H/M/L）。

| 评估项（权重） | R1 Web+Tauri | R2 Web+Electron | R3 PySide6 | R4 Qt C++ | R5 Avalonia | R6 Flutter |
| --- | :--: | :--: | :--: | :--: | :--: | :--: |
| 矢量渲染 & SVG 原生 **(H)** | ★★★ | ★★★ | ★★ | ★★ | ★★ | ★ |
| 多格式导出 PNG/JPEG/PDF/EPS **(H)** | ★★★ | ★★★ | ★★★ | ★★★ | ★★ | ★ |
| 可编辑矢量场景 / 直接操作 **(H)** | ★★ | ★★ | ★★★ | ★★★ | ★★ | ★★ |
| 手册级排版 / 字体 / CJK **(H)** | ★★★ | ★★★ | ★★★ | ★★★ | ★★ | ★★ |
| 无头引擎 / CLI 复用 **(H)** | ★★★ | ★★ | ★★ | ★★ | ★★ | ★ |
| 跨平台 Win+Linux amd64 **(H)** | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ | ★★ |
| UI 开发速度 / 生态 **(M)** | ★★★ | ★★★ | ★★ | ★ | ★★ | ★★ |
| 二进制体积 / 资源占用 **(M)** | ★★★ | ★ | ★★ | ★★★ | ★★ | ★★ |
| 跨平台渲染一致性 **(M)** | ★★ | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ |
| 许可证友好（开源可控）**(M)** | ★★★ | ★★★ | ★★ | ★★ | ★★★ | ★★★ |
| 团队上手成本 **(M)** | 取决于团队 | 取决于团队 | 取决于团队 | ★ | ★★ | ★★ |
| 长期维护 / 社区 **(L)** | ★★★ | ★★★ | ★★★ | ★★★ | ★★ | ★★★ |

> 矩阵是启发式的，不是唯一真理；最终取决于**团队技能**与**开源/商业意图**（见文末）。

---

## 3. 三个主要候选的深入分析

### R1 · Web 栈 + Tauri（首选）

**构成**：TypeScript + 前端框架（建议 Svelte 或 React）；时序图用 **SVG（DOM）** 渲染（矢量、可检视、可直接导出），交互层可用 **Konva.js / 自绘** 处理选择与拖拽手柄；文本/DSL 源用 **Monaco 或 CodeMirror** 编辑器；桌面外壳用 **Tauri**（Rust 后端 + 系统 WebView）；导出栅格化/转 PDF 由 **resvg（Rust）** 在原生侧完成。

**优点**
- **最契合原则 A**：SVG 端到端为原生产物，FR-4/FR-5 近乎免费；SVG 文本本身可编辑、可 diff。
- **最契合原则 B**：核心渲染引擎可编为 **Rust 库 + CLI + WASM**，GUI 与 CLI 共用同一份代码 → 逐像素一致、可复现（见第 4 节）。
- **UI 迭代最快、生态最大**：现代化双栏编辑器、命令面板、主题等都有成熟方案；FR-1/FR-2 自然落地。
- **二进制小、占用低**：Tauri 用系统 WebView，安装包常 < 10MB，内存 ~30–50MB（对比 Electron 80–150MB 安装、150–300MB 内存）。
- **跨平台几乎免费**：Win/Linux amd64 一套代码。
- **许可友好**：Tauri/resvg/Web 生态多为 MIT/Apache，开源可控。

**缺点 / 风险**
- **WebView 不一致**：Tauri 在 Windows 用 WebView2、Linux 用 WebKitGTK，是两个渲染引擎，CSS/SVG 个别行为可能有差异，需要跨平台测试（缓解：核心图形走 SVG 且最终导出由 resvg 统一渲染，**导出件与 WebView 无关**，从根上消除不一致）。
- Linux 需依赖 WebKitGTK 运行库（打包/分发时需处理）。
- 直接操作（拖拽）体验需自行打磨，略逊于 QGraphicsScene 开箱即用。

**为何作为首选**：它在四个高权重项（SVG 原生、多格式导出、手册排版、无头/CLI 复用）上全部满分，且把唯一短板（WebView 不一致）通过「**导出由 resvg 统一完成**」结构性化解。对「学术/手册级、可复现、可脚本」的目标契合度最高。

### R3 · Qt / PySide6 + QGraphicsScene（强力备选）

**构成**：Python + PySide6（或 C++/Qt）；用 **QGraphicsScene/QGraphicsView** 承载可编辑矢量场景（选择、变换、层级、吸附开箱即用）；导出 PNG/JPEG 经 `QImage`、SVG 经 `QSvgGenerator`、PDF/PS 经 `QPdfWriter/QPrinter`——**全部内置**。文本源面板用 QScintilla/QPlainTextEdit。

**优点**
- **可编辑矢量场景的天花板**：QGraphicsScene 就是为「交互式矢量物件编辑」而生，直接操作体验开箱即用，最贴近 TimeGen 那种鼠标拖拽手感。
- **内置多格式导出**：PNG/JPEG/SVG/PDF/PS 全部原生、质量高、字体可嵌入。
- **排版/字体**强、CJK 成熟、真原生体感、稳定。
- 单一代码库覆盖 Win/Linux/macOS。

**缺点 / 风险**
- **渲染存在「两条路径」**：屏上是 QPainter，导出 SVG 是 QSvgGenerator，两者可能有细微差异（违背原则 A 的「单一表示」理想，需要测试对齐）。
- **QtSvg 仅支持 SVG Tiny 1.2 子集**（指其 SVG *读取/渲染*）：由于我们的 SVG 是自己生成、特性可控，*导出*一般不受影响；但若需读回/预览第三方 SVG 会受限。必要时位图导出可再过一道 **resvg** 提升保真度。
- **无头/CLI 复用次于 R1**：需要把模型与渲染函数抽出来在无 GUI 下跑（可行，但不如「Rust 库 + WASM 同源」优雅）。
- **许可证需注意**：Qt/PySide6 为 **LGPLv3 / 商业** 双授权。做开源工具走 LGPL 没问题（需满足可重新链接等条款）；若未来要做闭源商业分发需评估商业授权。
- **UI 现代观感与迭代速度**不及 Web 栈；C++（R4）开发更慢，故备选取 PySide6。
- Python 打包（PyInstaller/Nuitka）产物较大、需调试。

**为何作为备选**：若团队是 Python/C++ 背景、且最看重「**极致精确的鼠标直接编辑 + 全内置导出 + 真原生**」，R3 比 R1 更优。它在「可编辑矢量场景」单项上胜过 R1。

### R2 · Web 栈 + Electron（次选）

与 R1 同思路，但外壳换 Electron：**渲染一致性最好**（自带 Chromium，Win/Linux 同一引擎），代价是**体积大、内存高**。若「跨平台渲染绝对一致」比「小体积」更重要，可由 R1 切到 R2（前端代码基本可复用）。鉴于我们会用 resvg 统一导出来消解一致性问题，R1 的小体积优势通常更划算。

### R5 · Avalonia / .NET（中庸之选）

Skia 自绘、跨平台、像素级一致，XAML 现代 UI；SVG/PDF 导出依赖三方 `Svg.Skia`（其强项是「SVG 读入/渲染」，把**任意自绘场景导出为 SVG**的链路不如 Qt 内置直接）。若团队是 .NET 背景可考虑，但在本项目的高权重项上整体不及 R1/R3。

---

## 4. 核心引擎语言（与 R1 绑定的子决策）

若选 R1，渲染/导出核心引擎有两种做法：

- **方案 ①（推荐）Rust 核心 → 编译为 原生库/CLI + WASM**：
  GUI（WebView）里跑 WASM 版引擎做实时预览，CLI/批量出图跑原生版引擎，**同一份代码**保证逐像素一致；导出用 resvg（同为 Rust，进程内调用）。最贴合 IR-2/IR-3，「手册级可复现」最强。代价：引入 Rust + WASM 构建复杂度。可参考 `wavedrom-rs`。
- **方案 ② TypeScript 核心 → 在 WebView 渲染 + Node/Bun CLI**：
  引擎用 TS，GUI 直接用、CLI 用 Node/Bun 跑同一份 TS。最简单、上手最快；导出栅格化可调 resvg CLI 或 sharp。代价：CLI 与 GUI 虽同源但运行环境不同，需注意字体/度量一致性。

> 倾向：以「手册级可复现」为最高优先 → 选 **①（Rust 核心 + WASM）**；以「尽快出可用版本」为优先 → 选 **②（TS 核心）**。这是一个可以**先 ② 后 ①** 渐进的选择（先 TS 验证产品，再视需要把热点/导出下沉到 Rust）。

---

## 5. 导出管线建议（与路线无关）

| 目标格式 | R1（Web/Tauri） | R3（PySide6） |
| --- | --- | --- |
| **SVG** | 引擎直接产出（原生） | `QSvgGenerator` |
| **PNG/JPEG** | resvg 栅格化 SVG（可设 DPI、PNG 透明） | `QImage`/`QPixmap` |
| **PDF** | resvg → PDF（或 svg2pdf 类库） | `QPdfWriter`/`QPrinter` |
| **EPS/PS**（加分） | 经 resvg/外部转换 | `QPrinter(PostScript)` |
| **tikz-timing**（加分） | 引擎生成 tikz 代码 | 同左（与渲染器无关，由模型生成） |

> **resvg** 是 Rust 编写的高质量 SVG 栅格器，覆盖度与质量对标甚至超过 librsvg，适合服务端/无头出图，是 R1 导出管线的核心。

---

## 6. 选型建议（结论）

1. **首选 R1：Web 栈（SVG 原生）+ Tauri 外壳 + resvg 导出**，核心引擎可**先 TS、后下沉 Rust**。
   理由：在四个高权重维度（SVG 原生 / 多格式导出 / 手册排版 / 无头 CLI 复用）全面占优，唯一短板（WebView 一致性）由「resvg 统一导出」结构性消除；UI 迭代最快、体积最小、跨平台与开源最友好。维护者强调的**可维护性 / 高内聚低耦合 / 复用既有轮子**进一步加固该选择：resvg/usvg/tiny-skia、Monaco/CodeMirror、Konva、Tauri 均为可直接复用的成熟轮子，自研面收敛到「布局 + 格式」（见 [`04`](04-architecture-proposal.md) 的 Reuse Map 与 Build-vs-Reuse）。
2. **强力备选 R3：PySide6 + QGraphicsScene**。
   若团队 Python/C++ 背景，且最看重「鼠标直接编辑手感 + 全内置导出 + 真原生」，选它。
3. **次选 R2（Electron）**：当「跨平台渲染绝对一致 + 不在意体积」时由 R1 平滑切换。

---

## 7. 关键决策（请维护者拍板，详见 06）

- **D1 实现路线**：R1（Web/Tauri，推荐）／R3（PySide6）／R2（Electron）／其它？——取决于**团队主力技能**与**开源 vs 商业**意图。
- **D2 开源还是闭源/商业**：影响 Qt(LGPL/商业) 等许可选择；若坚定开源，R1 生态最干净。
- **D3 核心引擎语言**（若选 R1）：Rust 核心+WASM（可复现最强）／TS 核心（最快出活）／先 TS 后 Rust。
- **D4 导出格式优先级**：SVG+PNG+JPEG 为 MVP；PDF/EPS/tikz 排在何处？

---

## 参考资料（Sources）

- Tauri vs Electron（体积/WebView/取舍）：
  https://www.gethopp.app/blog/tauri-vs-electron ，
  https://blog.openreplay.com/comparing-electron-tauri-desktop-applications/ ，
  https://dev.to/nikolas_dimitroulakis_d23/cross-platform-desktop-wars-electron-vs-tauri-how-do-you-explain-the-tradeoffs-to-users-2948
- Tauri 官网：https://tauri.app/
- PySide6 / Qt 许可（LGPL vs 商业）：
  https://www.pythonguis.com/faq/licensing-differences-between-pyqt6-and-pyside6/ ，
  https://doc.qt.io/qtforpython-6/commercial/index.html
- QGraphics 矢量编辑教程：https://www.pythonguis.com/tutorials/pyside6-qgraphics-vector-graphics/
- QSvgGenerator：https://doc.qt.io/qtforpython-6/PySide6/QtSvg/QSvgGenerator.html
- Avalonia / Skia：https://avaloniaui.net/ ，https://github.com/wieslawsoltes/Svg.Skia
- resvg（Rust SVG 栅格器）：https://github.com/RazrFalcon/resvg
- SVG 栅格器质量对比（resvg vs librsvg vs cairosvg）：
  https://oreillymedia.github.io/Using_SVG/extras/ch04-rasterizers.html
- Web 画布库（Konva/Fabric）对比：https://konvajs.org/docs/guides/best-canvas-library.html
- wavedrom-rs（Rust 渲染先例）：https://github.com/coastalwhite/wavedrom-rs
