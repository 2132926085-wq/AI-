/**
 * label-template-demo/server.mjs
 * 本地作品演示：复刻 AI 智能模板生成器页面 + mock API。
 * 零依赖（Node 内置 http/fs/path/crypto）。
 * 仅用于作品展示，使用脱敏示例数据。
 *
 * 启动：node label-template-demo/server.mjs   （默认端口 8790）
 * 访问：http://127.0.0.1:8790/label_template/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  DEMO_IMAGE_CATEGORIES,
  DEMO_LANDMARK_GROUPS,
  DEMO_AUDIO_RESULT,
  DEMO_POINTCLOUD,
  DEMO_PROFILES,
} from './demoData.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8790);
const BASE = '/label_template';
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-uploads-'));

/* ==================== MIME ==================== */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

/* ==================== 工具函数 ==================== */
function json(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req, limit = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function parseMultipart(buf, boundary) {
  const result = { fields: {}, files: [] };
  if (!boundary) return result;
  const marker = `--${boundary}`;
  const parts = buf.toString('latin1').split(marker);
  for (const part of parts) {
    if (!part || part === '--' || part === '\r\n' || part === '\n') continue;
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerBlock = part.slice(0, headerEnd);
    const body = part.slice(headerEnd + 4);
    const nameMatch = headerBlock.match(/name="([^"]*)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = headerBlock.match(/filename="([^"]*)"/);
    if (filenameMatch) {
      const filename = Buffer.from(filenameMatch[1], 'latin1').toString('utf8');
      const data = Buffer.from(body.replace(/\r\n$/, ''), 'latin1');
      result.files.push({ name, filename, data });
    } else {
      result.fields[name] = body.replace(/\r\n$/, '').trim();
    }
  }
  return result;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* ==================== 演示用户 ==================== */
const DEMO_USER = { id: 1, email: 'demo@example.com', username: 'demo', is_admin: true };

function authCookieHeaders(extra = {}) {
  return {
    'Set-Cookie': [
      'demo_auth=1; Path=/; Max-Age=86400; SameSite=Lax',
      'demo_logout=; Path=/; Max-Age=0',
      ...(extra.setCookie || []),
    ],
  };
}

/* ==================== 数据组装 ==================== */
function imageParseResult() {
  const extracted = {
    numbering_mode: 'by_category',
    numbering_mode_item: 'by_instance',
    auto_ocr: 'true',
    shape_label_visibility: 'true',
    is_fill: 'true',
    fill_opacity: '0.2',
    border_opacity: '1',
    label_mode: 'hide',
    point_label_mode: 'always',
    relationship_mode: 'always',
    auto_snap: 'false',
    auto_snap_point: 'true',
    auto_tracking: 'true',
    attr_valid_check: 'true',
    item_count_check: 'true',
    submit_check: 'true',
  };
  return {
    categoryGroups: DEMO_IMAGE_CATEGORIES,
    globalConfig: null,
    frameConfig: null,
    frameConfigCommon: null,
    extractedConfig: extracted,
    questionType: ['Redundant object', 'Missed object', 'Wrong category', 'Wrong attribute'],
  };
}

function landmarkParseResult() {
  return {
    categoryGroups: DEMO_LANDMARK_GROUPS,
    globalConfig: null,
    frameConfig: null,
    frameConfigCommon: null,
    extractedConfig: {},
    questionType: ['多标', '漏标', '漏点', '属性错误'],
  };
}

function audioParseResult() {
  return {
    categoryGroups: [],
    globalConfig: null,
    frameConfig: null,
    frameConfigCommon: null,
    extractedConfig: {},
    questionType: DEMO_AUDIO_RESULT.questionType || [],
    __audioResult: DEMO_AUDIO_RESULT,
  };
}

function pointCloudParseResult(templateType) {
  const pc = DEMO_POINTCLOUD[templateType] || DEMO_POINTCLOUD.POINT_CLOUD_SEMANTIC_SEGMENTATION;
  return {
    categoryGroups: [],
    globalConfig: null,
    frameConfig: null,
    frameConfigCommon: null,
    extractedConfig: {},
    questionType: pc.questionType || [],
    __pointCloudResult: pc,
  };
}

function parseResultFor(templateType) {
  if (templateType === 'LANDMARK_ANNOTATION') return landmarkParseResult();
  if (templateType === 'MULTI_CHANNEL_TRANSCRIPTION') return audioParseResult();
  if (templateType === 'POINT_CLOUD_SEMANTIC_SEGMENTATION' ||
      templateType === 'POINT_CLOUD_STATIC_OBSTACLE' ||
      templateType === 'POINT_CLOUD_DYNAMIC_OBSTACLE') {
    return pointCloudParseResult(templateType);
  }
  return imageParseResult();
}

function profileFor(templateType) {
  if (templateType === 'LANDMARK_ANNOTATION') return DEMO_PROFILES.LANDMARK_ANNOTATION;
  if (templateType === 'MULTI_CHANNEL_TRANSCRIPTION') return DEMO_PROFILES.MULTI_CHANNEL_TRANSCRIPTION;
  if (templateType === 'POINT_CLOUD_SEMANTIC_SEGMENTATION') return DEMO_PROFILES.POINT_CLOUD_SEMANTIC_SEGMENTATION;
  if (templateType === 'POINT_CLOUD_STATIC_OBSTACLE') return DEMO_PROFILES.POINT_CLOUD_STATIC_OBSTACLE;
  if (templateType === 'POINT_CLOUD_DYNAMIC_OBSTACLE') return DEMO_PROFILES.POINT_CLOUD_DYNAMIC_OBSTACLE;
  return DEMO_PROFILES.GENERAL_IMAGE_ANNOTATION;
}

/* ==================== 配置记录 ==================== */
function countFields(obj) {
  let total = 0;
  if (Array.isArray(obj)) {
    for (const item of obj) total += countFields(item);
    return total;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (['fields', 'label_config_fields', 'label_config_dynamic_fields'].includes(k) && Array.isArray(v)) {
        total += v.length;
      } else {
        total += countFields(v);
      }
    }
  }
  return total;
}

function classCountFor(templateType, parsed) {
  if (templateType === 'MULTI_CHANNEL_TRANSCRIPTION') return parsed.__audioResult?.ontology?.length || 0;
  if (templateType.startsWith('POINT_CLOUD_')) return parsed.__pointCloudResult?.ontology?.length || 0;
  return parsed.categoryGroups?.length || 0;
}

function recordMeta(templateType, parsed) {
  const config_json = JSON.stringify({
    categoryGroups: parsed.categoryGroups || [],
    globalConfig: parsed.globalConfig || null,
    frameConfig: parsed.frameConfig || null,
    frameConfigCommon: parsed.frameConfigCommon || null,
    audioParseResult: parsed.__audioResult || null,
    pointCloudParseResult: parsed.__pointCloudResult || null,
  });
  return {
    config_json,
    class_count: classCountFor(templateType, parsed),
    field_count: countFields(JSON.parse(config_json)),
    byte_size: Buffer.byteLength(config_json, 'utf8'),
  };
}

let configs = [];
let seq = 0;
function seedConfigs() {
  const now = Date.now();
  const seeds = [
    ['GENERAL_IMAGE_ANNOTATION', 'traffic-light.pdf', imageParseResult()],
    ['LANDMARK_ANNOTATION', 'face-landmark.docx', landmarkParseResult()],
    ['MULTI_CHANNEL_TRANSCRIPTION', 'audio-annotation-book-v0.1.2.docx', audioParseResult()],
    ['POINT_CLOUD_SEMANTIC_SEGMENTATION', 'pointcloud-ground-segmentation.pdf', pointCloudParseResult('POINT_CLOUD_SEMANTIC_SEGMENTATION')],
    ['POINT_CLOUD_STATIC_OBSTACLE', 'static-obstacle-2d3d.pdf', pointCloudParseResult('POINT_CLOUD_STATIC_OBSTACLE')],
    ['POINT_CLOUD_DYNAMIC_OBSTACLE', 'dynamic-obstacle-sample.pdf', pointCloudParseResult('POINT_CLOUD_DYNAMIC_OBSTACLE')],
  ];
  for (const [template_type, source_filename, parsed] of seeds) {
    const meta = recordMeta(template_type, parsed);
    seq += 1;
    configs.push({
      id: seq,
      config_uuid: crypto.randomUUID(),
      title: `${source_filename}-${template_type}`,
      template_type,
      source_filename,
      config_json: meta.config_json,
      class_count: meta.class_count,
      field_count: meta.field_count,
      byte_size: meta.byte_size,
      created_at: new Date(now - (seq * 3600 * 1000)).toISOString(),
      user_id: 1,
      owner_username: 'demo',
      source_file_uuid: null,
    });
  }
}
seedConfigs();

function toListItem(record) {
  return {
    id: record.id,
    config_uuid: record.config_uuid,
    title: record.title,
    template_type: record.template_type,
    source_filename: record.source_filename,
    class_count: record.class_count,
    field_count: record.field_count,
    byte_size: record.byte_size,
    created_at: record.created_at,
    user_id: record.user_id,
    owner_username: record.owner_username,
  };
}

function listConfigs(query) {
  const page = Math.max(1, Number(query.get('page')) || 1);
  const pageSize = Math.max(1, Number(query.get('pageSize')) || 10);
  const templateType = query.get('templateType') || 'all';
  const keyword = (query.get('keyword') || '').toLowerCase();
  let items = configs.slice();
  if (templateType !== 'all') items = items.filter((r) => r.template_type === templateType);
  if (keyword) {
    items = items.filter((r) =>
      (r.title || '').toLowerCase().includes(keyword) ||
      (r.source_filename || '').toLowerCase().includes(keyword) ||
      r.template_type.toLowerCase().includes(keyword),
    );
  }
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize).map(toListItem), total };
}

/* ==================== 上传文件存储 ==================== */
const uploadedFiles = new Map(); // uuid -> { filename, path, size }
function storeUpload(parsed) {
  const file = parsed.files && parsed.files[0];
  const uuid = crypto.randomUUID();
  const filename = (file && file.filename) || 'uploaded-file';
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const target = path.join(UPLOAD_DIR, uuid + path.extname(safeName));
  if (file && file.data.length > 0) fs.writeFileSync(target, file.data);
  else fs.writeFileSync(target, `demo placeholder for ${filename}`);
  uploadedFiles.set(uuid, { filename, path: target, size: file ? file.data.length : 0 });
  return uuid;
}

/* ==================== 路由 ==================== */
async function handleApi(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;
  const query = url.searchParams;

  // ---- 认证 ----
  if (method === 'GET' && pathname === '/api/auth/me') {
    const cookies = parseCookies(req);
    if (cookies.demo_logout === '1') return json(res, 200, { user: null });
    if (cookies.demo_auth === '1') return json(res, 200, { user: DEMO_USER });
    // 首次访问自动进入演示登录态
    return json(res, 200, { user: DEMO_USER }, authCookieHeaders());
  }

  if (method === 'POST' && pathname === '/api/auth/local-login') {
    const body = await readBody(req, 1024 * 1024).catch(() => null);
    let payload = {};
    try { payload = body ? JSON.parse(body.toString('utf8')) : {}; } catch { /* ignore */ }
    if (!payload.username || !payload.password) {
      return json(res, 400, { error: '请输入用户名和密码' });
    }
    return json(res, 200, { user: DEMO_USER }, authCookieHeaders());
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    return json(res, 200, { ok: true }, {
      'Set-Cookie': [
        'demo_auth=; Path=/; Max-Age=0',
        'demo_logout=1; Path=/; Max-Age=86400; SameSite=Lax',
      ],
    });
  }

  if (method === 'GET' && pathname === '/api/auth/login') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>演示版 SSO</title>
      <body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center">
        <h2>演示版不支持 SSO 登录</h2>
        <p>请返回页面使用「本地账号登录」，任意用户名/密码即可。</p>
        <a href="/label_template/" style="color:#38bdf8">返回演示页面</a>
      </div></body></html>`);
    return;
  }

  // ---- 上传 ----
  if (method === 'POST' && pathname === '/api/source-files') {
    const body = await readBody(req);
    const ct = req.headers['content-type'] || '';
    const boundaryMatch = ct.match(/boundary=(.+)$/);
    const parsed = boundaryMatch ? parseMultipart(body, boundaryMatch[1].trim().replace(/^"|"$/g, '')) : { fields: {}, files: [] };
    const file_uuid = storeUpload(parsed);
    return json(res, 200, { file_uuid });
  }

  if (method === 'GET' && pathname === '/api/source-files/by-hash') {
    return json(res, 200, { file: null });
  }

  const downloadMatch = pathname.match(/^\/api\/source-files\/([^/]+)\/download$/);
  if (method === 'GET' && downloadMatch) {
    const meta = uploadedFiles.get(downloadMatch[1]);
    if (!meta || !fs.existsSync(meta.path)) {
      return json(res, 404, { error: '源文件不存在（演示记录未关联真实文件）' });
    }
    const encoded = encodeURIComponent(meta.filename);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${meta.filename.replace(/["\\]/g, '_')}"; filename*=UTF-8''${encoded}`,
      'Content-Length': fs.statSync(meta.path).size,
    });
    fs.createReadStream(meta.path).pipe(res);
    return;
  }

  // ---- 全链路 SSE ----
  if (method === 'POST' && pathname === '/api/generate-config') {
    const body = await readBody(req);
    const ct = req.headers['content-type'] || '';
    const boundaryMatch = ct.match(/boundary=(.+)$/);
    const parsed = boundaryMatch ? parseMultipart(body, boundaryMatch[1].trim().replace(/^"|"$/g, '')) : { fields: {}, files: [] };
    const templateType = parsed.fields.templateType || parsed.fields['templateType'] || 'GENERAL_IMAGE_ANNOTATION';
    const profile = profileFor(templateType);
    const parseResult = parseResultFor(templateType);
    const total = profile.pageCount || 10;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // 阶段1：解析文档（模拟分页进度）
    sseWrite(res, 'progress', { stage: 'parsing', current: 0, total });
    await delay(200);
    sseWrite(res, 'progress', { stage: 'parsing', current: Math.floor(total / 3), total });
    await delay(250);
    sseWrite(res, 'progress', { stage: 'parsing', current: Math.floor((2 * total) / 3), total });
    await delay(250);

    // 阶段1：LLM 描述打字机
    sseWrite(res, 'progress', { stage: 'describing', current: 1, total: 1 });
    const description = profile.description;
    const chunkSize = Math.max(30, Math.floor(description.length / 7));
    for (let i = 0; i < description.length; i += chunkSize) {
      sseWrite(res, 'delta', { content: description.slice(i, i + chunkSize) });
      await delay(120);
    }

    // 阶段2：解析配置
    sseWrite(res, 'progress', { stage: 'parsing-config', current: 1, total: 1 });
    await delay(300);

    sseWrite(res, 'result', {
      description,
      rawText: profile.rawText,
      pageCount: profile.pageCount,
      pages: [],
      tables: [],
      result: parseResult,
    });
    res.end();
    return;
  }

  // ---- 描述 → ParseResult ----
  if (method === 'POST' && pathname === '/api/parse-description') {
    const body = await readBody(req, 1024 * 1024).catch(() => null);
    let payload = {};
    try { payload = body ? JSON.parse(body.toString('utf8')) : {}; } catch { /* ignore */ }
    const templateType = payload.templateType || 'GENERAL_IMAGE_ANNOTATION';
    return json(res, 200, parseResultFor(templateType));
  }

  // ---- 记录管理 ----
  if (method === 'GET' && (pathname === '/api/configs' || pathname === '/api/configs/all')) {
    return json(res, 200, listConfigs(query));
  }

  if (method === 'POST' && pathname === '/api/configs') {
    const body = await readBody(req, 64 * 1024 * 1024).catch(() => null);
    let payload = {};
    try { payload = body ? JSON.parse(body.toString('utf8')) : {}; } catch { /* ignore */ }
    let parsed;
    try { parsed = JSON.parse(payload.config_json || '{}'); } catch { parsed = {}; }
    const meta = recordMeta(payload.template_type || 'GENERAL_IMAGE_ANNOTATION', {
      categoryGroups: parsed.categoryGroups || [],
      globalConfig: parsed.globalConfig || null,
      frameConfig: parsed.frameConfig || null,
      frameConfigCommon: parsed.frameConfigCommon || null,
      __audioResult: parsed.audioParseResult || null,
      __pointCloudResult: parsed.pointCloudParseResult || null,
    });
    seq += 1;
    const record = {
      id: seq,
      config_uuid: crypto.randomUUID(),
      title: payload.title || `${payload.source_filename || '未命名'}-${payload.template_type || 'GENERAL_IMAGE_ANNOTATION'}`,
      template_type: payload.template_type || 'GENERAL_IMAGE_ANNOTATION',
      source_filename: payload.source_filename || '',
      config_json: payload.config_json || meta.config_json,
      class_count: meta.class_count,
      field_count: meta.field_count,
      byte_size: meta.byte_size,
      created_at: new Date().toISOString(),
      user_id: 1,
      owner_username: 'demo',
      source_file_uuid: payload.source_file_uuid || null,
    };
    configs.unshift(record);
    return json(res, 200, { ok: true, config: toListItem(record) });
  }

  const configDetailMatch = pathname.match(/^\/api\/configs\/([^/]+)$/);
  if (configDetailMatch && (method === 'GET' || method === 'DELETE')) {
    const record = configs.find((r) => r.config_uuid === configDetailMatch[1]);
    if (!record) return json(res, 404, { error: '记录不存在' });
    if (method === 'DELETE') {
      configs = configs.filter((r) => r.config_uuid !== configDetailMatch[1]);
      return json(res, 200, { ok: true });
    }
    return json(res, 200, { config: record });
  }

  const sourceFileMatch = pathname.match(/^\/api\/configs\/([^/]+)\/source-file$/);
  if (method === 'GET' && sourceFileMatch) {
    const record = configs.find((r) => r.config_uuid === sourceFileMatch[1]);
    if (!record) return json(res, 404, { error: '记录不存在' });
    const meta = record.source_file_uuid && uploadedFiles.get(record.source_file_uuid);
    if (meta) return json(res, 200, { file: { file_uuid: record.source_file_uuid, filename: meta.filename } });
    return json(res, 200, { file: null });
  }

  // ---- 其它 ----
  if (method === 'POST' && pathname === '/api/client-error') {
    return json(res, 200, { ok: true });
  }

  if (pathname.startsWith('/formily-api/')) {
    return json(res, 501, { error: { code: 'NOT_IMPLEMENTED', message: '演示版不包含 Formily 服务' } });
  }

  return json(res, 404, { error: { code: 'NOT_FOUND', message: 'API 不存在' } });
}

/* ==================== 静态资源 ==================== */
function serveStatic(res, url) {
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === BASE) {
    res.writeHead(302, { Location: `${BASE}/` });
    res.end();
    return;
  }

  if (pathname === `${BASE}/` || pathname === `${BASE}/index.html`) {
    const file = path.join(__dirname, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    fs.createReadStream(file).pipe(res);
    return;
  }

  if (pathname.startsWith(`${BASE}/assets/`) || pathname.startsWith(`${BASE}/examples/`) || pathname === `${BASE}/50x.html`) {
    const rel = pathname.slice(BASE.length + 1);
    const target = path.normalize(path.join(__dirname, rel));
    if (!target.startsWith(__dirname) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
    return;
  }

  // SPA fallback：其余 /label_template/* 路径返回 index.html
  if (pathname.startsWith(`${BASE}/`)) {
    const file = path.join(__dirname, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    fs.createReadStream(file).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

/* ==================== 启动 ==================== */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/formily-api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(res, url);
    }
  } catch (err) {
    console.error('[demo-server]', err);
    if (!res.headersSent) {
      json(res, 500, { error: { code: 'INTERNAL', message: String(err && err.message) } });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[demo] 演示服务器已启动: http://127.0.0.1:${PORT}${BASE}/`);
  console.log(`[demo] 静态资源目录: ${__dirname}`);
});

process.on('SIGINT', () => {
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  process.exit(0);
});

