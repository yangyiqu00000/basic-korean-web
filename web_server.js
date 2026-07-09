const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9999;
const BASE = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let filePath = reqUrl.pathname;
  if (filePath === '/') filePath = '/index.html';
  
  const fullPath = path.join(BASE, filePath);
  const ext = path.extname(filePath);

  // 安全：路径穿越防御 + 敏感文件拦截
  // （1）realpath 包含校验：解析后的真实路径必须仍在 BASE 内，阻止 ../ 逃逸
  // （2）拦截点文件（.git/.env 等）与含 API Key 的 ai_config.json，避免密钥泄露
  let resolvedPath;
  try {
    resolvedPath = fs.realpathSync(fullPath);
  } catch (e) {
    resolvedPath = path.resolve(fullPath);
  }
  let resolvedBase;
  try {
    resolvedBase = fs.realpathSync(BASE);
  } catch (e) {
    resolvedBase = path.resolve(BASE);
  }
  const outsideBase = resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + path.sep);
  const isSensitive = filePath.split('/').some(function(seg) { return seg.startsWith('.'); }) || path.basename(resolvedPath) === 'ai_config.json';
  if (outsideBase || isSensitive) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + filePath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Web Server: http://localhost:${PORT}`);
});
