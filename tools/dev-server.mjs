import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8080;
// Live reload is for local development only (tools/ is in .vercelignore, so production never has it).
// Set LIVERELOAD=0 to turn it off.
const LIVE_RELOAD = process.env.LIVERELOAD !== '0';
const LIVE_RELOAD_PATH = '/__livereload';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8'
};

// ───────────── live reload ─────────────
// The browser keeps one EventSource open. A saved .css file is swapped in place (the page and its
// state stay); any other watched file reloads the page.
const liveClients = new Set();
const WATCHED_DIRS = ['css', 'js', 'assets', 'vendor'];
const WATCHED_FILES = ['index.html', 'liff.html'];
const WATCHED_EXT = new Set(['.css', '.js', '.mjs', '.html', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

const LIVE_RELOAD_CLIENT = `<script>
(function () {
  if (!window.EventSource) return;
  var source = new EventSource('${LIVE_RELOAD_PATH}');
  source.onmessage = function (event) {
    var file = event.data || '';
    if (/\\.css$/i.test(file)) {
      var swapped = false;
      document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
        var url = new URL(link.href, location.href);
        if (url.origin !== location.origin || url.pathname.replace(/^\\//, '') !== file) return;
        url.searchParams.set('lr', Date.now());
        link.href = url.href;
        swapped = true;
      });
      if (swapped) { console.log('[live-reload] CSS updated:', file); return; }
    }
    console.log('[live-reload] reload:', file);
    location.reload();
  };
})();
</script>`;

function notifyLiveClients(file) {
  for (const res of liveClients) res.write(`data: ${file}\n\n`);
}

function watchFiles() {
  const pending = new Map();
  const onChange = (relPath) => {
    const file = relPath.split(path.sep).join('/');
    if (!WATCHED_EXT.has(path.extname(file).toLowerCase())) return;
    if (/\.(bak|tmp)$|~$/.test(file)) return;
    clearTimeout(pending.get(file));
    // Editors save in several steps; wait until the file is quiet.
    pending.set(file, setTimeout(() => {
      pending.delete(file);
      console.log(`[live-reload] ${file}`);
      notifyLiveClients(file);
    }, 150));
  };
  WATCHED_DIRS.forEach((dir) => {
    const full = path.join(rootDir, dir);
    if (!fs.existsSync(full)) return;
    fs.watch(full, { recursive: true }, (_event, name) => { if (name) onChange(path.join(dir, String(name))); });
  });
  WATCHED_FILES.forEach((file) => {
    const full = path.join(rootDir, file);
    if (fs.existsSync(full)) fs.watch(full, () => onChange(file));
  });
  // Keep the connection alive through idle proxies / the emulator network.
  setInterval(() => { for (const res of liveClients) res.write(': ping\n\n'); }, 25000);
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  let pathname = decodeURIComponent(urlObj.pathname);

  if (LIVE_RELOAD && pathname === LIVE_RELOAD_PATH) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    liveClients.add(res);
    req.on('close', () => liveClients.delete(res));
    return;
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  let filePath = path.join(rootDir, pathname);

  // Prevent path traversal
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      filePath = path.join(rootDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Internal Server Error: ${readErr.message}`);
        return;
      }
      // Always serve the file on disk (the ?v= pins would otherwise let the phone keep an old copy).
      res.setHeader('Cache-Control', 'no-store');
      if (LIVE_RELOAD && ext === '.html') {
        const html = content.toString('utf8');
        const at = html.lastIndexOf('</body>');
        content = at >= 0 ? html.slice(0, at) + LIVE_RELOAD_CLIENT + html.slice(at) : html + LIVE_RELOAD_CLIENT;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

if (LIVE_RELOAD) watchFiles();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 PP.5 Web Server running at: http://127.0.0.1:${PORT}/`);
  console.log(`📱 Android emulator: http://10.0.2.2:${PORT}/`);
  console.log(`🔑 Login Page: http://127.0.0.1:${PORT}/?page=login`);
  console.log(`📊 SchoolMIS Sync: http://127.0.0.1:${PORT}/?page=schoolmis_sync`);
  console.log(`🔄 Live reload: ${LIVE_RELOAD ? 'on (save a file in css/ js/ assets/ or index.html)' : 'off'}`);
  console.log(`⚠️  This uses the REAL Supabase database: look around freely, do not save or delete.`);
  console.log(`======================================================\n`);
});
