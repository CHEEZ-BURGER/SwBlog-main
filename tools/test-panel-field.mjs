import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// The right-hand panel, exercised without a browser: rows, images and the picture layers are stubs.
const pending=new Map();
const rows=new Map();
const context={window:{},CSS:{escape:value=>String(value)},setTimeout,Promise,
 Image:class{decode(){return new Promise((resolve,reject)=>pending.set(this.src,{resolve,reject}));}},
 document:{querySelector:selector=>{const id=(selector.match(/data-post-id="([^"]+)"/)||[])[1];return id?rows.get(id)||null:null;}}};
vm.runInNewContext(readFileSync('js/panelField.js','utf8'),context);
const PanelScene=context.window.PanelScene;

// The panel picture is read from the comment the editor writes; nothing else counts.
assert.equal(PanelScene.panelImage('<img class="hidden-thumbnail" src="t.png">\n<!--swblog:panel https://cdn/x/panel.jpg-->\n<p>Body</p>'),'https://cdn/x/panel.jpg');
assert.equal(PanelScene.panelImage('<!--  swblog:panel   a.png   -->'),'a.png','spacing inside the comment is forgiven');
assert.equal(PanelScene.panelImage('<p><img src="body.png"></p>'),null,'a body picture is not a panel picture');
assert.equal(PanelScene.panelImage(null),null);
console.log('PASS: the panel picture is read from the editor\'s comment and nothing else.');

// A row knows its post; the panel picture wins over the first picture.
const row=(id,panel,preview,number='01')=>({dataset:{postId:id,category:'DESIGN',...(panel?{panelImg:panel}:{}),...(preview?{previewImg:preview}:{})},
 getAttribute:name=>name==='aria-label'?'Title '+id:null,querySelector:()=>({textContent:number})});
rows.set('1',row('1','panel-1.jpg','first-1.jpg'));rows.set('2',row('2',null,'first-2.jpg','02'));
assert.equal(PanelScene.fromRow(rows.get('1')).src,'panel-1.jpg');
assert.equal(PanelScene.fromRow(rows.get('2')).src,'first-2.jpg','without one, the first picture stands in');
assert.equal(PanelScene.fromRow(rows.get('2')).number,'02');
console.log('PASS: rows give the panel picture first, the first picture otherwise.');

// Pointing: the last post pointed at wins; leaving the list keeps the picture; the same post
// again changes nothing.
{
 const shown=[];
 const scene=Object.assign(Object.create(PanelScene.prototype),{request:0,key:null,show(image,view){shown.push(view.id+':'+image.src);}});
 const first=scene.setPost({id:'1',src:'first-1.jpg'});
 assert.ok(pending.has('panel-1.jpg'),'the panel picture is loaded, not the first picture the list passed');
 const second=scene.setPost({id:'2',src:'first-2.jpg'});
 pending.get('first-2.jpg').resolve();await second;
 pending.get('panel-1.jpg').resolve();await first;
 assert.deepEqual(shown,['2:first-2.jpg'],'a late picture never replaces the current one');
 await scene.setPost(null);assert.equal(scene.key,'2:first-2.jpg','leaving the list keeps the last picture');
 await scene.setPost({id:'2',src:'first-2.jpg'});assert.equal(shown.length,1,'the same post again changes nothing');
 const broken=scene.setPost({id:'1',src:'x'});pending.get('panel-1.jpg').reject(new Error('404'));await broken;
 assert.equal(shown.length,2,'a picture that fails to decode is still shown (the browser draws what it can)');
 console.log('PASS: last post wins, leaving keeps the picture, repeats do nothing.');
}
