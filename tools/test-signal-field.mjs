import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise asynchronous source ownership and animation lifecycle independently of WebGL/CDNs.
const decodes=new Map(),requests=new Map();let frame=0,draws=0;
const context={window:{},performance:{now:()=>1000},Float32Array,Math,Map,
 requestAnimationFrame:cb=>{requests.set(++frame,cb);return frame;},cancelAnimationFrame:id=>requests.delete(id),
 Image:class{width=1200;height=800;decode(){return new Promise((resolve,reject)=>decodes.set(this.src,{resolve,reject}));}},
 document:{hidden:false,createElement:()=>({width:0,height:0,getContext(){return {drawImage(){assert.equal(thisCanvas.width,216);},getImageData:()=>({data:new Uint8Array(216*126*4)})};}})}
};
// Canvas dimensions are asserted at the sampling boundary.
let thisCanvas;
context.document.createElement=()=>thisCanvas={width:0,height:0,getContext(){return {drawImage(){assert.equal(thisCanvas.width,216);assert.equal(thisCanvas.height,126);},getImageData:()=>({data:new Uint8Array(216*126*4)})};}};
const source=readFileSync('js/signalField.js','utf8');
const palette=source.match(/const PALETTE='([^']+)'/)[1];
assert.deepEqual(new Set(palette),new Set('SWBLOG9865421?!<>=+/:-,.'));
assert.ok(!/[░▒▓█]/.test(source),'block glyphs are absent, including transition noise');
vm.runInNewContext(source,context);
const prototype=context.window.AsciiVolumeScene.prototype;
const scene=Object.assign(Object.create(prototype),{cache:new Map(),request:0,caption:{},label:{},figure:{style:{setProperty(){}}},container:{dataset:{}},motion:{matches:false},isActive:true,inView:true,paused:false,draw(){draws++;}});
const first=scene.setPost({id:1,src:'first',title:'first'});
const second=scene.setPost({id:2,src:'second',title:'second'});
decodes.get('second').resolve();await second;const winning=scene.target;
decodes.get('first').resolve();await first;
assert.equal(scene.target,winning);assert.equal(scene.caption.textContent,'A / 002');assert.equal(scene.cache.has('first'),false);
for(let id=3;id<8;id++){const task=scene.setPost({id,src:'image'+id});decodes.get('image'+id).resolve();await task;}
assert.equal(scene.cache.size,4);
const failed=scene.setPost({id:8,src:'missing'});decodes.get('missing').reject(new Error('CORS'));await failed;assert.equal(scene.target,null);
scene.motion.matches=true;scene.schedule();assert.equal(requests.size,0);assert.ok(draws>0);
scene.motion.matches=false;scene.schedule();assert.equal(requests.size,1);
context.document.hidden=true;scene.schedule();assert.equal(requests.size,0);
context.document.hidden=false;scene.inView=false;scene.schedule();assert.equal(requests.size,0);
scene.inView=true;scene.setActive(false);assert.equal(requests.size,0);
scene.setActive(true);assert.equal(requests.size,1);
scene.paused=true;scene.schedule();assert.equal(requests.size,0);
assert.equal(winning.aspect,1.5);
scene.w=540;scene.h=420;
for(const aspect of [.5,1,1.5,2.4]){
 const grid=scene.grid(aspect);
 assert.ok(Math.abs(grid.width/grid.height-aspect)<1e-10);
 assert.ok(grid.width<=scene.w*.9 && grid.height<=scene.h*.86+1e-8);
}
const positions=[];
Object.assign(scene,{paused:false,motion:{matches:false},pointer:{x:.5,y:.5,tx:.5,ty:.5,strength:0,inside:false},
 ctx:{fillRect(){}},atlas(){return {ramp:Array.from(palette,(_,i)=>i)};},stamp(atlas,g,x,y){assert.ok(g>=0&&g<palette.length);positions.push({x,y});},
 rendered:[{x:100,y:80,g:4,font:10,atlas:{}}],renderedCount:1,particles:[]});
scene.releaseGlyphs(1000);assert.equal(scene.particles.length,1);assert.equal(scene.particles[0].y,80);
prototype.draw.call(scene,1500);assert.ok(positions.at(-1).y>150,'old glyph falls under gravity');
assert.equal(scene.particles.length,1,'falling glyph remains until it crosses the floor');
prototype.draw.call(scene,2700);assert.equal(scene.particles.length,0,'particles expire');
scene.rendered=Array.from({length:3024},()=>({x:0,y:0,g:1,font:8,atlas:{}}));scene.renderedCount=3024;
scene.releaseGlyphs(3000);scene.releaseGlyphs(3010);scene.releaseGlyphs(3020);assert.ok(scene.particles.length<=9000);
scene.motion.matches=true;scene.releaseGlyphs(3020);assert.equal(scene.particles.length,0);
scene.motion.matches=false;scene.morphStart=4000;scene.target={aspect:1,values:new Float32Array(3024).fill(.7)};
scene.releaseGlyphs(4000);prototype.draw.call(scene,4450);
assert.ok(scene.renderedCount>0 && scene.renderedCount<3024,'new characters glitch into view');
assert.ok(scene.particles.length>0,'incoming characters overlap outgoing falling characters');
prototype.draw.call(scene,5100);assert.equal(scene.renderedCount,3024,'incoming image resolves completely');
function pixels(gray,alpha=255){return Uint8ClampedArray.from({length:216*126*4},(_,i)=>i%4===3?alpha:gray);}
const white=scene.preprocess(pixels(255),1),black=scene.preprocess(pixels(0),1);
assert.equal(white.values[1500],0);assert.equal(black.values[1500],1);
assert.equal(scene.preprocess(pixels(0,0),1).values[1500],0,'transparent pixels retain the background');
assert.ok(scene.preprocess(pixels(64),1).values[1500]-scene.preprocess(pixels(192),1).values[1500]>.5,'midtone separation increases');
const detail=pixels(255);detail[0]=detail[1]=detail[2]=0;
assert.ok(scene.preprocess(detail,1).values[0]<.1,'single-pixel detail is averaged before mapping');
const edge=pixels(60);for(let y=0;y<126;y++)for(let x=108;x<216;x++){const i=(y*216+x)*4;edge[i]=edge[i+1]=edge[i+2]=195;}
assert.ok(scene.preprocess(edge,1).edges.some(i=>i>=0),'directional glyphs support high-contrast contours');
console.log('PASS: source race/cache/fallback, image aspect, gravity and floor removal, bounded repeats, concurrent glitch reveal and falling glyphs, reduced motion and pause lifecycle.');
console.log('PASS: exact brand-only palette, grayscale/area averaging, midtone contrast, transparency, directional edges.');
