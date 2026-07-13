# 数据构建与发布

`data/` 和 `extension/data/` 都是生成产物，不再由 Git 跟踪。旧提交中的数据不做历史重写。

## 本地构建

联网构建沿用原命令：

```bash
npm run build:maps
npm run build:extension
```

如需保存本次 Homebrew API 原始输入：

```bash
npm run build:maps -- --input-dir .build/inputs
```

使用已保存的输入离线重建：

```bash
npm run build:maps -- \
  --formula-file .build/inputs/formula.json \
  --cask-file .build/inputs/cask.json \
  --build-time 2026-07-13T00:00:00.000Z
```

构建器会进行有限重试和超时控制、输入结构检查、稳定排序、绝对计数下限检查，并把原始输入及功能映射的 SHA-256 写入 `data/metadata.json`。传入 `--baseline-metadata <file>` 时，任何核心计数相对上次成功构建变化超过 20% 都会失败。阈值可用 CLI 参数调整；完整参数可查看 `scripts/build-maps.js` 中的 `parseCli`。

## GitHub Actions

`.github/workflows/update-brew-data.yml` 必须存在于默认分支 `main` 才能接收定时和手动触发：

- 每周五 10:17（Asia/Shanghai）固定当时的 `develop` SHA，测试并构建 ZIP，只上传保留 10 天的 Actions artifact。
- 手动运行时输入明确的 `develop` commit SHA；同样构建并校验，成功后额外创建 GitHub Release。
- Release tag 使用 `vA.B.C-data.N`，ZIP 内 manifest 使用 `A.B.C.N`，`version_name` 使用 `A.B.C · data YYYY-MM-DD`。
- Release 长期保存扩展 ZIP、ZIP checksum 和构建 metadata；短期 artifact 还包含压缩后的原始 Homebrew 输入，便于复验。

ZIP 从 `extension/` 目录内部创建，因此 `manifest.json` 位于压缩包根目录。手动发布会将 Release/tag 指向构建时记录的不可变源码 SHA。

## 暂不包含的发布步骤

当前 workflow 不上传 Chrome Web Store。待数据构建稳定后，再单独增加 Chrome Web Store API V2、Service Account + GitHub OIDC，以及受人工审批保护的 GitHub Environment 发布 job。
