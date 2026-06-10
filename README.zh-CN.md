# 🍺 Brew Finder

语言：简体中文 | [English](README.md)

一款 Chrome 浏览器插件，自动检测当前访问的软件网站是否有对应的 Homebrew 包，并提醒你可以通过 `brew install` 安装。

## 功能

- **Badge 徽标** — 检测到匹配时在插件图标上显示数量
- **Popup 弹窗** — 点击图标查看包名、类型、简介，一键复制安装命令
- **页面浮层** — 匹配时右下角浮层提醒，支持一键复制
- **GitHub 匹配** — 访问 `github.com/user/repo` 也能识别对应 Homebrew 包
- **设置页面** — 控制 Badge、浮层开关，重置浮层关闭状态

## 数据覆盖

| 类型 | 数量 |
|------|------|
| Formulae（命令行工具） | 8,409 |
| Casks（GUI 应用） | 7,706 |
| 覆盖域名 | 7,060 |
| GitHub 仓库 | 4,234 |

## 项目结构

```text
brew-finder/
├── scripts/                    # 数据构建管道
│   ├── build-maps.js           # 从 Homebrew API 生成域名映射
│   ├── filters.js              # 域名过滤规则
│   └── __tests__/              # 数据管道测试
├── data/                       # 生成的映射数据
│   ├── domain-map.json         # 域名 → 包名
│   ├── github-map.json         # user/repo → 包名
│   └── metadata.json           # 构建元信息
├── extension/                  # Chrome 插件（Manifest V3）
│   ├── background/             # Service Worker
│   ├── content/                # 页面内浮层
│   ├── popup/                  # 弹窗 UI
│   ├── options/                # 设置页面
│   └── utils/                  # 匹配逻辑 + 存储封装
├── tests/                      # 扩展逻辑测试
└── docs/                       # 设计文档 + 实现计划
```

## 快速开始

### 环境要求

- Node.js >= 18（需要全局 `fetch`）
- Google Chrome

### 安装依赖

```bash
npm install
```

### 构建映射数据

从 Homebrew API 拉取全量数据，生成域名映射 JSON：

```bash
npm run build:maps
```

输出 `data/domain-map.json`、`data/github-map.json`、`data/metadata.json`。

### 构建扩展

将映射数据复制到扩展目录：

```bash
npm run build:extension
```

或一步完成：

```bash
npm run build
```

### 加载扩展

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/` 目录

### 运行测试

```bash
npm test
```

开发模式：

```bash
npm run test:watch
```

## 使用

安装扩展后，访问以下网站测试：

- `https://www.docker.com/` → 匹配 `docker`（formula）
- `https://iterm2.com/` → 匹配 `iterm2`（cask）
- `https://github.com/FFmpeg/FFmpeg` → 匹配 `ffmpeg`（formula）

## 技术栈

- **数据管道：** Node.js + vitest
- **Chrome 插件：** 原生 JS + HTML/CSS，Manifest V3，零依赖
- **数据源：** [Homebrew Formulae API](https://formulae.brew.sh)

## 文档

- [设计文档](docs/superpowers/specs/2026-06-08-brew-finder-design.md)
- [实现计划](docs/superpowers/plans/2026-06-08-brew-finder.md)
- [国际化设计文档](docs/superpowers/specs/2026-06-10-brew-finder-i18n-design.md)
- [国际化实现计划](docs/superpowers/plans/2026-06-10-brew-finder-i18n.md)
