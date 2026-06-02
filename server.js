const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ROOT_SAFE = ROOT + path.sep;
const DATA_DIR = path.join(ROOT, 'data');
const CHAT_IMAGES_DIR = path.join(DATA_DIR, 'chat-images');
const CHAT_DATA_DIR = path.join(DATA_DIR, 'chat');
const INSPIRATION_DIR = path.join(ROOT, '..', 'portfolio', 'inspiration');
const BODY_MAX = 1024 * 1024;
const RATE_LIMIT = 60;
const RATE_WINDOW = 60000;
const COMPRESSIBLE = ['.html', '.css', '.js', '.json', '.svg'];

// ============ Chat 鉴权 ============
let CHAT_KEY = '';
let REPLY_KEY = '';
try {
  const chatConfig = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'chat-config.json'), 'utf-8'));
  CHAT_KEY = chatConfig.key || '';
  REPLY_KEY = chatConfig.replyKey || '';
} catch {}

function checkChatAuth(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = url.searchParams.get('key');
  if (!CHAT_KEY) return true;
  if (!key || key !== CHAT_KEY) { send(res, 403, { error: 'Forbidden' }); return false; }
  return true;
}

function checkReplyAuth(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = url.searchParams.get('key');
  if (!REPLY_KEY) { send(res, 500, { error: 'Reply not configured' }); return false; }
  if (!key || key !== REPLY_KEY) { send(res, 403, { error: 'Forbidden' }); return false; }
  return true;
}

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
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"
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
  if (pathname.toLowerCase().startsWith('/data/') && !pathname.toLowerCase().startsWith('/data/chat-images/')) { send(res, 403, { error: 'Forbidden' }); return true; }
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

// ============ Chat 消息存储 ============
function getChatFile(month) {
  return path.join(CHAT_DATA_DIR, `${month}.json`);
}

function readChatMessages(month) {
  const file = getChatFile(month);
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return []; }
}

function writeChatMessages(month, messages) {
  const dir = CHAT_DATA_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = getChatFile(month);
  fs.writeFileSync(p + '.tmp', JSON.stringify(messages, null, 2), 'utf-8');
  fs.renameSync(p + '.tmp', p);
}

function saveChatImage(base64Data) {
  const dir = CHAT_IMAGES_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // 提取 MIME 和纯 base64
  const match = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === 'image/png' ? '.png' : match[1] === 'image/gif' ? '.gif' : '.jpg';
  const raw = Buffer.from(match[2], 'base64');
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, raw);
  return `/data/chat-images/${filename}`;
}

function generateMsgId() {
  return 'msg-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
}

// ============ Chat API ============
route('POST', '/api/chat', async (req, res) => {
  if (!checkChatAuth(req, res)) return;
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  if (!V.len(data.content, 0, 10000)) { send(res, 400, { error: '消息过长' }); return; }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const messages = readChatMessages(month);

  const msg = {
    id: generateMsgId(),
    from: 'master',
    mode: data.mode === 'urgent' ? 'urgent' : 'inspire',
    type: data.image ? 'image' : 'text',
    content: data.image ? '' : esc(data.content || ''),
    image: data.image ? saveChatImage(data.image) : null,
    read: false,
    createdAt: now.toISOString()
  };

  messages.push(msg);
  writeChatMessages(month, messages);

  // 如果是灵感模式，同时写入 portfolio inspiration inbox
  if (msg.mode === 'inspire' && msg.content) {
    try {
      const inboxDir = path.join(INSPIRATION_DIR, 'inbox');
      if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });
      const inspireFile = path.join(inboxDir, `${now.toISOString().slice(0, 10)}-${String(messages.length).padStart(3, '0')}.md`);
      fs.writeFileSync(inspireFile, `# 灵感 · ${now.toISOString().slice(0, 16)}\n\n${data.content}\n\n${data.image ? `![图片](${msg.image})` : ''}\n`, 'utf-8');

      // 更新灵感池索引
      const indexFile = path.join(INSPIRATION_DIR, 'index.json');
      let index = [];
      try { index = JSON.parse(fs.readFileSync(indexFile, 'utf-8')); } catch {}
      index.push({
        id: path.basename(inspireFile, '.md'),
        title: data.content.slice(0, 50).replace(/\n/g, ' '),
        status: 'inbox',
        date: now.toISOString().slice(0, 10),
        file: path.basename(inspireFile)
      });
      fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
    } catch (e) { console.error('灵感写入失败:', e.message); }
  }

  send(res, 200, { success: true, id: msg.id });
});

route('GET', '/api/chat', (req, res) => {
  if (!checkChatAuth(req, res)) return;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const since = url.searchParams.get('since');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  // 加载最近几个月的数据
  const now = new Date();
  let allMessages = [];
  for (let m = 0; m < 3; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    allMessages = readChatMessages(month).concat(allMessages);
  }

  // since 过滤
  if (since) {
    const sinceIdx = allMessages.findIndex(m => m.id === since);
    if (sinceIdx >= 0) allMessages = allMessages.slice(sinceIdx + 1);
  }

  // 限制数量（取最近 N 条）
  if (allMessages.length > limit) allMessages = allMessages.slice(-limit);

  send(res, 200, allMessages);
});

route('POST', '/api/inspire', async (req, res) => {
  if (!checkChatAuth(req, res)) return;
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  if (!V.len(data.content, 1, 10000)) { send(res, 400, { error: '内容为1-10000字符' }); return; }

  const now = new Date();
  try {
    const inboxDir = path.join(INSPIRATION_DIR, 'inbox');
    if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

    // 计数已有文件
    const existing = fs.readdirSync(inboxDir).filter(f => f.endsWith('.md'));
    const filename = `${now.toISOString().slice(0, 10)}-${String(existing.length + 1).padStart(3, '0')}.md`;
    const inspireFile = path.join(inboxDir, filename);

    let md = `# 灵感 · ${now.toISOString().slice(0, 16)}\n\n${data.content}\n`;
    if (data.image) {
      const imgPath = saveChatImage(data.image);
      if (imgPath) md += `\n![图片](${imgPath})\n`;
    }
    fs.writeFileSync(inspireFile, md, 'utf-8');

    // 更新索引
    const indexFile = path.join(INSPIRATION_DIR, 'index.json');
    let index = [];
    try { index = JSON.parse(fs.readFileSync(indexFile, 'utf-8')); } catch {}
    index.push({
      id: path.basename(inspireFile, '.md'),
      title: data.content.slice(0, 50).replace(/\n/g, ' '),
      status: 'inbox',
      date: now.toISOString().slice(0, 10),
      file: filename
    });
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));

    send(res, 200, { success: true, file: filename });
  } catch (e) {
    console.error('灵感写入失败:', e.message);
    send(res, 500, { error: '保存失败' });
  }
});

route('POST', '/api/reply', async (req, res) => {
  if (!checkReplyAuth(req, res)) return;
  const data = await readBody(req);
  if (data.__error) { send(res, 400, { error: data.__error }); return; }
  if (!V.len(data.content, 1, 5000)) { send(res, 400, { error: '回复内容为1-5000字符' }); return; }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const messages = readChatMessages(month);

  const msg = {
    id: generateMsgId(),
    from: 'reasonix',
    mode: 'urgent',
    type: 'text',
    content: esc(data.content),
    image: null,
    read: false,
    createdAt: now.toISOString()
  };

  messages.push(msg);
  writeChatMessages(month, messages);
  send(res, 200, { success: true, id: msg.id });
});

// ============ 访问统计 ============
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
function readStats() { try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch { return { pages: {}, total: 0, days: {} }; } }
function writeStats(s) { fs.writeFileSync(STATS_FILE + '.tmp', JSON.stringify(s, null, 2), 'utf-8'); fs.renameSync(STATS_FILE + '.tmp', STATS_FILE); }

route('POST', '/api/track', async (req, res) => {
  const data = await readBody(req);
  if (data.__error) { send(res, 400, {}); return; }
  const stats = readStats();
  const page = (data.page || '/').slice(0, 100);
  stats.total = (stats.total || 0) + 1;
  stats.pages[page] = (stats.pages[page] || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);
  stats.days[today] = (stats.days[today] || 0) + 1;
  writeStats(stats);
  send(res, 200, { ok: true });
});

route('GET', '/api/daily-list', (req, res) => {
  try {
    const dir = path.join(ROOT, 'daily');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html');
    send(res, 200, files.length);
  } catch { send(res, 200, 0); }
});

route('GET', '/api/blog-list', (req, res) => {
  try {
    const dir = path.join(ROOT, 'blog');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html');
    send(res, 200, files.length);
  } catch { send(res, 200, 0); }
});

route('GET', '/api/stats', (req, res) => {
  send(res, 200, readStats());
});

route('GET', '/api/crawler-state', (req, res) => {
  const stateFile = path.join(ROOT, '..', 'portfolio', 'data', 'crawler-state.json');
  try { send(res, 200, JSON.parse(fs.readFileSync(stateFile, 'utf-8'))); }
  catch { send(res, 200, {}); }
});

route('GET', '/api/status', (req, res) => {
  // 读取 portfolio 的状态文件
  const statusFile = path.join(ROOT, '..', 'portfolio', 'data', 'status.json');
  let status = { active: false, task: '空闲', updated: new Date().toISOString(), errors: 0 };
  try {
    status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
  } catch {}
  send(res, 200, status);
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
