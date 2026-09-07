import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
let count=0;
for(const file of ['index.html','post.html','editor.html','preview.html',...readdirSync('js').map(f=>'js/'+f)]) {
    const text=readFileSync(file,'utf8');
    const scripts=file.endsWith('.html') ? [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('src=')).map(m=>m[2]) : [text];
    for(const script of scripts) { new vm.Script(script,{filename:file}); count++; }
}
console.log(`${count} scripts parse successfully.`);
