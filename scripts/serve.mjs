import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv.includes('--dist') ? path.join(project, 'dist') : project;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp'};
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Method not allowed'); return; }
  let file;
  try {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (requested.includes('\0')) throw new Error('Invalid path');
    file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)] || !fs.statSync(file).isFile()) throw new Error('Not found');
  } catch { res.writeHead(404, {'Content-Type': 'text/plain'}); res.end('Not found'); return; }
  res.writeHead(200, {'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
}).listen(port, host, () => console.log(`Falcon Jobster local demo: http://${host}:${port}\nServing ${root}\nNo backend, real messaging, or authentication is connected.`));
