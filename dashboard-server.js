const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 6666;
const ROOT = __dirname;

const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.png':'image/png' };

const server = http.createServer((req, res) => {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/dashboard.html';

  const fullPath = path.join(ROOT, pathname);
  if (!fs.existsSync(fullPath)) { res.writeHead(404); res.end('Not found'); return; }

  const ext = path.extname(fullPath).toLowerCase();
  const content = fs.readFileSync(fullPath);
  res.writeHead(200, { 'Content-Type': MIME[ext]||'text/plain', 'Access-Control-Allow-Origin':'*' });
  res.end(content);
});

server.listen(PORT, () => console.log(`Dashboard: http://localhost:${PORT}`));
