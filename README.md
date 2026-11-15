# 📕 小红书翻页视频扒图助手 (XHS Page-Flip Extractor)

[![Build Android APK](https://img.shields.io/badge/GitHub_Actions-自动编译安卓_APK-ff2442?logo=android&logoColor=white)](./.github/workflows/build-apk.yml)
[![PWA Ready](https://img.shields.io/badge/PWA-支持添加至手机主屏幕-10b981?logo=googlechrome&logoColor=white)](./manifest.json)
[![Zero Dependency](https://img.shields.io/badge/零依赖-Windows_双击即用-3b82f6?logo=windows&logoColor=white)](./启动翻页扒图工具.bat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

专门针对小红书上常见的**「翻书/翻页特效视频」、「图文配乐轮播视频」及「手机录屏文件」**设计的智能逐页扒图工具，支持 **Windows 桌面端 + 手机端 PWA + 原生安卓 APK**。

---

## 💡 解决什么痛点？

小红书上很多书单分享、干货合集、备忘录语录笔记并不是「左右滑动的图文」，而是做成了一段**带 3D 翻书、滑页转场配乐的视频**：
- 手动暂停截图极易截到**半翻页残影**，或者被进度条、倍速浮层挡住；
- 普通按固定秒数抽帧工具，要么一页截出好几张重复图，要么卡在翻页动画中间；
- 手机录屏上下带有系统状态栏和底部评论栏，存下来还要一张张手动裁剪。

本工具通过 **帧间运动静止期（Plateau）检测 + 边缘清晰度峰值选帧 + 局部文字感知去重算法**，全自动跳过翻页转场动画，把每一页停稳后的最清晰原画一页一页扒下来！

---

## ✨ 核心功能

- 🧠 **智能翻页静止期检测**：自动扫描全片帧间运动曲线（可视化展示红色翻页波峰与绿色提取点），在每页停稳区间内挑选锐度最高的一帧截取原画。
- 📝 **同背景模板防误删**：针对书单/语录视频「背景纸张完全相同、仅中间文字变化」的场景，采用全局均值 + 前 15% 最大变化块混合指纹，确保不同文字页绝不漏抓。
- ✂️ **手机录屏一键上下裁边**：实时预览顶部/底部裁切遮罩，导出时自动切掉手机状态栏、底部评论区或黑边。
- 🔍 **单页 `±0.1s` 微调与手动补抓**：每张提取出的卡片均支持 `-0.1s` / `+0.1s` 微调重抓、点击时间戳跳转视频、全屏大图对比。
- 📱 **全平台支持（PC + 手机 PWA + 安卓原生 APK）**：
  - **安卓 APK 原生特性**：支持在小红书 App 直接点 **「分享 → 更多 → 用翻页扒图助手提取图片」** 系统级唤起，并通过 Android `MediaStore` 一键将所有图片直接写入手机系统相册 `Pictures/小红书扒图/`。
  - **手机 PWA / 离线单文件版**：免安装直接用手机浏览器打开，支持通过系统分享面板批量存图或打包下载 `.zip`。

---

## 🚀 快速使用指南

### 1. 安卓手机端使用（3 种方式任选）

- **方式 A：直接下载安卓安装包 `.apk`（推荐）**
  - 代码推送到 GitHub 后，GitHub Actions 会自动编译签名出安卓安装包。直接前往仓库右侧的 **[Releases 页面](../../releases)** 或 **Actions** 页面下载 `小红书翻页扒图助手.apk` 安装到手机即可。
- **方式 B：在线网页 / PWA 桌面 App**
  - 在仓库 `Settings -> Pages` 中将 Source 设为 `GitHub Actions`，即可通过 `https://<你的用户名>.github.io/<仓库名>/` 在手机浏览器直接打开并「添加到主屏幕」。
- **方式 C：手机离线单文件版**
  - 下载仓库根目录的 [`小红书翻页扒图_手机离线版.html`](./小红书翻页扒图_手机离线版.html) 发到手机上，用浏览器打开即可 100% 离线从相册选视频扒图。

### 2. Windows 电脑端使用（零依赖）

1. 下载本仓库代码到本地；
2. 直接双击运行 **[`启动翻页扒图工具.bat`](./启动翻页扒图工具.bat)**（基于 Windows 内置 PowerShell，无需安装 Python 或 Node.js）；
3. 浏览器会自动打开 `http://127.0.0.1:18765/`，同时开启局域网手机扫码通道（`http://局域网IP:18766/`）。

---

## 📂 项目目录结构

```text
├── index.html                      # Web / PWA 主界面（自适应 PC 与手机底部导航栏）
├── style.css                       # 响应式样式表
├── app.js                          # 智能翻页静止期检测算法、QR 二维码生成、ZIP 打包器
├── manifest.json / sw.js / icon.svg# PWA 桌面安装清单、离线 Service Worker 与图标
├── server.ps1                      # Windows 本地零依赖服务（小红书链接解析 + 局域网转发 + 文件夹直存）
├── 启动翻页扒图工具.bat            # Windows 双击一键启动脚本
├── 一键编译安卓APK.bat             # 本地一键打包签名 Android APK 脚本
├── 小红书翻页扒图_手机离线版.html  # 独立单文件离线移动版
├── android-app/                    # 原生 Android 工程（支持小红书系统分享直达 + MediaStore 相册直存）
└── .github/workflows/              # GitHub Actions 自动云端编译 APK & 自动部署 GitHub Pages
```

## 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
