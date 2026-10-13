import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDatabase} from './database.mjs';
import {handleApi,handleError} from './api.mjs';
import {makeAssistantHandler} from './assistant.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ASSETS=new Map([
  ['/app.js', ['app.js','text/javascript; charset=utf-8']],
  ['/src/icons.js',['src/icons.js','text/javascript; charset=utf-8']],
  ['/src/seed.js',['src/seed.js','text/javascript; charset=utf-8']],
  ['/src/store.js',['src/store.js','text/javascript; charset=utf-8']],
  ['/src/i18n.js',['src/i18n.js','text/javascript; charset=utf-8']],
  ['/src/remote.js',['src/remote.js','text/javascript; charset=utf-8']],
  ['/src/assistant.js',['src/assistant.js','text/javascript; charset=utf-8']],
  ['/src/assistant.css',['src/assistant.css','text/css; charset=utf-8']],
  ['/src/styles.css',['src/styles.css','text/css; charset=utf-8']],
  ['/src/theme-black-gold.css',['src/theme-black-gold.css','text/css; charset=utf-8']]
]);
const landingHTML=fs.readFileSync(path.join(root,'index.html'),'utf8')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/,'')
  .replace('interactive recruiting workspace. Local sample data, no live messaging.', 'recruiting workspace with a protected API and database.')
  .replace('<script defer src="./app.js"></script>','<script defer src="./src/remote.js"></script>')
  .replace('Enable JavaScript to use the local interactive demo.','Enable JavaScript to use Falcon Jobster.');
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
function sharedHeaders(res, options={}) {
  res.setHeader('Content-Security-Policy',CSP);
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if (options.cookieSecure) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
}
export function makeServer({db,allowedOrigin='',cookieSecure=false,assistantApiKey=process.env.OPENAI_API_KEY||'',assistantModel=process.env.OPENAI_MODEL||'gpt-4.1-mini',assistantFetch=fetch}={}) {
  if (!db) throw new Error('A database connection is required');
  const options={allowedOrigin,cookieSecure};
  const handleAssistant=makeAssistantHandler({apiKey:assistantApiKey,model:assistantModel,fetchImpl:assistantFetch});
  return http.createServer(async(req,res)=>{
    sharedHeaders(res,options);
    try {
      const url=new URL(req.url,'http://localhost');
      if (url.pathname.startsWith('/api/assistant/')) return await handleAssistant(req,res,db,url,options);
      if (url.pathname.startsWith('/api/')) return await handleApi(req,res,db,url,options);
      if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{'Allow':'GET, HEAD'});res.end('Method not allowed');return;}
      let body,contentType;
      if (url.pathname==='/'||url.pathname==='/index.html') {body=landingHTML;contentType='text/html; charset=utf-8';}
      else if (ASSETS.has(url.pathname)) {
        const [filename,type]=ASSETS.get(url.pathname);
        body=fs.readFileSync(path.join(root,filename));contentType=type;
      } else {res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-store'});
      if(req.method==='HEAD') return res.end();
      res.end(body);
    } catch(error) {handleError(error,res);}
  });
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const dbPath=path.resolve(process.env.JOBSTER_DB||'var/jobster.sqlite');
  const db=createDatabase(dbPath);
  if (db.prepare('SELECT count(*) AS n FROM users').get().n===0) {
    console.error('No admin account. First run: JOBSTER_ADMIN_EMAIL=... JOBSTER_ADMIN_PASSWORD=... npm run backend:init');
    db.close();process.exit(1);
  }
  const port=Number(process.env.PORT||4174),host=process.env.HOST||'127.0.0.1';
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('PORT must be 1-65535');
  const cookieSecure=process.env.JOBSTER_COOKIE_SECURE==='true';
  if(host==='0.0.0.0'&&!cookieSecure&&process.env.NODE_ENV==='production') throw new Error('Production requires JOBSTER_COOKIE_SECURE=true with HTTPS termination');
  const server=makeServer({db,allowedOrigin:process.env.JOBSTER_ORIGIN||'',cookieSecure});
  server.listen(port,host,()=>console.log(`Falcon Jobster API and UI running at http://${host}:${port} | SQLite: ${dbPath} | outbound applicant messages are never sent | AI assistant: ${process.env.OPENAI_API_KEY?'configured':'needs API key'}`));
  const exit=()=>server.close(()=>{db.close();process.exit(0);});
  process.on('SIGTERM',exit);process.on('SIGINT',exit);
}
