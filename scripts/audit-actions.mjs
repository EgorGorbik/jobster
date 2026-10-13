import fs from 'node:fs';
const code = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const handlers = new Set([...code.matchAll(/case '([^']+)':/g)].map(match => match[1]));
const literal = new Set([...code.matchAll(/data-action="([a-z][a-z-]+)"/g)].map(match => match[1]));
for (const pattern of [/\bbutton\((?:'[^']*'|"[^"]*"), '([^']+)'/g, /\biconButton\((?:'[^']*'|"[^"]*"), '([^']+)'/g]) {
  for (const match of code.matchAll(pattern)) literal.add(match[1]);
}
const missing = [...literal].filter(action => !handlers.has(action));
if (missing.length) {console.error('Unhandled literal UI actions:', missing); process.exitCode = 1;}
else console.log(`${literal.size} literal UI actions mapped to handlers (${handlers.size} total handlers).`);
