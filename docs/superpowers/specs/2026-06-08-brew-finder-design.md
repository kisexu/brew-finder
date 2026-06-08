# Brew Finder — 设计文档

> 日期：2026-06-08
> 状态：设计完成，待实现

## 概述

Brew Finder 是一款 Chrome 浏览器插件，当用户访问软件官网时，自动检测该软件是否有对应的 Homebrew 包，并提醒用户可以通过 `brew install` 安装。

**解决的问题：**
- 信息差：访问软件官网时，不知道该软件是否已被收录为 Homebrew 包
- 安装繁琐：省去手动下载、拖拽安装等步骤，直接用 brew 一键搞定
- 统一管理：所有软件通过 Homebrew 统一管理，方便升级、卸载、备份

**数据规模：**
- ~8,355 Formulae（命令行工具）+ ~7,645 Casks（GUI 应用）= ~16,000 包
- 覆盖 ~5,000-6,000 个独立域名
- 87% 的域名只对应 1 个包，匹配精度高

## 项目结构

```
brew-finder/
├── scripts/                    # 数据构建管道
│   ├── build-maps.js           # 主脚本：拉取 API → 生成映射
│   └── filters.js              # 域名过滤规则
├── data/                       # 生成的映射数据（提交到仓库）
│   ├── domain-map.json         # 域名 → 包名
│   ├── github-map.json         # user/repo → 包名
│   └── metadata.json           # 构建时间、包数量等元信息
├── extension/                  # Chrome 插件（Manifest V3）
│   ├── manifest.json
│   ├── background/
│   │   └── service-worker.js   # 核心：加载映射、查表匹配
│   ├── content/
│   │   └── overlay.js          # 页面内浮层渲染
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js            # 点击图标弹窗
│   ├── options/
│   │   ├── options.html
│   │   └── options.js          # 设置页面
│   └── icons/
│       └── icon-16/32/48/128.png
├── docs/
│   └── superpowers/specs/      # 设计文档
├── package.json                # 仅用于 scripts/ 的依赖
└── .gitignore
```

**关键决策：**
- Monorepo，`scripts/` 和 `extension/` 在同一仓库，互不依赖
- 映射数据（`data/`）提交到仓库，随插件一起打包
- 插件零依赖，原生 JS；数据脚本用 Node.js

## 数据构建管道

### 数据流

```
Homebrew API  →  build-maps.js  →  filters.js  →  domain-map.json
(GET 全量)       (解析 homepage)    (过滤无效域名)    github-map.json
                                                   metadata.json
```

### build-maps.js

1. **拉取全量数据** — 并发请求 `formula.json` 和 `cask.json`（各 ~30s）
2. **提取域名** — 从每个包的 homepage URL 解析出域名
3. **分类处理**
   - `github.com` → 提取 `user/repo` 路径，写入 `github-map.json`
   - 其他域名 → 写入 `domain-map.json`
4. **过滤** — 排除无效域名
5. **输出** — 写入 `data/` 目录，同时生成 `metadata.json`

### 映射数据结构

```json
// domain-map.json
{
  "www.docker.com": [{ "name": "docker", "type": "formula", "desc": "Pack, ship and run..." }],
  "iterm2.com": [{ "name": "iterm2", "type": "cask", "desc": "Terminal emulator..." }]
}

// github-map.json
{
  "docker/cli": [{ "name": "docker", "type": "formula", "desc": "Pack, ship and run..." }],
  "FFmpeg/FFmpeg": [{ "name": "ffmpeg", "type": "formula", "desc": "A complete solution..." }]
}

// metadata.json
{
  "buildTime": "2026-06-08T00:00:00Z",
  "formulaCount": 8355,
  "caskCount": 7645,
  "domainCount": 5600,
  "githubRepoCount": 3368
}
```

### 过滤规则（filters.js）

- **排除域名：** `web.archive.org`、`packages.debian.org`、`archive.org`
- **排除无效 URL：** 非 http(s) 协议、空 homepage
- **一个域名多个包：** 保留所有包，用数组存储

## Chrome 插件架构

### 架构选型：Service Worker 集中匹配

- Content Script 提取域名 → 发送给 Service Worker → SW 查表匹配 → 返回结果 → CS 渲染浮层 + 更新 Badge
- 映射数据只在 SW 中加载一次，内存效率高
- 匹配逻辑集中，易维护

### Manifest V3 配置

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": [],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [{
    "matches": ["http://*/*", "https://*/*"],
    "js": ["content/overlay.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": "icons/icon-48.png"
  },
  "options_page": "options/options.html"
}
```

- `activeTab` — 访问当前标签页 URL（最小权限）
- `storage` — 存储用户设置
- `scripting` — 备用注入
- 不需要 `host_permissions`，数据打包在插件内

### 消息协议

```
Content Script → Service Worker:
  { type: "MATCH_URL", domain: "www.docker.com", url: "https://www.docker.com/products/" }

Service Worker → Content Script:
  { type: "MATCH_RESULT", matches: [{ name: "docker", type: "formula", desc: "..." }] }

Content Script → Service Worker:
  { type: "OVERLAY_DISMISSED", permanent: false }
  { type: "OVERLAY_DISMISSED", permanent: true }
```

### Service Worker 生命周期

- **启动时** — 加载映射 JSON 到内存（~500KB）
- **收到 MATCH_URL** — 判断域名是否为 github.com，选择对应 map 查找
- **SW 被回收后** — Chrome 唤醒时重新加载映射数据
- **Badge 更新** — 有匹配时显示数字，无匹配时清除

## 匹配逻辑

### 流程

1. 解析 URL：`new URL(url)`
2. 判断域名：
   - `github.com` → 从 pathname 提取 `user/repo`，查 `github-map.json`
   - 其他 → 用 hostname 查 `domain-map.json`
3. 返回匹配结果（数组，可能多个）

### GitHub 匹配细节

- 从 pathname 提取前两段作为 `user/repo` key
- 跳过特殊路径：`/topics/`、`/trending`、`/settings`、`/notifications` 等
- `https://github.com/docker/cli/issues` → key = `docker/cli` ✅
- `https://github.com/docker` → 无 repo，跳过

### 域名匹配细节

- hostname 精确匹配，不做归一化
- `www.docker.com` ≠ `docker.com`（映射构建时已使用 homepage 原始域名）
- 一个域名多个包时全部返回

## UI 组件

### Badge 徽标

- 有匹配时在图标上显示匹配数量
- 无匹配时不显示
- 可在设置中关闭

### Popup 弹窗

**有匹配时：**
- 包名
- 类型标签（formula / cask）
- 简介（desc）
- `brew install xxx` 命令 + 一键复制按钮
- 底部显示当前页面域名

**无匹配时：**
- 显示"当前网站未找到 Homebrew 包"提示

### 页面内浮层

- 右下角小卡片，包含 brew 命令和复制按钮
- 默认开启，可在设置中关闭
- 用户点击 ✕ 关闭时：
  - **首次关闭** — 弹出确认："是否永久关闭页面浮层？"
  - 选择"永久关闭" → 存储设置，后续不再显示
  - 选择"仅本次" → 仅关闭当前浮层

## 设置页面

通过 `chrome://extensions` → 详情 → 扩展程序选项访问。

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| Badge 徽标 | 在插件图标上显示匹配数量 | 开启 |
| 页面浮层 | 在页面右下角显示安装提醒 | 开启 |
| 重置浮层关闭状态 | 恢复浮层的"永久关闭"提示 | — |
| 数据信息 | 只读：映射版本、包数量、域名数 | — |

存储使用 `chrome.storage.local`，SW 监听 `chrome.storage.onChanged` 实时响应。

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 映射数据加载失败 | 静默失败，Badge 不显示，Popup 显示"数据加载中..."，下次 SW 唤醒时重试 |
| Content Script 通信超时（3s） | 浮层不显示，Badge 和 Popup 仍可正常工作 |
| chrome.storage 读取失败 | 使用默认设置（Badge 开启、浮层开启） |
| 特殊页面（chrome://, about:, file://） | Content Script 不注入，无浮层 |
| 映射数据为空或损坏 | 检查 JSON 解析，失败则跳过匹配 |

## 测试策略

**单元测试（scripts/）：**
- build-maps.js — 域名提取、过滤规则、映射生成
- filters.js — 各种域名的过滤行为
- 用 vitest

**单元测试（extension/）：**
- 匹配逻辑 — URL 解析、域名查找、GitHub 路径处理
- 消息协议 — 发送/接收格式
- 用 vitest + chrome mock

**手动测试：**
- 在 chrome://extensions 中加载未打包插件
- 访问已知网站验证匹配（docker.com, iterm2.com, github.com/FFmpeg/FFmpeg）
- 验证 Badge、Popup、浮层的交互
- 验证设置页面的开关逻辑

## 技术栈

- **数据管道：** Node.js + vitest
- **Chrome 插件：** 原生 JS + HTML/CSS，Manifest V3，零依赖
- **数据源：** Homebrew Formulae API（https://formulae.brew.sh）
