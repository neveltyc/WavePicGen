# WavePicGen

> 一个严肃 / 学术 / 手册级（manual-quality）的数字电路时序图（timing / waveform diagram）绘制工具。

WavePicGen 的目标是成为可用于教科书、数据手册（datasheet）、规格书与学术论文的数字时序图创作工具：

- **GUI 图形界面**，同时支持在界面内通过**命令 / 文本（DSL）输入**驱动绘图；
- 使用**可编辑的波形描述格式**（纯文本，可版本管理、可脚本生成）作为持久化文档模型；
- 渲染输出为**矢量图**，导出至少支持 **PNG / JPEG**，并优先支持 **SVG / PDF** 等矢量格式；
- **跨平台**：首要目标为 **Windows** 与 **Linux (amd64)**；
- 设计上可部分参考 [WaveDrom](https://wavedrom.com/) 与 [TimeGen](https://www.xfusionsoftware.com/) 等既有工具的理念。

---

## ⚠️ 当前状态：调研与方案阶段（尚未开始编码）

本仓库目前**只包含调研与设计文档**，尚未编写任何实现代码。
在维护者明确确认技术选型与方案之前，不会落地实现代码。

## 文档索引（`docs/`）

| 文档 | 内容 |
| --- | --- |
| [`docs/01-requirements.md`](docs/01-requirements.md) | 需求拆解、范围界定、目标用户与非目标 |
| [`docs/02-landscape-survey.md`](docs/02-landscape-survey.md) | 同类工具调研（WaveDrom / TimeGen / tikz-timing / undulate 等）及可借鉴点 |
| [`docs/03-tech-stack-evaluation.md`](docs/03-tech-stack-evaluation.md) | 技术栈评估、对比矩阵与选型建议 |
| [`docs/04-architecture-proposal.md`](docs/04-architecture-proposal.md) | 初步架构方案：模块划分、渲染与导出管线、数据流 |
| [`docs/05-waveform-format-draft.md`](docs/05-waveform-format-draft.md) | 「可编辑波形格式」草案（文档模型 + DSL） |
| [`docs/06-roadmap.md`](docs/06-roadmap.md) | 路线图、里程碑与**待维护者拍板的关键决策** |

## 一句话结论（详见 03 / 04）

> **首选方案**：以一个**与 GUI 解耦的无头渲染/导出引擎**为核心，前端用 **Web 技术栈（SVG 为原生产物）** 构建编辑器，外壳用 **Tauri** 打包为原生桌面应用；导出经 **resvg** 生成 PNG/JPEG/PDF。
> **强力备选**：**Qt / PySide6 + QGraphicsScene** 原生方案，在「极致精确的矢量直接编辑 + 内置多格式导出」上有独到优势。
>
> 最终拍板的关键问题见 [`docs/06-roadmap.md`](docs/06-roadmap.md) 末尾「待定决策」。

## 开发约定

- 开发分支：`claude/trusting-dijkstra-fo3ntk`
- 所有调研/方案以 Markdown 形式沉淀在 `docs/`，便于团队评审。
