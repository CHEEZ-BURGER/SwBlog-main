import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'dist');
const directories = ['css', 'js', 'font', 'mainPage_img', 'b_log_img', 'catPage_common', 'tech'];
const pages = readdirSync(root).filter(name => /\.(html|js)$/.test(name));
mkdirSync(output, {recursive:true});
for (const name of [...pages, ...directories]) {
  cpSync(path.join(root,name), path.join(output,name), {recursive:true, filter: file => path.basename(file).toLowerCase() !== 'desktop.ini'});
}
const missing = new Set();
function check(directory) {
  for (const name of readdirSync(directory)) {
    const file = path.join(directory,name);
    if (statSync(file).isDirectory()) { check(file); continue; }
    if (!/\.(html|css)$/.test(name)) continue;
    const source = readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => match.slice(0,match.indexOf('>')+1));
    const references = [...source.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g), ...source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)];
    for (const [,reference] of references) {
      if (/^(?:[a-z]+:|\/\/|#|\$|\{)/i.test(reference) || reference.includes('${')) continue;
      const target = reference.split(/[?#]/)[0];
      if (!target) continue;
      const resolved = path.resolve(path.dirname(file),decodeURIComponent(target));
      if (!existsSync(resolved)) missing.add(`${path.relative(output,file)} -> ${target}`);
    }
  }
}
check(output);
if (missing.size) throw new Error('Missing local references:\n'+[...missing].join('\n'));
console.log(`Built ${pages.length} pages/scripts and ${directories.length} asset directories in dist/.`);
