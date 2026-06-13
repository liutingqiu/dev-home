const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = process.env.PORT || 3458;
const ROOT = __dirname;
const ROOT_SAFE = ROOT + path.sep;
const DATA_DIR = path.join(ROOT, 'data');
const BODY_MAX = 1024 * 1024;
const RATE_LIMIT = 60;
const RATE_WINDOW = 60000;
const COMPRESSIBLE = ['.html', '.css', '.js', '.json', '.svg'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"
};

// ============ 速率限制 ============
const rateLimit = new Map();
function checkRate(ip) {
  const now = Date.now();
  const r = rateLimit.get(ip);
  if (!r || now - r.reset > RATE_WINDOW) { rateLimit.set(ip, { count: 1, reset: now }); return true; }
  r.count++;
  return r.count <= RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimit) { if (now - v.reset > RATE_WINDOW) rateLimit.delete(k); }
}, 60000).unref();

// ============ JSON 读写 ============
function readJSON(filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8'));
  } catch { return filename.includes('messages') || filename.includes('projects') || filename.includes('applications') ? [] : {}; }
}
function writeJSON(filename, data) {
  const p = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(p + '.tmp', JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(p + '.tmp', p);
  } catch (e) {
    console.error('writeJSON failed:', filename, e.message);
    try { fs.unlinkSync(p + '.tmp'); } catch {}
  }
}

// ============ XSS ============
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============ 密码 ============
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  return hash === crypto.scryptSync(pw, salt, 64).toString('hex');
}

// ============ Token ============
const tokens = new Map();
function generateToken() {
  const t = crypto.randomBytes(24).toString('hex');
  tokens.set(t, Date.now() + 24 * 60 * 60 * 1000);
  return t;
}
function checkToken(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  const t = auth.slice(7);
  if (!tokens.has(t)) return false;
  if (tokens.get(t) < Date.now()) { tokens.delete(t); return false; }
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tokens) { if (v < now) tokens.delete(k); }
}, 3600000).unref();

// ============ 校验 ============
const V = {
  phone: v => /^1[3-9]\d{9}$/.test(String(v)),
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
  len: (v, min, max) => { const s = String(v || ''); return s.length >= min && s.length <= max; }
};

// ============ 响应 ============
function send(res, code, data, ct) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': ct || 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    ...SECURITY_HEADERS
  });
  res.end(body);
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    let overLimit = false;
    req.on('data', c => {
      if (overLimit) return;
      body += c;
      if (Buffer.byteLength(body) > BODY_MAX) { overLimit = true; req.destroy(); resolve({ __error: 'Body too large' }); }
    });
    req.on('end', () => {
      if (overLimit) return;
      try { resolve(JSON.parse(body)); } catch { resolve({ __error: 'Invalid JSON' }); }
    });
  });
}

// ============ 日志 ============
function logRequest(req, res, start) {
  const ms = Date.now() - start;
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
}

// ============ 静态文件 ============
function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';

  let fullPath = path.join(ROOT, pathname);
  if (!fullPath.startsWith(ROOT_SAFE) && fullPath !== path.join(ROOT, 'index.html')) { send(res, 403, { error: 'Forbidden' }); return true; }
  if (pathname.toLowerCase().startsWith('/data/')) { send(res, 403, { error: 'Forbidden' }); return true; }
  if (!fs.existsSync(fullPath)) return false;

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    const indexPath = path.join(fullPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      fullPath = indexPath;
      pathname = pathname.replace(/\/?$/, '/index.html');
    } else {
      return false;
    }
  }

  const ext = path.extname(fullPath).toLowerCase();
  const content = fs.readFileSync(fullPath);
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=86400';
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cache,
    ...SECURITY_HEADERS
  };

  if (COMPRESSIBLE.includes(ext) && req.headers['accept-encoding']?.includes('gzip')) {
    const gz = zlib.gzipSync(content);
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = gz.length;
    res.writeHead(200, headers);
    res.end(gz);
    return true;
  }

  res.writeHead(200, headers);
  res.end(content);
  return true;
}

// ============ 路由表 ============
const routes = [];
function route(method, pattern, handler, auth = false) {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '([^/]+)') + '$');
  routes.push({ method, regex, handler, auth });
}

// ---- 公共 GET ----
route('GET', '/api/settings', (req, res) => send(res, 200, readJSON('settings.json')));
route('GET', '/api/skills', (req, res) => send(res, 200, readJSON('settings.json').skills || []));
route('GET', '/api/projects', (req, res) => send(res, 200, readJSON('projects.json')));

// ---- 服务器重启 ----
route('POST', '/api/restart-server', (req, res) => {
  send(res, 200, { ok: true, msg: 'restarting...' });
  setTimeout(() => process.exit(0), 500);
});

// ---- 联系留言 ----
route('POST', '/api/contact', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  if (!V.len(data.name, 1, 50)) { send(res, 400, { error: '姓名为1-50字符' }); return; }
  if (data.phone && !V.phone(data.phone)) { send(res, 400, { error: '手机号格式错误' }); return; }
  if (!V.len(data.content, 1, 2000)) { send(res, 400, { error: '留言内容为1-2000字符' }); return; }

  const messages = readJSON('messages.json');
  messages.push({
    id: 'm' + Date.now().toString(36),
    name: esc(data.name),
    phone: esc(data.phone || ''),
    content: esc(data.content),
    read: false,
    createdAt: new Date().toISOString()
  });
  writeJSON('messages.json', messages);
  send(res, 200, { success: true, message: '提交成功！我会通过你留下的手机号联系你。', id: messages[messages.length - 1].id });
});

// ---- 项目申请 ----
route('POST', '/api/apply', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  if (!V.len(data.name, 1, 50)) { send(res, 400, { error: '姓名为1-50字符' }); return; }
  if (!V.phone(data.phone)) { send(res, 400, { error: '手机号格式错误' }); return; }
  if (data.email && !V.email(data.email)) { send(res, 400, { error: '邮箱格式错误' }); return; }
  if (!V.len(data.description, 10, 5000)) { send(res, 400, { error: '项目需求为10-5000字符' }); return; }

  const applications = readJSON('applications.json');
  applications.push({
    id: 'a' + Date.now().toString(36),
    name: esc(data.name),
    phone: esc(data.phone),
    email: esc(data.email || ''),
    description: esc(data.description),
    read: false,
    createdAt: new Date().toISOString()
  });
  writeJSON('applications.json', applications);
  send(res, 200, { success: true, message: '提交成功！我会在24小时内联系你。' });
});

// ---- 登录 ----
route('POST', '/api/admin/login', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  const users = readJSON('users.json');
  const user = users.find(u => u.username === data?.username);
  if (!user || !verifyPassword(data?.password || '', user.password)) {
    send(res, 401, { error: 'Wrong password' });
    return;
  }
  send(res, 200, { token: generateToken() });
});

// ---- 管理 API（需认证）----
route('GET', '/api/admin/messages', (req, res) => send(res, 200, readJSON('messages.json')), true);
route('PUT', '/api/admin/messages', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  const msgs = readJSON('messages.json');
  const m = msgs.find(x => x.id === data?.id);
  if (!m) { send(res, 404, { error: 'Message not found' }); return; }
  if (data.read !== undefined) m.read = !!data.read;
  writeJSON('messages.json', msgs);
  send(res, 200, { success: true });
}, true);
route('DELETE', '/api/admin/messages', (req, res, params, url) => {
  const id = url.searchParams.get('id');
  if (!id) { send(res, 400, { error: 'Missing id' }); return; }
  const msgs = readJSON('messages.json');
  const idx = msgs.findIndex(x => x.id === id);
  if (idx === -1) { send(res, 404, { error: 'Message not found' }); return; }
  msgs.splice(idx, 1);
  writeJSON('messages.json', msgs);
  send(res, 200, { success: true });
}, true);

route('GET', '/api/admin/applications', (req, res) => send(res, 200, readJSON('applications.json')), true);
route('PUT', '/api/admin/applications', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  const apps = readJSON('applications.json');
  const a = apps.find(x => x.id === data?.id);
  if (!a) { send(res, 404, { error: 'Application not found' }); return; }
  if (data.read !== undefined) a.read = !!data.read;
  writeJSON('applications.json', apps);
  send(res, 200, { success: true });
}, true);
route('DELETE', '/api/admin/applications', (req, res, params, url) => {
  const id = url.searchParams.get('id');
  if (!id) { send(res, 400, { error: 'Missing id' }); return; }
  const apps = readJSON('applications.json');
  const idx = apps.findIndex(x => x.id === id);
  if (idx === -1) { send(res, 404, { error: 'Application not found' }); return; }
  apps.splice(idx, 1);
  writeJSON('applications.json', apps);
  send(res, 200, { success: true });
}, true);

route('GET', '/api/admin/projects', (req, res) => send(res, 200, readJSON('projects.json')), true);
route('POST', '/api/admin/projects', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  if (!V.len(data.name, 1, 100)) { send(res, 400, { error: '项目名称为1-100字符' }); return; }
  const projects = readJSON('projects.json');
  const item = {
    id: 'p' + Date.now().toString(36),
    name: esc(data.name || ''), nameEn: esc(data.nameEn || ''),
    type: esc(data.type || ''), typeEn: esc(data.typeEn || ''),
    url: esc(data.url || ''),
    screenshots: (data.screenshots || []).map(s => esc(s)),
    stats: sanitizeStats(data.stats),
    features: (data.features || []).map(f => esc(f)),
    featuresEn: (data.featuresEn || []).map(f => esc(f)),
    description: esc(data.description || ''),
    descriptionEn: esc(data.descriptionEn || ''),
    featured: !!data.featured,
    createdAt: new Date().toISOString()
  };
  projects.push(item);
  writeJSON('projects.json', projects);
  send(res, 200, item);
}, true);
route('PUT', '/api/admin/projects', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  if (!data.id) { send(res, 400, { error: 'Missing id' }); return; }
  const projects = readJSON('projects.json');
  const i = projects.findIndex(p => p.id === data.id);
  if (i === -1) { send(res, 404, { error: 'Not found' }); return; }
  const p = projects[i];
  if (data.name !== undefined) p.name = esc(data.name);
  if (data.nameEn !== undefined) p.nameEn = esc(data.nameEn);
  if (data.type !== undefined) p.type = esc(data.type);
  if (data.typeEn !== undefined) p.typeEn = esc(data.typeEn);
  if (data.url !== undefined) p.url = esc(data.url);
  if (data.description !== undefined) p.description = esc(data.description);
  if (data.descriptionEn !== undefined) p.descriptionEn = esc(data.descriptionEn);
  if (data.featured !== undefined) p.featured = !!data.featured;
  if (data.features !== undefined) p.features = data.features.map(f => esc(f));
  if (data.featuresEn !== undefined) p.featuresEn = data.featuresEn.map(f => esc(f));
  if (data.screenshots !== undefined) p.screenshots = data.screenshots.map(s => esc(s));
  if (data.stats !== undefined) p.stats = sanitizeStats(data.stats);
  p.updatedAt = new Date().toISOString();
  writeJSON('projects.json', projects);
  send(res, 200, p);
}, true);
route('DELETE', '/api/admin/projects', (req, res, params, url) => {
  const id = url.searchParams.get('id');
  if (!id) { send(res, 400, { error: 'Missing id' }); return; }
  const projects = readJSON('projects.json');
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) { send(res, 404, { error: 'Not found' }); return; }
  projects.splice(idx, 1);
  writeJSON('projects.json', projects);
  send(res, 200, { success: true });
}, true);

// ---- 设置 ----
route('GET', '/api/admin/settings', (req, res) => send(res, 200, readJSON('settings.json')), true);
route('PUT', '/api/admin/settings', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  const current = readJSON('settings.json');
  const stringFields = ['name', 'codename', 'title', 'tagline', 'bio', 'bioEn'];
  const objectFields = ['contact', 'social'];
  stringFields.forEach(k => { if (data[k] !== undefined) current[k] = esc(data[k]); });
  objectFields.forEach(k => { if (data[k] !== undefined) current[k] = data[k]; });
  writeJSON('settings.json', current);
  send(res, 200, { success: true });
}, true);

// ---- 修改密码 ----
route('POST', '/api/admin/change-password', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  if (!V.len(data.oldPassword, 1, 100) || !V.len(data.newPassword, 6, 100)) {
    send(res, 400, { error: '密码长度为6-100字符' }); return;
  }
  const users = readJSON('users.json');
  const user = users.find(u => u.username === 'admin');
  if (!user || !verifyPassword(data.oldPassword, user.password)) {
    send(res, 401, { error: '当前密码错误' }); return;
  }
  user.password = hashPassword(data.newPassword);
  writeJSON('users.json', users);
  tokens.clear();
  send(res, 200, { success: true, message: '密码已修改，所有会话已失效' });
}, true);

function sanitizeStats(stats) {
  if (!stats || typeof stats !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(stats)) {
    out[esc(k)] = typeof v === 'number' ? v : esc(String(v));
  }
  return out;
}

// ============ 精选内容 API ============
const FEED_SOURCES = [
  { dir: path.join(ROOT, '..', 'tools', 'KnowledgeSys', 'ai_news_output'), cat: 'AI', catCN: 'AI资讯' },
  { dir: path.join(ROOT, '..', 'tools', 'KnowledgeSys', 'software_dev_output'), cat: 'Software', catCN: '软件开发' },
  { dir: path.join(ROOT, '..', 'tools', 'KnowledgeSys', 'ui_design_output'), cat: 'UI', catCN: 'UI设计' },
  { dir: path.join(ROOT, '..', 'tools', 'KnowledgeSys', 'miniprogram_output'), cat: 'MiniProgram', catCN: '小程序' },
];
let feedCache = null;
let feedCacheTime = 0;

function buildFeed() {
  const now = Date.now();
  if (feedCache && now - feedCacheTime < 300000) return feedCache; // 5分钟内存缓存

  const all = [];
  for (const src of FEED_SOURCES) {
    try {
      const files = fs.readdirSync(src.dir).filter(f => f.endsWith('.json')).sort().reverse();
      if (!files.length) continue;
      const latest = JSON.parse(fs.readFileSync(path.join(src.dir, files[0]), 'utf-8'));
      const items = latest.items || latest.interviews || [];
      for (const item of items) {
        const t = item.title || '';
        if (!t || t.length < 10) continue;
        if (/<[a-zA-Z]+[\s=>]|class="|target="/.test(t)) continue; // 过滤HTML垃圾
        const source = item.source || {};
        const tag = item.interviewee || item.topic || {};
        all.push({
          title: t.slice(0, 200),
          summary: (item.summary || '').slice(0, 300),
          url: source.url || '',
          platform: source.platform || '',
          category: tag.category || src.cat,
          categoryCN: tag.name_cn || src.catCN,
          sourceType: src.cat,
          time: item.publish_time || latest.generated_at || '',
          score: item.metadata?.play || item.metadata?.stars || 1
        });
      }
    } catch (e) { /* source unavailable, skip */ }
  }

  // 按时间倒序 + 去重
  const seen = new Set();
  const unique = [];
  for (const item of all.sort((a, b) => b.time.localeCompare(a.time))) {
    const key = item.url || item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  // 无新数据时，回退到磁盘缓存（爬虫挂了也能显示上一批数据）
  if (!unique.length) {
    try {
      const cacheFile = path.join(DATA_DIR, 'feed-cache.json');
      if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        feedCache = cached;
        feedCacheTime = now;
        return feedCache;
      }
    } catch {}
  }

  feedCache = { items: unique, generatedAt: new Date().toISOString() };
  feedCacheTime = now;
  // 写入磁盘缓存
  try {
    const cacheFile = path.join(DATA_DIR, 'feed-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify(feedCache), 'utf-8');
  } catch {}
  return feedCache;
}

route('GET', '/api/feed', (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const search = (url.searchParams.get('q') || '').toLowerCase();
  const cat = url.searchParams.get('cat') || '';
  const src = url.searchParams.get('src') || '';
  const limit = parseInt(url.searchParams.get('limit') || '60');

  const { items } = buildFeed();
  let filtered = items;

  if (search) filtered = filtered.filter(i => (i.title + i.summary).toLowerCase().includes(search));
  if (cat) filtered = filtered.filter(i => i.sourceType === cat || i.category === cat);
  if (src) filtered = filtered.filter(i => i.platform === src);

  // 分类统计
  const catStats = {};
  const srcStats = {};
  for (const i of items) {
    catStats[i.sourceType] = (catStats[i.sourceType] || 0) + 1;
    if (i.platform) srcStats[i.platform] = (srcStats[i.platform] || 0) + 1;
  }

  send(res, 200, {
    items: filtered.slice(0, limit),
    total: filtered.length,
    grandTotal: items.length,
    catStats,
    srcStats,
    generatedAt: feedCache?.generatedAt || new Date().toISOString()
  });
});

// ============ 路由分发 ============
// CORS preflight
function handleCORS(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return true;
  }
  return false;
}

async function handleAPI(req, res) {
  if (handleCORS(req, res)) return true;
  const ip = req.socket.remoteAddress || 'unknown';
  if (!checkRate(ip)) { send(res, 429, { error: 'Too many requests' }); return true; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  for (const r of routes) {
    if (r.method !== method) continue;
    const match = pathname.match(r.regex);
    if (!match) continue;

    if (r.auth && !checkToken(req)) { send(res, 401, { error: 'Unauthorized' }); return true; }

    try {
      await r.handler(req, res, match.slice(1), url);
    } catch (e) {
      console.error('Route error:', e.stack || e.message);
      send(res, 500, { error: 'Internal error' });
    }
    return true;
  }

  return false;
}

// ============ 服务启动 ============
const server = http.createServer(async (req, res) => {
  const start = Date.now();
  try {
    if (await handleAPI(req, res)) { logRequest(req, res, start); return; }
    if (serveStatic(req, res)) { logRequest(req, res, start); return; }
    send(res, 404, { error: 'Not found' });
    logRequest(req, res, start);
  } catch (e) {
    console.error(e.stack || e.message);
    send(res, 500, { error: 'Internal error' });
    logRequest(req, res, start);
  }
});

server.listen(PORT, () => {
  console.log(`dev-home: http://localhost:${PORT}`);
});
