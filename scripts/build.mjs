import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = ['src/icons.js', 'src/seed.js', 'src/store.js', 'src/i18n.js', 'app.js', 'src/assistant.js'];
for (const file of scripts) execFileSync(process.execPath, ['--check', path.join(root, file)], {stdio: 'inherit'});
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const assistantCss = fs.readFileSync(path.join(root, 'src/assistant.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="./src/styles.css">', () => '<style>\n' + css.replaceAll('</style', '<\\/style') + '\n</style>');
html = html.replace('<link rel="stylesheet" href="./src/assistant.css">', () => '<style>\n' + assistantCss.replaceAll('</style', '<\\/style') + '\n</style>');
for (const file of scripts) {
  const content = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('</script', '<\\/script');
  html = html.replace(`<script defer src="./${file}"></script>`, () => '<script>\n' + content + '\n</script>');
}
fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
console.log(`Built dist/index.html (${Buffer.byteLength(html)} bytes). Self-contained: no libraries, fonts, or network requests required.`);
