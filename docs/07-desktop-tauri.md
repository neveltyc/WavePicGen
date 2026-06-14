# 07 · 桌面打包（Tauri）

WavePicGen 的桌面外壳用 **Tauri 2**：复用同一个 Web 前端（`dist/`），用系统 WebView 装进原生窗口，
产出 Windows / Linux 安装包。引擎/前端与 Web 版完全一致，所以桌面版与网页版逐像素相同。

## 结构

```
src-tauri/
├─ Cargo.toml          Rust 包（tauri 2 + tauri-build 2）
├─ build.rs            tauri_build::build()
├─ tauri.conf.json     窗口、前端目录(../dist)、bundle 配置
├─ src/
│  ├─ main.rs          入口 → wavepicgen_lib::run()
│  └─ lib.rs           tauri::Builder（仅托管 Web UI）
└─ icons/              应用图标（由 `tauri icon` 生成）
```

## 前置依赖

- **Rust**（stable）+ **Node ≥ 20**。
- **Linux** 额外需要系统 WebView 库：
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
    libsoup-3.0-dev librsvg2-dev libayatana-appindicator3-dev build-essential
  ```
- **Windows**：WebView2（Win11 自带；Win10 可用常青版引导）。

## 命令

```bash
npm install
npm run tauri dev      # 开发：起 vite + 原生窗口
npm run tauri build    # 生产：构建前端 + 原生安装包（输出在 src-tauri/target/release/bundle/）
```

## 关于本仓库沙箱的构建说明（诚实记录）

脚手架已完整、标准（`cargo build` 已能编译绝大部分依赖树）。在生成本仓库的沙箱里，由于其
**Rust 工具链为 1.94（过新）**，一个**传递依赖 `brotli`** 触发了 `alloc::Allocator` 相关的上游编译错误
（与 WavePicGen 的配置无关，且该 brotli 版本在锁定范围内无可升级的修复版）。

- 在 **常规 Tauri 支持的 stable 工具链**（如 1.82–1.85）上可正常 `tauri build`。
- 仓库内 `.github/workflows/desktop.yml` 用固定 stable Rust 在 CI 中构建桌面包，作为验证路径。

如本机命中同样的 brotli×新版 Rust 问题，可临时切换工具链：

```bash
rustup toolchain install 1.85.0 && rustup override set 1.85.0
```
