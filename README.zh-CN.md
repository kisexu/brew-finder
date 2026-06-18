# 🍺 Brew Finder

语言：简体中文 | [English](README.md)

一款 Chrome 浏览器插件，自动检测当前访问的软件网站是否有对应的 Homebrew 包，并快捷复制 `brew install` 安装命令。

## 功能 & 特性

- **自动发现** — 当你访问相关站点的时候，扩展会自动检查该域名下相关的包，通过徽标或浮窗的提示你
- **快捷操作** — 支持 Homebrew 包基础信息查看、一键复制安装命令。涵盖官方 formula 和 cask 包
- **大站点适配** — 特别是像 Google.com 之类的域名，下面关联了上千个包。我们合理地帮助用户发现需要包，同时又减少对用户正常访问的干扰
- **GitHub 匹配** — 访问 `github.com/user/repo` 也能识别对应 Homebrew 包
- **绝对隐私安全** — 本扩展不包含任何联网功能。所有包信息经清洗后整合到扩展内，同时保持了安装包的精简。

## 鸣谢 & 数据源

- [Homebrew](https://brew.sh/)
- [Homebrew API](https://formulae.brew.sh/docs/api/)
