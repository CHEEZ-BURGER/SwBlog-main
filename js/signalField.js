/* Bounded luminance samples, with the existing scene lifecycle interface. */
(() => {
    'use strict';
    // Only these brand characters may be stamped, including transitional noise and debris.
    const PALETTE='.,-:/=+<>!1?24L5S6G9O8BW';
    class SignalField {
        constructor(id) {
            this.container = document.getElementById(id);
            this.isActive = true; this.inView = true; this.paused = false;
            this.motion = matchMedia('(prefers-reduced-motion: reduce)');this.mobile=matchMedia('(max-width:1180px)');
            this.abort = new AbortController(); this.cache = new Map(); this.request = 0;
            this.pointer = {x:.5,y:.5,tx:.5,ty:.5,strength:0,inside:false};
            this.particles=[];this.rendered=[];this.renderedCount=0;this.atlases=new Map();
            this.figure = document.createElement('figure'); this.figure.className = 'ascii-volume signal-field';
            this.figure.innerHTML = '<div class="ascii-caption"><span>A / FIELD 00</span><span>LATENT CONTENT</span></div><canvas class="ascii-volume-canvas" role="img" aria-label="콘텐츠 이미지로 재구성되는 ASCII 필드"></canvas><figcaption><span class="signal-label">MOVE TO EXPLORE</span><button type="button" aria-label="ASCII 움직임 일시정지" aria-pressed="false">Ⅱ</button></figcaption>';
            this.container.replaceChildren(this.figure); this.container.classList.add('ascii-placeholder');
            this.canvas = this.figure.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
            this.caption = this.figure.querySelector('.ascii-caption span'); this.label = this.figure.querySelector('.signal-label'); this.button = this.figure.querySelector('button');
            const opts = {signal:this.abort.signal};
            this.button.addEventListener('click', () => {
                this.paused = !this.paused; this.button.textContent = this.paused ? '▷' : 'Ⅱ';
                this.button.setAttribute('aria-pressed',String(this.paused)); this.button.setAttribute('aria-label',this.paused ? 'ASCII 움직임 재생' : 'ASCII 움직임 일시정지'); this.schedule();
            },opts);
            this.figure.addEventListener('pointermove',e => {
                const r=this.canvas.getBoundingClientRect(); this.pointer.tx=(e.clientX-r.left)/r.width; this.pointer.ty=(e.clientY-r.top)/r.height;
                if(!this.pointer.inside){this.pointer.x=this.pointer.tx;this.pointer.y=this.pointer.ty;}this.pointer.inside=true;
            },opts);
            this.figure.addEventListener('pointerleave',()=>{this.pointer.inside=false;},opts);
            document.addEventListener('visibilitychange',()=>this.schedule(),opts);
            document.addEventListener('scroll',()=>{
                if(!this.isActive)return;
                const footer=document.querySelector('#archive-panel .footer');if(!footer)return;
                this.dissolve=Math.max(0,Math.min(1,(innerHeight*1.4-footer.getBoundingClientRect().top)/(innerHeight*.4)));
                this.dirty=true;
                if(this.motion.matches||this.paused)this.draw();
            },{capture:true,passive:true,...opts});
            this.motion.addEventListener('change',()=>this.schedule(),opts);
            this.resizeObserver=new ResizeObserver(()=>this.onResize()); this.resizeObserver.observe(this.canvas);
            this.intersection=new IntersectionObserver(([e])=>{this.inView=e.isIntersecting;this.schedule();}); this.intersection.observe(this.figure);
            this.mobile.addEventListener('change',()=>this.place(),opts);this.place();this.onResize();
        }
        place(){
            if(this.mobile.matches){let host=document.querySelector('.mobile-signal');if(!host){host=document.createElement('div');host.className='mobile-signal';document.querySelector('#archive-panel .main-cont-back').after(host);}host.append(this.figure);}
            else this.container.append(this.figure);
        }
        onResize() {
            const r=this.canvas.getBoundingClientRect(); if(!r.width||!r.height)return;
            this.w=r.width;this.h=r.height; const dpr=Math.min(devicePixelRatio||1,2);
            this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);
            this.ctx.setTransform(dpr,0,0,dpr,0,0);this.schedule();
        }
        async setPost(post=null) {
            const key=post?.id??'';if(key===this.key)return;this.key=key;const ticket=++this.request;
            // Release immediately, even when the next image still needs decoding.
            this.from=this.current?.slice();
            this.releaseGlyphs(performance.now());this.renderedCount=0;this.loading=true;this.schedule();
            this.caption.textContent=post?'A / '+String(key).padStart(3,'0'):'A / FIELD 00';this.label.textContent=post?.title||'MOVE TO EXPLORE';
            this.figure.style.setProperty('--signal-accent',({DESIGN:'#FFBA59',LIFE:'#FF6E8E'})[post?.category]||'#569AFF');
            let sample=null;
            if(post?.src){
                sample=this.cache.get(post.src);
                if(!sample)try{
                    const img=new Image();img.crossOrigin='anonymous';img.src=post.src;await img.decode();if(ticket!==this.request)return;
                    const c=document.createElement('canvas');c.width=216;c.height=126;const ctx=c.getContext('2d',{willReadFrequently:true});
                    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
                    ctx.drawImage(img,0,0,216,126);
                    sample=this.preprocess(ctx.getImageData(0,0,216,126).data,img.width/img.height);
                    this.cache.set(post.src,sample);if(this.cache.size>4)this.cache.delete(this.cache.keys().next().value);
                }catch{sample=null;/* Missing or cross-origin media falls back to the abstract field. */}
            }
            if(ticket!==this.request)return;
            this.loading=false;this.target=sample;this.morphStart=performance.now();this.schedule();
        }
        preprocess(px,aspect) {
            const gray=new Float32Array(3024),values=new Float32Array(3024),edges=new Int16Array(3024).fill(-1);
            // Area-average nine grayscale pixels before quantization: small texture loses priority.
            for(let y=0;y<42;y++)for(let x=0;x<72;x++){
                let sum=0;
                for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){
                    const p=((y*3+dy)*216+x*3+dx)*4;
                    sum+=(1-(px[p]*.2126+px[p+1]*.7152+px[p+2]*.0722)/255)*px[p+3]/255;
                }
                gray[y*72+x]=sum/9;
            }
            for(let y=0;y<42;y++)for(let x=0;x<72;x++){
                const i=y*72+x;
                const average=(gray[y*72+Math.max(0,x-1)]+gray[y*72+Math.min(71,x+1)]+gray[Math.max(0,y-1)*72+x]+gray[Math.min(41,y+1)*72+x])/4;
                let d=(gray[i]*.85+average*.15-.5)*1.16+.5;
                d=Math.max(0,Math.min(1,d));
                // A gentle S curve separates midtones without flattening all shadows to one glyph.
                values[i]=d*.7+(d*d*(3-2*d))*.3;
            }
            for(let y=1;y<41;y++)for(let x=1;x<71;x++){
                const i=y*72+x,gx=values[i+1]-values[i-1],gy=values[i+72]-values[i-72];
                if(Math.hypot(gx,gy)>.28&&values[i]>.14&&values[i]<.84&&i%3===0){
                    const mark=Math.abs(gy)>Math.abs(gx)*1.6?'=':Math.abs(gx)>Math.abs(gy)*1.6?(gx>0?'>':'<'):(gx*gy>0?'/':'+');
                    edges[i]=PALETTE.indexOf(mark);
                }
            }
            return {aspect,values,edges};
        }
        releaseGlyphs(now) {
            if(this.motion.matches||this.paused){this.particles=[];return;}
            const old=(this.rendered||[]).slice(0,this.renderedCount??this.rendered?.length);
            this.particles=(this.particles||[]).concat(old.map((g,i)=>{
                const seed=Math.sin((i+1)*127.1)*43758.5453;
                return {...g,start:now+(seed-Math.floor(seed))*280,
                    vx:Math.sin(i*12.9898)*28,vy:24+(1+Math.cos(i*78.233))*42};
            })).slice(-9000);
        }
        atlas(font) {
            const size=Math.max(2,Math.round(font));
            this.atlases ||= new Map();if(this.atlases.has(size))return this.atlases.get(size);
            const cell=size+4,scale=Math.min(devicePixelRatio||1,2),canvas=document.createElement('canvas');
            canvas.width=Math.ceil(cell*PALETTE.length*scale);canvas.height=Math.ceil(cell*scale);
            const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.scale(scale,scale);ctx.font='600 '+size+'px monospace';ctx.textBaseline='top';ctx.fillStyle='#121212';
            Array.from(PALETTE).forEach((g,i)=>ctx.fillText(g,i*cell,0));
            // Measure actual ink coverage once per font size, not on animation frames.
            const ink=ctx.getImageData(0,0,canvas.width,canvas.height).data;
            const ramp=Array.from(PALETTE,(_,index)=>{
                let weight=0;const start=Math.round(index*cell*scale),end=Math.round((index+1)*cell*scale);
                for(let y=0;y<canvas.height;y++)for(let x=start;x<end;x++)weight+=ink[(y*canvas.width+x)*4+3];
                return {index,weight};
            }).sort((a,b)=>a.weight-b.weight||a.index-b.index).map(g=>g.index);
            const atlas={canvas,cell,scale,ramp};this.atlases.set(size,atlas);
            if(this.atlases.size>12)this.atlases.delete(this.atlases.keys().next().value);
            return atlas;
        }
        stamp(atlas,g,x,y) {
            const {canvas,cell,scale}=atlas;
            this.ctx.drawImage(canvas,g*cell*scale,0,cell*scale,cell*scale,x,y,cell,cell);
        }
        grid(aspect) {
            const width=Math.min(this.w*.9,this.h*.86*aspect),height=width/aspect;
            return {cw:width/72,ch:height/42,ox:(this.w-width)/2,oy:(this.h-height)/2,width,height};
        }
        draw(now=performance.now()) {
            if(!this.w)return;const c=this.ctx,w=this.w,h=this.h;
            const still=this.motion.matches||this.paused,t=still?0:now/1000;
            const phase=still?1:Math.max(0,Math.min(1,(now-(this.morphStart||0)-120)/780));
            const morph=phase*phase*(3-2*phase);
            this.current ||= new Float32Array(3024);this.renderedCount=0;
            c.globalAlpha=1;c.fillStyle='#F7F1ED';c.fillRect(0,0,w,h);
            const {cw,ch,ox,oy}=this.grid(this.target?.aspect||1.22);
            const font=Math.max(2,Math.min(ch,cw/.61));
            const atlas=this.atlas(font);c.fillStyle='#121212';
            this.pointer.x+=(this.pointer.tx-this.pointer.x)*.12;this.pointer.y+=(this.pointer.ty-this.pointer.y)*.12;
            this.pointer.strength+=((this.pointer.inside?1:0)-this.pointer.strength)*.12;
            if(!this.loading)for(let y=0;y<42;y++)for(let x=0;x<72;x++){
                const i=y*72+x,nx=(x-36)/27,ny=(y-21)/17;
                let value=this.target?this.target.values[i]:Math.min(1,Math.max(0,1-Math.hypot(nx,ny)+Math.sin(nx*5+ny*3+t*.18)*.11)*(.8+Math.sin(t*.9)*.025));
                if(this.from&&phase<1)value=this.from[i]*(1-morph)+value*morph;
                let px=ox+x*cw,py=oy+y*ch;
                if(!still&&this.pointer.strength>.002){
                    const dx=px-this.pointer.x*w,dy=py-this.pointer.y*h,d=Math.hypot(dx,dy);
                    const radius=this.target?145:Math.min(240,w*.46);
                    const force=Math.pow(Math.max(0,1-d/radius),2)*this.pointer.strength;
                    const push=this.target?8:72;
                    px+=(dx/Math.max(d,1)*push-dy/Math.max(d,1)*push*.28)*force;
                    py+=(dy/Math.max(d,1)*push+dx/Math.max(d,1)*push*.28)*force;
                    value+=force*(this.target ? .18 : .68);
                }
                this.current[i]=Math.max(0,Math.min(1,value));
                const density=this.current[i]*(1-(this.dissolve||0));
                const rank=Math.min(PALETTE.length-1,Math.floor(Math.pow(density,.82)*PALETTE.length));
                let g=density<.025?-1:atlas.ramp[rank];
                if(g>=0&&this.target?.edges?.[i]>=0)g=this.target.edges[i];
                if(g>=0&&phase<1){
                    // Deterministic, low-frequency character noise, then a clean lock-in.
                    const noise=((Math.imul(i+1,16807)^Math.imul(Math.floor(now/75)+1,48271))>>>0)%1000/1000;
                    if(noise>phase*.85+.15)continue;
                    if(noise>phase*.65)g=atlas.ramp[Math.floor(noise*(PALETTE.length-1))];
                    // Characters change in place; the incoming image keeps one stable grid.
                }
                if(g>=0){
                    this.stamp(atlas,g,px,py);
                    const entry=this.rendered[this.renderedCount]||(this.rendered[this.renderedCount]={});
                    entry.x=px;entry.y=py;entry.g=g;entry.atlas=atlas;entry.font=font;
                    this.renderedCount++;
                }
            }
            if(still)this.particles=[];
            else {
                let retained=0;
                for(const p of this.particles){
                    const age=Math.max(0,(now-p.start)/1000);
                    const x=p.x+p.vx*age,y=p.y+p.vy*age+260*age*age;
                    if(y>h)continue;
                    this.particles[retained++]=p;
                    this.stamp(p.atlas,p.g,x,y);
                }
                this.particles.length=retained;
            }
            c.globalAlpha=1;if(this.dissolve>.92)this.stamp(atlas,PALETTE.indexOf('.'),w/2,h/2);
            this.container.dataset.asciiSource=this.target?'image':'field';
            this.container.dataset.asciiParticles=String(this.particles.length);
            this.dirty=false;
        }
        schedule(){
            cancelAnimationFrame(this.raf);this.raf=null;this.container.dataset.asciiState=this.isActive&&!this.paused&&!this.motion.matches?'running':'paused';
            if(!this.isActive||document.hidden||!this.inView)return;this.draw();if(this.paused||this.motion.matches)return;
            const tick=now=>{if(!this.isActive||document.hidden||!this.inView)return;
                if(this.dirty||!this.target||this.loading||this.particles.length||now-this.morphStart<1000||this.pointer.inside||this.pointer.strength>.002)this.draw(now);
                this.raf=requestAnimationFrame(tick);};this.raf=requestAnimationFrame(tick);
        }
        snapshot(){return this.canvas;}
        setActive(active){this.isActive=active;this.schedule();}
        destroy(){++this.request;this.isActive=false;cancelAnimationFrame(this.raf);this.abort.abort();this.resizeObserver.disconnect();this.intersection.disconnect();this.figure.remove();this.cache.clear();this.container.classList.remove('ascii-placeholder');}
    }
    window.AsciiVolumeScene=SignalField;
})();
