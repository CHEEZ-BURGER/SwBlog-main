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
assert.ok(prototype.layout.call(Object.assign(Object.create(prototype),{w:640,h:530})).values.length>0,'idle layout initializes before the first post');
const scene=Object.assign(Object.create(prototype),{cache:new Map(),request:0,caption:{},label:{},figure:{style:{setProperty(){}}},container:{dataset:{}},motion:{matches:false},isActive:true,inView:true,paused:false,draw(){draws++;}});
const first=scene.setPost({id:1,src:'first',title:'first'});
const second=scene.setPost({id:2,src:'second',title:'second'});
decodes.get('second').resolve();await second;const winning=scene.target;
decodes.get('first').resolve();await first;
assert.equal(scene.target,winning);assert.equal(scene.cache.has('first'),false);
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
 assert.equal(grid.width,scene.w*.75);
 assert.ok(Math.abs(grid.cols*grid.cw-scene.w*.75)<1e-8);
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
scene.releaseGlyphs(3000);scene.releaseGlyphs(3010);scene.releaseGlyphs(3020);assert.ok(scene.particles.length<=4500);
scene.motion.matches=true;scene.releaseGlyphs(3020);assert.equal(scene.particles.length,0);
scene.motion.matches=false;scene.morphStart=4000;scene.target={aspect:1,values:new Float32Array(3024).fill(.7)};
scene.releaseGlyphs(4000);prototype.draw.call(scene,4450);
assert.ok(scene.renderedCount>0 && scene.renderedCount<3024,'new characters glitch into view');
assert.ok(scene.particles.length>0,'incoming characters overlap outgoing falling characters');
const enteringCount=scene.renderedCount;
prototype.draw.call(scene,5100);assert.ok(scene.renderedCount>enteringCount,'incoming image resolves completely');
for(const aspect of [.5,1,2.4]){
 scene.target.aspect=aspect;prototype.draw.call(scene,5150);
 assert.ok(scene.renderedCount>0);
 assert.ok(scene.rendered.slice(0,scene.renderedCount).every(g=>g.font===13&&g.zoom===1),'glyph size stays fixed across image aspect ratios');
}
scene.target.aspect=1;
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
scene.setRowPointer(1,-1);prototype.draw.call(scene,5200);
assert.ok(scene.tilt.x>0&&scene.tilt.x<18&&scene.tilt.y>0&&scene.tilt.y<24,'tilt eases toward bounded pointer target');
scene.setRowPointer(-1,1);for(let t=5300;t<6800;t+=17)prototype.draw.call(scene,t);
assert.ok(scene.tilt.x<-17.9&&scene.tilt.y<-23.9,'opposite pointer corner reverses both axes');
scene.setRowPointer(null,null);for(let t=6800;t<8400;t+=17)prototype.draw.call(scene,t);
assert.ok(Math.abs(scene.tilt.x)+Math.abs(scene.tilt.y)<.01,'leaving the row restores frontal view');
scene.target={aspect:1,values:new Float32Array(3024).fill(.7)};scene.key='post';scene.setRowPointer(1,-1);for(let t=8500;t<9500;t+=17)prototype.draw.call(scene,t);
scene.setRowPointer(null,null);scene.setPost(null);prototype.draw.call(scene,scene.tiltReturn.start+259);assert.ok(scene.target,'idle waits until the midpoint of tilt return');
prototype.draw.call(scene,scene.tiltReturn.start+261);assert.equal(scene.target,null,'idle ASCII switches at the midpoint of tilt return');
prototype.draw.call(scene,scene.tiltReturn.start+520);assert.ok(Math.abs(scene.tilt.x)+Math.abs(scene.tilt.y)<.01,'midpoint idle switch keeps the tilt return running');
scene.motion.matches=true;scene.setRowPointer(1,1);prototype.draw.call(scene,8500);
assert.equal(scene.tilt.x,0);assert.equal(scene.tilt.y,0);
console.log('PASS: bounded two-axis row tilt, inertia, neutral return and reduced motion.');
const cachedLayout=scene.layout();scene.setRowPointer(.5,.5);
assert.equal(scene.layout(),cachedLayout,'cursor movement reuses precomputed sampling');
scene.w+=100;assert.notEqual(scene.layout(),cachedLayout,'resize invalidates grid sampling');
console.log('PASS: sampling cache reuse and resize invalidation.');
scene.motion.matches=false;scene.pointer.strength=0;scene.tilt={x:0,y:0,tx:0,ty:0};
scene.target={aspect:1.6,values:Float32Array.from({length:3024},(_,i)=>.5+Math.sin(i%72)*.4)};
prototype.draw.call(scene,10000);const frontal=scene.current.slice();
scene.setRowPointer(1,-1);for(let t=10017;t<11500;t+=17)prototype.draw.call(scene,t);
assert.ok(scene.current.some((v,i)=>Math.abs(v-frontal[i])>.08),'rotated source changes sampled brightness');
const stationary=scene.layout();
for(const g of scene.rendered.slice(0,scene.renderedCount)){
 assert.ok(stationary.xs.some(x=>Math.abs(x-g.x)<.0001));
 assert.ok(stationary.ys.some(y=>Math.abs(y-g.y)<.0001),'glyph stays on its original grid while source rotates');
}
console.log('PASS: source-plane rotation with fixed glyph positions and centered 75%-width raster.');


scene.motion.matches=false;scene.particles=[];scene.rendered=Array.from({length:100},(_,i)=>({x:i,y:0}));scene.renderedCount=100;scene.releaseGlyphs(12000);assert.equal(scene.particles.length,50,'exactly half the outgoing glyphs fall');
console.log('PASS: half-density falling particles.');

const idleLayout={xs:new Float32Array([300]),ys:new Float32Array([210])};
scene.pointer={x:.5,y:.5,inside:true};scene.w=600;scene.h=420;
scene.stepIdle(idleLayout,13000,false);
let physics=scene.stepIdle(idleLayout,13017,false);
assert.equal(physics.x[0],0,'stationary cursor does not repel glyphs');
scene.pointer.x=.54;physics=scene.stepIdle(idleLayout,13034,false);
assert.ok(physics.vx[0]>0&&physics.x[0]>0,'cursor travel injects directional momentum');
const displaced=physics.x[0];scene.pointer.inside=false;
scene.stepIdle(idleLayout,13051,false);
assert.ok(physics.x[0]>displaced,'momentum persists after pointer leaves');
for(let t=13068;t<18000;t+=17)scene.stepIdle(idleLayout,t,false);
assert.ok(Math.abs(physics.x[0])<.02,'damped spring settles back to the grid');
assert.equal(scene.stepIdle(idleLayout,18017,false),physics,'physics arrays are reused');
scene.pointer.inside=true;scene.pointer.x=.6;scene.stepIdle(idleLayout,18034,false);
scene.stepIdle(idleLayout,18051,true);assert.equal(physics.x[0],0);assert.equal(physics.vx[0],0);
console.log('PASS: idle momentum, stationary cursor, inertia after leave, spring settling, pooling and reduced motion.');
scene.motion.matches=false;scene.paused=false;scene.particles=[];
scene.rendered=Array.from({length:200},(_,i)=>({x:i,y:-10000,g:1,atlas:{}}));scene.renderedCount=200;
scene.releaseGlyphs(20000);
assert.ok(scene.particles.every(p=>p.expires>=20700&&p.expires<21300&&(p.expires-20000)%100===0));
prototype.draw.call(scene,21300);assert.equal(scene.particles.length,0,'all debris expires within 1.3 seconds even above the floor');
console.log('PASS: staggered 100ms debris expiration with a 1.3-second hard limit.');
const colorAtlas={ramp:Array.from(palette,(_,i)=>i)};colorAtlas.rainbow=Array.from({length:13},(_,i)=>i===12?colorAtlas:{tone:i});
scene.atlas=()=>colorAtlas;scene.loading=false;scene.motion.matches=false;scene.paused=false;scene.particles=[];scene.from=null;scene.target={aspect:1.5,values:new Float32Array(3024).fill(.8)};scene.morphStart=30000;
prototype.draw.call(scene,30450);assert.ok(scene.rendered.slice(0,scene.renderedCount).some(g=>g.atlas!==colorAtlas),'incoming image uses cached rainbow sprites');
prototype.draw.call(scene,31400);assert.ok(scene.rendered.slice(0,scene.renderedCount).every(g=>g.atlas===colorAtlas),'rainbow settles to the original ink');
console.log('PASS: sequential rainbow entry and settled black raster.');
const repeated=Object.assign(Object.create(prototype),{cache:new Map(),request:0,figure:{style:{setProperty(){}}},schedule(){},current:new Float32Array(4),releaseCount:0,releaseGlyphs(){this.releaseCount++;}});
const imageSample={aspect:1.5,values:new Float32Array(3024).fill(.6)};repeated.cache.set('cached',imageSample);
await repeated.setPost({id:42,src:'cached'});assert.equal(repeated.releaseCount,1);
await repeated.setPost(null);await repeated.setPost({id:'42',src:'cached'});
assert.equal(repeated.releaseCount,1,'idle and same-post reentry do not release or replay');assert.ok(repeated.morphStart<0,'reentry is already settled');
const pending=repeated.setPost({id:43,src:'pending'});const obsoleteDecode=decodes.get('pending');await repeated.setPost(null);const reentry=repeated.setPost({id:43,src:'pending'});decodes.get('pending').resolve();await reentry;obsoleteDecode.resolve();await pending;
assert.equal(repeated.releaseCount,2,'in-flight same-post reentry does not start another effect');
scene.atlas=()=>colorAtlas;scene.target={aspect:1.5,values:Float32Array.from({length:3024},(_,i)=>.5+.35*Math.sin(i%72*.2))};scene.from=null;scene.morphStart=0;scene.tilt={x:10,y:20,tx:10,ty:20};scene.reliefDepth=0;
prototype.draw.call(scene,40000);const flat=scene.current.slice();scene.reliefDepth=85;prototype.draw.call(scene,40017);
assert.ok(scene.current.some((v,i)=>Math.abs(v-flat[i])>.04),'luminance relief changes samples at the same tilt');
const depthGrid=scene.layout();for(const g of scene.rendered.slice(0,scene.renderedCount)){assert.ok(depthGrid.xs.some(x=>Math.abs(g.x-x)<.001));assert.ok(depthGrid.ys.some(y=>Math.abs(g.y-y)<.001));assert.equal(g.font,13);}
console.log('PASS: settled/in-flight reentry suppression and luminance relief with fixed 13px grid.');
scene.pointer={x:.5,y:.5,inside:true};scene.idlePhysics=null;scene.w=600;scene.h=420;
const brushGrid={xs:new Float32Array([300]),ys:new Float32Array([210])};scene.stepIdle(brushGrid,50000,false);
scene.pointer.x=.55;const trail=scene.stepIdle(brushGrid,50017,false);assert.ok(trail.ink[0]>.5,'cursor travel leaves rainbow ink');
scene.pointer.inside=false;const freshInk=trail.ink[0];scene.stepIdle(brushGrid,50034,false);assert.ok(trail.ink[0]>0&&trail.ink[0]<freshInk,'rainbow trail persists and fades after leaving');
for(let t=50051;t<53000;t+=17)scene.stepIdle(brushGrid,t,false);assert.ok(trail.ink[0]<.002,'rainbow trail fades to black');
scene.stepIdle(brushGrid,53017,true);assert.equal(trail.ink[0],0,'reduced motion removes trail');
colorAtlas.reflections=Array.from({length:4},(_,level)=>Array.from({length:9},(_,hue)=>({reflection:true,level,hue})));
const reflections=[];scene.stamp=(atlas,g,x,y)=>reflections.push({atlas,alpha:scene.ctx.globalAlpha});scene.tilt={x:4,y:5,tx:4,ty:5};scene.morphStart=100;scene.motion.matches=false;scene.paused=false;
prototype.draw.call(scene,54000);assert.ok(reflections.some(s=>s.atlas.reflection),'settled image selects visible reflected rainbow sprites');assert.equal(reflections.length,scene.renderedCount,'reflection uses one draw per glyph');assert.equal(scene.morphStart,100,'reflection never restarts entry');
console.log('PASS: cursor rainbow trail decay, reduced motion and reflection independent of entry animation.');
