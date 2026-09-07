import {readFileSync,writeFileSync} from 'node:fs';
const colors={'#f5f3ee':'#f5f5f3','#232420':'#171717','#74766e':'#6b6b68','#315fbd':'#3058f9','#d7d9cf':'#d4d4d0','#e9ede6':'#e9e9e6','#dfe8ba':'#dce7ff','#e5e7de':'#e7e7e4','#e9ece3':'#e9e9e6','#e8ecdf':'#ebebe8','#b9c3af':'#bdbdb8','#c5ceba':'#c6c6c0','#e6eadf':'#e7e7e3','#20281f80':'#20202080','#c8d0bd':'#cacac5','#26332012':'#20202012','#9ca591':'#a0a09b'};
for(const file of ['css/editorial.css','css/editorRefinement.css','preview.html']){
 let s=readFileSync(file,'utf8');for(const[a,b]of Object.entries(colors))s=s.replaceAll(a,b);
 if(file==='css/editorial.css')s=s.replace('font-size:17px; line-height:1.92','font-size:18px; line-height:1.92').replace('font:11px/1.4','font:13px/1.4').replace('font:12px/1.65','font:14px/1.65').replace('font-size:16px; line-height:1.9','font-size:17px; line-height:1.9');
 writeFileSync(file,s,'utf8');
}
