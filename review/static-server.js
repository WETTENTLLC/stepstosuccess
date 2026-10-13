// Minimal static server that behaves like GitHub Pages: directory index.html, 404.html with a real 404 status,
// no custom headers, no redirects, no server-side code. Usage: node review/static-server.js <dir> <port>
const http = require('http');
const fs = require('fs');
const path = require('path');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };

function createServer(root) {
  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = '/'; }
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(404); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
    }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }
    const nf = path.join(root, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
  });
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || 'dist');
  const port = Number(process.argv[3] || 4000);
  createServer(root).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
}
module.exports = { createServer };
