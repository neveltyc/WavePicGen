# 05 · 「可编辑波形格式」与命令输入草案

> 目的：给出**文档模型（真相源）**、**原生 DSL（WaveJSON 超集）**与**命令面板**的初步设计。
> 这是 FR-3（可编辑波形格式）、FR-2（命令输入）、IR-4（三向往返）的落地。
>
> ⚠️ 本文是**草案**，用于评审讨论；字段名/语法在动手前还会迭代。两个独立方案在此高度一致：
> 以 JSON 文档模型为真相源、WaveJSON 兼容、并补上**实数时间边沿**与**关系标注一等公民**。

---

## 1. 设计目标与约束

- **人类可读、可手写、可脚本生成、Git diff 友好**（纯文本）。
- **GUI ↔ 模型 ↔ 文本 三向无损往返**：任一视图编辑，其余实时同步。
- **WaveJSON 兼容导入**：已有 WaveDrom 图可直接读入（降低迁移成本，复用既有资产）。
- **补 WaveDrom 硬伤**：边沿时刻支持**实数坐标**（亚周期/异步），不强制对齐周期边界。
- **关系/参数是一等对象**：setup/hold/delay、测量标尺、因果箭头进模型，而非事后装饰。
- **可演进**：模型带 `schemaVersion`，向后兼容。

---

## 2. 文档模型（真相源）核心实体

模型是一棵可序列化（JSON）的对象树。核心实体（字段为草案）：

| 实体 | 职责 | 关键字段（草案） |
| --- | --- | --- |
| `Document` | 画布与全局设置 | `schemaVersion`, `canvas`(尺寸/边距), `timebase`(单位 ns/ps、每周期时长、hscale), `grid`, `head`/`foot`, `skin/theme` |
| `Signal` | 一条信号/总线/分组 | `id`, `name`, `kind`(`clock`/`logic`/`bus`/`spacer`/`group`), `wave` 或 `edges`/`segments`, `period`, `phase`, `style?` |
| `Edge`（跳变） | 一次电平/状态变化 | `t`(**实数时间**), `to`(目标态), `slope?`(上升/下降时间) |
| `Segment`（段） | 一段电平/数据 | `level`(`0`/`1`/`z`/`x`/`weak`) 或 `bus`(数据块+label), `from`/`to`(实数时间) |
| `Relation`（关系/标注） | setup/hold/delay/测量/因果 | `type`(`delay`/`setup`/`hold`/`ruler`/`arrow`), `from`/`to`(锚点), `label`, `style?` |
| `Annotation` | 文本框/辅助线/无效区 | `type`(`text`/`vline`/`hline`/`region`), 几何, `text?`, `style?` |
| `Style/Skin` | 线宽/颜色/字体/过渡 | 线宽、配色、字体、rise/fall 斜率、皮肤名 |

**锚点（anchor）模型**（关系/标注用来「钉」在波形上的引用）：
`signalId @ time`（实数时间）或 `signalId : nodeName`（命名节点），例如 `CLK@2.0`、`DATA:n3`。
关系连接两个锚点，**随波形编辑自动跟随**（这是「一等对象」的价值）。

> 设计要点：**所有几何量带单位与实数精度**；边沿不强制落在整周期；模型自带版本号。

---

## 3. 原生 DSL：WaveJSON 超集（JSON5 / JSONC）

策略：**完全兼容 WaveDrom 的 `signal[].wave` 写法**（可直接导入），在其上**叠加扩展字段**表达我们独有的能力。
用 JSON5/JSONC（允许注释、尾逗号、无引号键）提升手写体验。

```jsonc
{
  // —— 与 WaveDrom 兼容的部分（可直接导入既有图）——
  signal: [
    { name: 'clk',  wave: 'P........' },
    { name: 'data', wave: 'x.==.=x..', data: ['A', 'B', 'C'] },
    { name: 'addr', wave: 'x.=...=x.', data: ['0x10', '0x14'] },

    // —— 扩展①：亚周期/异步边沿，实数时间（补 WaveDrom 硬伤）——
    { name: 'irq',  edges: [ { t: 2.75, to: 1 }, { t: 6.4, to: 0 } ] },

    // 分组（WaveDrom 风格保留）
    ['ctrl',
      { name: 'we', wave: '0.1..0...' },
      { name: 're', wave: '01....0..' },
    ],
  ],

  // —— 扩展②：关系/标注一等公民（参考 TimeGen/TimingDesigner）——
  relations: [
    { type: 'delay', from: 'clk@2',   to: 'data@2.3', label: 'tCO'   },
    { type: 'setup', from: 'data@2',  to: 'clk@2.0',  label: 'tSU'   },
    { type: 'hold',  from: 'clk@2.0', to: 'data@2.6', label: 'tH'    },
    { type: 'ruler', from: 'clk@1',   to: 'clk@2',    label: '10 ns' },
  ],

  // —— 扩展③：注释 ——
  annotations: [
    { type: 'text',  at: { x: 5, y: 0 }, text: 'burst write' },
    { type: 'vline', t: 4.0, label: 'T0' },
  ],

  // —— 全局配置（兼容 hscale，扩展时间单位/皮肤）——
  config: { hscale: 1, timeUnit: 'ns', cycleTime: 10, skin: 'manual' },
  head:   { text: 'Figure 1. Write timing', tick: 0 },
}
```

### WaveJSON `wave` 字符集（兼容速查）

逐字符表示一个周期（与 WaveDrom 对齐，便于导入）：

| 字符 | 含义 |
| --- | --- |
| `p` `P` / `n` `N` | 正/负时钟边沿（大写带箭头） |
| `0` `1` | 低/高电平 |
| `x` | 未知态 |
| `z` | 高阻 |
| `u` `d` | 弱上拉 / 弱下拉 |
| `=` / `2`–`5` | 数据段（配 `data[]`，数字代表配色） |
| `.` | 延续上一周期 |
| `\|` | 间隔 / gap（时间压缩） |

> **导入策略**：读到 `wave` 字符串时，parser 把它**展开为内部的 `edges`/`segments`（实数时间）**表示；
> 之后无论 GUI 还是 DSL 编辑，统一在实数模型上操作。导出可选择「回写为 `wave` 紧凑形式」或「展开形式」。

---

## 4. 命令面板：行式命令（参考 Vim ex / VS Code 命令面板）

GUI 内提供命令输入框，命令**直接修改文档模型**，GUI 实时反映；多条命令可存为脚本供 CLI 复用（呼应 FR-2 + IR-3）。

```text
add clock CLK period=10ns duty=50%
add bus   DATA at=12ns segments="A:8,B:8,idle"
add logic IRQ
edge   IRQ at=2.75 to=1            # 亚周期边沿
relate delay from=CLK@2 to=DATA@2.3 label=tCO
relate setup from=DATA@2 to=CLK@2.0 label=tSU
annotate vline t=4.0 label=T0
set    timeUnit=ns cycleTime=10 skin=manual
export png dpi=300 out=fig1.png
export svg out=fig1.svg
```

设计要点：

- 命令是 L3 `commands` 用例的文本入口，与 GUI 按钮调用**同一组用例**（高内聚：业务逻辑只有一份）。
- 命令产生 patch → 进 history（可撤销）→ 触发 layout/svggen 重绘。
- `export ...` 命令复用 L2 `export`，与 CLI 出图完全一致。

---

## 5. 三向往返（round-trip）的一致性约定

```
GUI 画布  ──操作──▶ patch ──▶ 文档模型 ──序列化──▶ DSL 文本（Monaco）
   ▲                              │
   └──────── 反序列化 ◀───── 文本编辑（用户改 DSL）
```

- **规范化（canonical form）**：模型→文本采用稳定的字段顺序与格式化，保证「往返不抖动」（diff 干净）。
- **容错解析**：文本有语法/语义错误时，parser 报错并标注行列（Monaco 内联提示），不破坏当前模型。
- **保留用户意图**：尽量保留注释与紧凑 `wave` 写法（在可行范围内），减少「保存即被改写」的困扰。

---

## 6. 工程文件格式

- 扩展名（草案）：`.wdoc`（WavePicGen document），内容即上面的 JSON 文档模型（可含注释 = JSONC）。
- 也支持直接打开/保存 **WaveJSON**（`.json`）作为兼容格式（导入/导出）。
- 版本化：顶层 `schemaVersion`；升级时由 parser 做迁移。

---

## 7. 待评审的开放问题（格式层面）

1. **DSL 形态**：坚持「JSON 超集（声明式）」即可，还是再提供一套更紧凑的**纯文本 DSL**（非 JSON，类似自定义语言）？（建议：先 JSON 超集，够用且易往返。）
2. **实数边沿与 `wave` 紧凑写法的混用边界**：同一信号能否既有 `wave` 又有 `edges`？（建议：导入后统一为实数模型；`wave` 仅作输入糖。）
3. **关系锚点语法**：`CLK@2.0`（按时间）与 `DATA:n3`（按命名节点）是否都要？（建议：两者都要，时间为主、节点为辅。）
4. **皮肤/主题机制**：参考 WaveDrom skin，做成可插拔样式包？
5. **单位与时基**：`timeUnit` + `cycleTime` 的组合是否足够，还是需要更完整的时间轴模型（多时钟域）？

> 这些问题不阻塞架构选型，可在 P1（格式/DSL 阶段）逐条敲定。
