# 本地 Chrome Web Store 发布

本地入口独立于 GitHub，不调用 workflow、GitHub Release 或定时任务。需要 Node.js 20+、npm、Git、zip/unzip；首次运行先 `npm ci`。所有构建、锁和状态放在已忽略的 `.build/cws/`。不要把服务账号 JSON 放进仓库。

## 一键更新并送审

先完成下文的服务账号配置，确保仓库根目录存在 `.env.cws`。使用 Node.js 20.6+（需要 `--env-file`）：

```bash
cd /Users/kise/Kise/dev/brew-finder
npm run cws:auto
```

命令自动加载 `.env.cws`，无需 `source`。已有进程环境变量优先于文件中的同名配置。当前本机配置为 `CWS_PUBLISH_TYPE=DEFAULT_PUBLISH`：审核通过后自动上线；使用 `STAGED_PUBLISH` 则审核通过后等待手动发布。

执行顺序：获取本地发布锁 → 检查上次发布记录 → 查询商店状态 → 计算下一编号 → 记录当前已发布版本的包数量 → 运行测试 → 拉取最新 Homebrew 数据 → 检查包数量净增 → 校验并打包 → 再次检查商店版本 → 上传 → 提交审核。整个流程持有同一个锁。

发布前按 `formulaCount + caskCount` 统计包总数（Homebrew formula 与 cask 的总数，不是域名数或 GitHub 仓库数）。新总数减去当前已发布版本总数，**净增不足 5 个就跳过**，包括不变和减少；恰好增加 5 个才继续。跳过以退出码 0 结束，输出 `skipped: true`、基线版本、前后数量和增量，不上传、不送审、不推进发布状态。`cws:auto` 在数据更新后、打包前检查，`cws:upload` / `cws:submit` 也在上传前执行同一门槛；一键流程上传前会重新查询已发布版本以防基线变化。

数量记录存放在 `.build/cws/`：

- `release-<version>.json`：各次上传/提交的目标、版本、ZIP 哈希及包数量。提交完成不代表已发布，必须与商店返回的已发布版本匹配才可作为基线。
- `published.json`：最近一次查询到的已发布版本及对应包数量；多个渠道并存时按其中最大总数比较，确保相对每个已发布版本都至少净增 5 个。
- `package-checks.jsonl`：每次数量比较的追加日志，记录已发布基线、新数量、增量和是否跳过。

旧发布记录没有数量时，会使用 `state.json` 中的目标、版本和 ZIP 哈希匹配本地 `build-*/artifact.json`，核验 ZIP 后从包内 metadata 补齐。找不到对应已发布产物/记录时以非零退出，不能拿最新数据或在审版本代替。请保留这些记录及当前已发布版本的产物；跳过时基线保持不变，下一次会继续累计相对已发布版本的净增长。该门槛也适用于仅代码变更的发布。

版本前三段仍取自 `package.json`。在商店所有已发布/已拒绝/已取消 revision 的渠道版本及本地上次上传/提交记录中，取相同基础版本的最大第四段加一。例如商店为 `0.1.0.2`，下次为 `0.1.0.3`；源码基础版本提升为 `0.2.0` 后从 `0.2.0.1` 开始。源码基础版本落后或编号超过 65535 时停止，要求人工更新源码版本。

已有在审、待手动发布、上传中状态或政策警告时，在构建前停止。上次写请求结果不确定时也停止，不自动重试。上传前、送审前沿用原有状态检查。失败以非零退出码结束，定时任务应保存日志并报告失败；有在审版本时的停止也属于非零退出。

定时任务使用同一条命令即可：

```bash
cd /Users/kise/Kise/dev/brew-finder && npm run cws:auto
```

调度器的 `PATH` 必须能找到 Node.js、npm、git、zip 和 unzip（特别是通过 nvm 安装 Node.js 时）。该命令不创建定时任务。每次成功运行都会保留 `.build/cws/build-*` 中的 ZIP、原始数据和构建记录；请按需归档历史构建。可选传入 `--baseline-metadata /absolute/path/metadata.json`，对指定基线执行 20% 计数变化校验；未提供时仍执行绝对计数下限和哈希校验。

`auto` 不接受 `--build-number`、`--artifact` 或离线输入文件；只构建不上传请继续使用下面的 `cws:dry-run` 命令。

## 无凭据构建

```bash
npm run cws:dry-run -- --build-number 17
# 或同样只构建的命令
npm run cws:build -- --build-number 17
```

两者都会运行 `npm test`，复制已跟踪的扩展源文件到独立 staging，复用 `build:maps`、`build:extension`、`release:version`，生成根目录含 manifest 的 ZIP、SHA-256 文件和 `artifact.json`。保留工作区已跟踪文件的未提交改动；未跟踪扩展文件不打包，符号链接和疑似凭据被拒绝。源 manifest、原有 `data/` 和 `extension/data/` 不会被覆盖。

不初始化认证、不调用任何商店接口。默认仍需要联网获取 Homebrew 数据；离线复验可传入已保存输入：

```bash
npm run cws:dry-run -- --build-number 17 --date 2026-11-13 \
  --formula-file /path/to/formula.json --cask-file /path/to/cask.json \
  --baseline-metadata /path/to/previous/metadata.json
```

输入必须满足现有数据构建器的计数下限。baseline 可选，提供后核心计数变化超过 20% 会失败。原始输入保存在本次 staging 的 `inputs/`，不进入 ZIP。版本为 package.json 的 `A.B.C` 加显式 `--build-number N`（1–65535），不查询 GitHub。日期默认 UTC 当天；`--date` 用于显示版本名。构建记录源码 SHA、工作区是否有改动、ZIP 和 manifest 哈希及数据 metadata。dry-run 不验证商店当前版本，真正写入前会验证。

## 配置服务账号

1. Google Cloud 项目启用 Chrome Web Store API，创建服务账号和 JSON 密钥。
2. 在 Chrome Web Store Developer Dashboard 的 Account 中关联服务账号邮箱，在 Publisher > Settings 查找 publisher ID。
3. JSON 保存在仓库外并限制文件读取权限。真实路径（包括符号链接解析后）必须在仓库外。
4. 复制 `.env.cws.example` 为 `.env.cws`，填写 ID 和 JSON 的绝对路径。分步命令需手动加载本地配置（`cws:auto` 会自动加载）：

```bash
set -a
source .env.cws
set +a
npm run cws:status
```

认证使用 `google-auth-library` 获取 `https://www.googleapis.com/auth/chromewebstore` scope 的短期令牌。程序不打印密钥、令牌、认证错误详情或 API 错误响应体。`status` 只调用 GET fetchStatus，不构建、不修改本地发布状态、不调用商店写接口。API 只能更新已有条目；商店资料和隐私信息需在控制台准备好。

## 上传及送审（会写商店）

使用 build/dry-run 最后输出的 `artifact` 路径：

```bash
# 只上传，不送审
npm run cws:upload -- --artifact .build/cws/build-XXXXXX/artifact.json

# 上传此 ZIP 并送审；即使之前 upload 过，也重新上传同一产物确认版本
npm run cws:submit -- --artifact .build/cws/build-XXXXXX/artifact.json
```

默认显式发送 `publishType: STAGED_PUBLISH`，通过审核后留待控制台人工发布。如果明确希望审核通过后直接上线，才设置 `CWS_PUBLISH_TYPE=DEFAULT_PUBLISH`。请求固定 `skipReview: false`、`blockOnWarnings: true`，不跳过审核，不取消审核，也不提供“发布已有 staged 版本”功能。

上传前重新核对 ZIP、manifest、数据和版本哈希，并比较商店各 distribution channel 的版本；本地必须更高。已有 `PENDING_REVIEW`、`STAGED`、其他未识别提交状态、进行中的上传或政策警告时停止。上传后、publish 前再检查一次。不同机器或控制台不会共享本地锁，请勿同时操作同一个条目。

## 超时、异步上传与恢复

每次 API 请求有 120 秒超时。写请求前将目标、版本、ZIP 哈希和操作阶段原子保存到 `.build/cws/state.json`。任何写请求失败或超时，都先尝试 GET fetchStatus 并保留结果，然后停止，不自动重复 POST。进程崩溃留下的 uploading/submitting 状态同样阻止再次写入。

同步上传必须返回 `SUCCEEDED` 且 `crxVersion` 与本地一致，才能自动送审。收到本次上传明确的 `IN_PROGRESS` 响应时，每 5 秒查询一次状态，最多 12 次；确认 `lastAsyncUploadState: SUCCEEDED` 后继续，失败或仍不明确则停止。异步响应可能没有 `crxVersion`，版本以已校验并上传的 ZIP 为准。fetchStatus 不提供草稿 ZIP 哈希，因此上传超时后即便查询得到 SUCCEEDED 也不会自动继续（可能属于之前的上传）。可反复运行 `cws:status` 查看进展，并到控制台核对该版本。

恢复步骤：先运行 status，再核对控制台版本、上传结果和本地 artifact；有在审或 staged 版本时等待/在控制台人工处理。只有确认不存在未完成写请求且理解上次操作结果后，才将 `state.json` 移走归档并重新操作；不要仅因超时删除状态。锁文件 `.build/cws/lock` 包含进程 PID，崩溃后确认进程退出才可移除。正常退出会自动释放锁。商店状态仍有歧义时不要重试上传。

## 官方接口依据

- [服务账号配置](https://developer.chrome.com/docs/webstore/service-accounts)
- [认证与完整上传流程](https://developer.chrome.com/docs/webstore/using-api)：POST `/upload/v2/publishers/{publisher}/items/{item}:upload`，ZIP 作为二进制请求体。
- [upload 响应](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload)：`crxVersion`、`uploadState`。
- [fetchStatus](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)：published/submitted revision、distributionChannels 中的 `crxVersion`、`lastAsyncUploadState`。
- [publish](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)：`publishType`、`skipReview`、`blockOnWarnings`；响应 `state`。
- [ItemState](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/ItemState) 和 [UploadState](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/UploadState)。upload 页面正文仍有 `UPLOAD_IN_PROGRESS` 的旧称；枚举和使用指南采用 `IN_PROGRESS`，脚本保守识别两者。
