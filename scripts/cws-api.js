import { readFile, realpath } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const EXTENSION_ID = 'kjcbapmmfbemenipkkbiblaifanjljbo';
export const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

export function configuration(env = process.env) {
  const publisher = env.CWS_PUBLISHER_ID;
  const extension = env.CWS_EXTENSION_ID || EXTENSION_ID;
  const publishType = env.CWS_PUBLISH_TYPE || 'STAGED_PUBLISH';
  if (!publisher || !/^[a-zA-Z0-9_-]+$/.test(publisher)) throw new Error('请配置有效 CWS_PUBLISHER_ID');
  if (!/^[a-p]{32}$/.test(extension)) throw new Error('无效 CWS_EXTENSION_ID');
  if (!['STAGED_PUBLISH', 'DEFAULT_PUBLISH'].includes(publishType)) throw new Error('无效 CWS_PUBLISH_TYPE');
  return { name: `publishers/${publisher}/items/${extension}`, publishType };
}

export async function createApi(root, env = process.env, fetchImpl = fetch) {
  const config = configuration(env);
  let credentials;
  try {
    const path = await realpath(env.GOOGLE_APPLICATION_CREDENTIALS);
    const rel = relative(await realpath(root), path);
    if (!rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel)) throw new Error();
    credentials = JSON.parse(await readFile(path, 'utf8'));
    if (credentials.type !== 'service_account' || !credentials.private_key || !credentials.client_email) throw new Error();
  } catch {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS 必须指向仓库外的服务账号 JSON');
  }
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ credentials, scopes: [CWS_SCOPE] });
  return createTransport(config, () => auth.getAccessToken(), fetchImpl);
}

export function createTransport(config, getToken, fetchImpl = fetch) {
  const request = async (method, action, body) => {
    let token;
    try { token = await getToken(); } catch { throw new Error('服务账号认证失败（凭据详情已隐藏）'); }
    if (!token) throw new Error('未获取访问令牌');
    const upload = action === 'upload';
    const url = `https://chromewebstore.googleapis.com/${upload ? 'upload/' : ''}v2/${config.name}:${action}`;
    try {
      const response = await fetchImpl(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(120_000),
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': upload ? 'application/zip' : 'application/json' } : {}) },
        body: body && (upload ? body : JSON.stringify(body)),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      // Never expose auth headers, server body, or transport error details.
      throw new Error(`${action} 请求失败或结果不确定${/^HTTP \d+$/.test(error.message) ? ` (${error.message})` : ''}`);
    }
  };
  return { ...config, status: () => request('GET', 'fetchStatus'), upload: zip => request('POST', 'upload', zip), publish: body => request('POST', 'publish', body) };
}

export function compareVersions(a, b) {
  const parse = value => {
    if (!/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(value) || value.split('.').some(n => +n > 65535)) throw new Error('无效商店版本');
    return value.split('.').map(Number).concat([0, 0, 0]).slice(0, 4);
  };
  const aa = parse(a), bb = parse(b);
  for (let i = 0; i < 4; i++) if (aa[i] !== bb[i]) return Math.sign(aa[i] - bb[i]);
  return 0;
}

export function guardStatus(status, version) {
  if (!status || !status.name) throw new Error('商店状态不完整');
  if (status.takenDown || status.warned) throw new Error('商店存在政策警告，请检查控制台');
  const submitted = status.submittedItemRevisionStatus;
  if (submitted && !['REJECTED', 'CANCELLED'].includes(submitted.state)) throw new Error(`已有提交或未知状态：${submitted.state}`);
  if (['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(status.lastAsyncUploadState)) throw new Error('已有上传处理中');
  for (const revision of [status.publishedItemRevisionStatus, submitted].filter(Boolean)) {
    if (!revision.distributionChannels?.length) throw new Error('商店版本信息缺失');
    for (const channel of revision.distributionChannels) {
      compareVersions(channel.crxVersion, channel.crxVersion);
      if (version !== undefined && compareVersions(version, channel.crxVersion) <= 0) throw new Error(`本地版本必须高于商店版本 ${channel.crxVersion}`);
    }
  }
}

// A write is never retried automatically: fetchStatus cannot identify a draft ZIP by hash.
export async function releaseToStore({ api, artifact, zip, submit = false, save, previous, wait = delay, beforeUpload }) {
  if (previous && !['uploaded', 'submitted'].includes(previous.phase)) throw new Error('上次写请求结果不确定；先运行 status 并人工核对，禁止自动重试');
  if (previous?.phase === 'submitted' && previous.version === artifact.version) throw new Error('此版本已送审');
  const check = async () => {
    const status = await api.status();
    if (status.name !== api.name) throw new Error('商店目标不匹配');
    guardStatus(status, artifact.version);
    return status;
  };
  const initialStatus = await check();
  const decision = await beforeUpload?.(initialStatus);
  if (decision?.skipped) return decision;
  const record = { name: api.name, version: artifact.version, zipSha256: artifact.zipSha256, publishType: api.publishType };
  const write = async (phase, operation) => {
    await save({ ...record, phase });
    try { return await operation(); } catch {
      let status;
      try { status = await api.status(); } catch { /* Keep the uncertain journal. */ }
      await save({ ...record, phase: 'uncertain', status });
      throw new Error(`${phase} 结果不确定；已尝试查询状态，停止写操作，请运行 status 核对`);
    }
  };
  const uploaded = await write('uploading', () => api.upload(zip));
  try {
    if (uploaded.name !== api.name) throw new Error();
    if (uploaded.crxVersion && uploaded.crxVersion !== artifact.version) throw new Error();
    if (['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(uploaded.uploadState)) {
      // Only poll an acknowledged upload from this invocation. Never infer success after a timeout.
      let finished = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        await wait(5000);
        const status = await api.status();
        if (status.name !== api.name) throw new Error();
        if (status.lastAsyncUploadState === 'SUCCEEDED') { finished = true; break; }
        if (!['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'].includes(status.lastAsyncUploadState)) throw new Error();
      }
      if (!finished) throw new Error();
    } else if (uploaded.uploadState !== 'SUCCEEDED' || uploaded.crxVersion !== artifact.version) {
      throw new Error();
    }
  } catch {
    let status;
    try { status = await api.status(); } catch { /* Preserve uncertainty. */ }
    await save({ ...record, phase: 'uncertain', status });
    throw new Error('上传失败、版本不符或异步结果未确认；停止送审，请检查 status/控制台');
  }
  await save({ ...record, phase: 'uploaded' });
  if (!submit) return { uploaded: artifact.version };
  await check();
  const result = await write('submitting', () => api.publish({ publishType: api.publishType, skipReview: false, blockOnWarnings: true }));
  if (result.name !== api.name || !['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(result.state)) throw new Error('送审响应异常；保留状态，请人工核对');
  await save({ ...record, phase: 'submitted', state: result.state });
  return { version: artifact.version, state: result.state, publishType: api.publishType };
}
