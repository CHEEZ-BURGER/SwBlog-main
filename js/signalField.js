/* Bounded luminance samples, with the existing scene lifecycle interface. */
(() => {
    'use strict';
    // Only these brand characters may be stamped, including transitional noise and debris.
    const PALETTE='.,-:/=+<>!1?24L5S6G9O8BW';
    const DENSITY_RANK=Uint8Array.from({length:1024},(_,i)=>Math.min(PALETTE.length-1,Math.floor(Math.pow(i/1023,.82)*PALETTE.length)));
    class SignalField {
        constructor(id) {
            this.container = document.getElementById(id);
            this.isActive = true; this.inView = true; this.paused = false;
            this.motion = matchMedia('(prefers-reduced-motion: reduce)');this.mobile=matchMedia('(max-width:1180px)');
            this.abort = new AbortController(); this.cache = new Map(); this.request = 0;
            this.pointer = {x:.5,y:.5,tx:.5,ty:.5,strength:0,inside:false};
            this.particles=[];this.rendered=[];this.renderedCount=0;this.atlases=new Map();
            this.tiltReturn=null;this.pendingIdle=false;
            this.rasterFont='900 13px "SWBLOG Diatype Heavy", "Arial Black", "Pretendard Variable", Arial, sans-serif';
            document.fonts?.load('900 13px "SWBLOG Diatype Heavy"').then(()=>{
                if(this.abort.signal.aborted)return;this.atlases.clear();this.dirty=true;this.schedule();
            }).catch(()=>{});
            this.figure = document.createElement('figure'); this.figure.className = 'ascii-volume signal-field';
            this.figure.innerHTML = '<canvas class="ascii-volume-canvas" role="img" aria-label="콘텐츠 이미지로 재구성되는 ASCII 필드"></canvas>';
            this.container.replaceChildren(this.figure); this.container.classList.add('ascii-placeholder');
            this.canvas = this.figure.querySelector('canvas'); this.ctx = this.canvas.getContext('2d',{alpha:false,desynchronized:true});
            const opts = {signal:this.abort.signal};
            this.figure.addEventListener('pointermove',e => {
                const r=this.canvas.getBoundingClientRect(); this.pointer.tx=(e.clientX-r.left)/r.width; this.pointer.ty=(e.clientY-r.top)/r.height;
                if(!this.pointer.inside){this.pointer.x=this.pointer.tx;this.pointer.y=this.pointer.ty;}this.pointer.inside=true;this.dirty=true;this.schedule();
            },opts);
            this.figure.addEventListener('pointerleave',()=>{this.pointer.inside=false;this.schedule();},opts);
            document.addEventListener('visibilitychange',()=>this.schedule(),opts);
            document.addEventListener('scroll',()=>{
                if(!this.isActive)return;
                const footer=document.querySelector('#archive-panel .footer');if(!footer)return;
                this.dissolve=Math.max(0,Math.min(1,(innerHeight*1.4-footer.getBoundingClientRect().top)/(innerHeight*.4)));
                this.dirty=true;
                this.schedule();
            },{capture:true,passive:true,...opts});
            this.motion.addEventListener('change',()=>this.schedule(),opts);
            this.resizeObserver=new ResizeObserver(()=>this.onResize()); this.resizeObserver.observe(this.canvas);
            this.intersection=new IntersectionObserver(([e])=>{this.inView=e.isIntersecting;this.schedule();}); this.intersection.observe(this.figure);
            this.mobile.addEventListener('change',()=>this.place(),opts);this.place();this.onResize();
        }
        place(){
            if(this.mobile.matches){
                let host=document.querySelector('.mobile-signal');
                if(!host){
                    host=document.createElement('div');host.className='mobile-signal';
                    const heading=document.querySelector('#archive-panel .main-cont-back > .main-line > .main-inner');
                    if(heading)heading.after(host);else document.querySelector('#archive-panel .main-cont-back')?.prepend(host);
                }
                host.append(this.figure);
            }
            else this.container.append(this.figure);
        }
        onResize() {
            const r=this.canvas.getBoundingClientRect(); if(!r.width||!r.height)return;
            this.w=r.width;this.h=r.height; const dpr=Math.min(devicePixelRatio||1,1.5,Math.sqrt(1800000/(r.width*r.height)));
            this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);
            this.ctx.setTransform(dpr,0,0,dpr,0,0);this.dirty=true;this.schedule();
        }
        async setPost(post=null) {
            const key=post?String(post.id)+':'+(post.src||''):'';
            if(key===this.key)return;this.key=key;const ticket=++this.request;
            if(!post){
                this.pendingIdle=true;this.loading=false;this.dirty=true;this.schedule();return;
            }
            this.pendingIdle=false;
            // Leaving a row and returning to the same image must not replay its entry effects.
            const animate=!!post&&key!==this.lastImageKey;
            if(post)this.lastImageKey=key;
            // Release immediately, even when the next image still needs decoding.
            this.from=animate?this.current?.slice():null;
            if(animate)this.releaseGlyphs(performance.now());
            this.renderedCount=0;this.loading=true;this.schedule();
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
            this.loading=false;this.target=sample;this.morphStart=performance.now()-(animate?0:2000);this.schedule();
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
            // Only half the outgoing glyphs become particles; the rest disappear immediately.
            const old=(this.rendered||[]).slice(0,this.renderedCount??this.rendered?.length).filter((_,i)=>i%2===0);
            this.particles=(this.particles||[]).concat(old.map((g,i)=>{
                const seed=Math.sin((i+1)*127.1)*43758.5453;
                const lifetime=700+Math.floor(Math.random()*6)*100;
                return {...g,start:now+(seed-Math.floor(seed))*280,expires:now+lifetime,
                    vx:Math.sin(i*12.9898)*28,vy:24+(1+Math.cos(i*78.233))*42};
            })).slice(-4500);
        }
        atlas(font) {
            const size=Math.max(2,Math.round(font));
            this.atlases ||= new Map();if(this.atlases.has(size))return this.atlases.get(size);
            const cell=size+4,scale=Math.min(devicePixelRatio||1,1.5),canvas=document.createElement('canvas');
            canvas.width=Math.ceil(cell*PALETTE.length*scale);canvas.height=Math.ceil(cell*scale);
            const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.scale(scale,scale);ctx.font=this.rasterFont;ctx.textBaseline='top';ctx.fillStyle='#121212';
            Array.from(PALETTE).forEach((g,i)=>{const width=Math.min(11,ctx.measureText(g).width);ctx.fillText(g,i*cell+(11-width)/2,0,11);});
            // Measure actual ink coverage once per font size, not on animation frames.
            const ink=ctx.getImageData(0,0,canvas.width,canvas.height).data;
            const ramp=Array.from(PALETTE,(_,index)=>{
                let weight=0;const start=Math.round(index*cell*scale),end=Math.round((index+1)*cell*scale);
                for(let y=0;y<canvas.height;y++)for(let x=start;x<end;x++)weight+=ink[(y*canvas.width+x)*4+3];
                return {index,weight};
            }).sort((a,b)=>a.weight-b.weight||a.index-b.index).map(g=>g.index);
            // Every color shares one texture: no per-glyph texture swaps or second overlay pass.
            const stops=[[86,154,255],[255,110,142],[255,186,89],[18,18,18]];
            const colors=Array.from({length:12},(_,i)=>{const segment=Math.floor(i/4),mix=(i%4)/4;return stops[segment].map((v,c)=>Math.round(v+(stops[segment+1][c]-v)*mix));});
            const rowHeight=canvas.height,sprites=document.createElement('canvas');
            sprites.width=canvas.width;sprites.height=rowHeight*49;
            const sheet=sprites.getContext('2d');sheet.drawImage(canvas,0,0);
            const atlas={canvas:sprites,cell,scale,ramp,sourceY:0};
            const tint=document.createElement('canvas');tint.width=canvas.width;tint.height=rowHeight;const paint=tint.getContext('2d');
            let row=1;
            const addColor=color=>{
                paint.globalCompositeOperation='source-over';paint.clearRect(0,0,tint.width,tint.height);paint.drawImage(canvas,0,0);
                paint.globalCompositeOperation='source-in';paint.fillStyle='rgb('+color.join(',')+')';paint.fillRect(0,0,tint.width,tint.height);
                const sourceY=row++*rowHeight;sheet.drawImage(tint,0,sourceY);
                return {canvas:sprites,cell,scale,ramp,sourceY};
            };
            atlas.rainbow=colors.map(addColor);atlas.rainbow.push(atlas);
            atlas.reflections=Array.from({length:4},(_,level)=>colors.slice(0,9).map(color=>addColor(color.map(v=>Math.round(18+(v-18)*(.22+level*.2))))));
            this.atlases.set(size,atlas);
            if(this.atlases.size>12)this.atlases.delete(this.atlases.keys().next().value);
            return atlas;
        }
        setRowPointer(x,y) {
            this.tilt ||= {x:0,y:0,tx:0,ty:0};
            const enabled=x!==null&&y!==null&&!this.motion.matches&&!this.paused;
            if(!enabled){
                this.tiltReturn={start:performance.now(),x:this.tilt.x,y:this.tilt.y};
            }else this.tiltReturn=null;
            this.tilt.tx=enabled?-Math.max(-1,Math.min(1,y))*18:0;
            this.tilt.ty=enabled?Math.max(-1,Math.min(1,x))*24:0;
            this.dirty=true;this.schedule();
        }
        tiltReturnEase(value) {
            const x=value,epsilon=.0001;
            let t=value;
            for(let i=0;i<8;i++){
                const inverse=1-t,bezier=3*inverse*inverse*t*.97+3*inverse*t*t*.06+t*t*t-x;
                const slope=3*inverse*inverse*.97+6*inverse*t*(.06-.97)+3*t*t*(1-.06);
                if(Math.abs(slope)<epsilon)break;t-=bezier/slope;t=Math.max(0,Math.min(1,t));
            }
            return 3*(1-t)*t*t+t*t*t;
        }
        stepIdle(layout,now,still) {
            const n=layout.xs.length,p=this.pointer;
            if(this.idlePhysics?.layout!==layout){
                this.idlePhysics={layout,x:new Float32Array(n),y:new Float32Array(n),vx:new Float32Array(n),vy:new Float32Array(n),ink:new Float32Array(n),px:p.x,py:p.y,time:now};
            }
            const s=this.idlePhysics,dt=Math.max(.001,Math.min(.032,(now-s.time)/1000));s.time=now;
            // Cursor travel injects momentum; a resting cursor applies no repulsion.
            const ux=p.inside?Math.max(-1800,Math.min(1800,(p.x-s.px)*this.w/dt)):0;
            const uy=p.inside?Math.max(-1800,Math.min(1800,(p.y-s.py)*this.h/dt)):0;
            s.px=p.x;s.py=p.y;
            if(still){s.x.fill(0);s.y.fill(0);s.vx.fill(0);s.vy.fill(0);s.ink.fill(0);return s;}
            const radius=Math.min(220,this.w*.36),r2=radius*radius,damping=Math.exp(-3.8*dt);
            const brush=Math.min(1,Math.hypot(ux,uy)/260),inkDecay=Math.exp(-2.4*dt);
            for(let i=0;i<n;i++){
                const dx=layout.xs[i]+s.x[i]-p.x*this.w,dy=layout.ys[i]+s.y[i]-p.y*this.h;
                const influence=Math.max(0,1-(dx*dx+dy*dy)/r2);
                const force=influence*influence*8;
                s.ink[i]=Math.max(s.ink[i]*inkDecay,influence*influence*brush);
                s.vx[i]=(s.vx[i]+(ux*force-s.x[i]*16)*dt)*damping;
                s.vy[i]=(s.vy[i]+(uy*force-s.y[i]*16)*dt)*damping;
                s.x[i]+=s.vx[i]*dt;s.y[i]+=s.vy[i]*dt;
            }
            return s;
        }
        stamp(atlas,g,x,y,zoom=1) {
            const {canvas,cell,scale}=atlas;
            this.ctx.drawImage(canvas,g*cell*scale,atlas.sourceY||0,cell*scale,cell*scale,x,y,cell*zoom,cell*zoom);
        }
        grid(aspect) {
            const width=this.w*.75,cols=Math.max(1,Math.ceil(width/11)),cw=width/cols,ch=15,rows=Math.max(1,Math.floor(this.h/ch));
            const height=width/aspect;
            return {cw,ch,cols,rows,ox:(this.w-cols*cw)/2,oy:(this.h-rows*ch)/2,
                imageX:(this.w-width)/2,imageY:(this.h-height)/2,width,height};
        }
        sampleAt(u,v) {
            if(u<0||u>=1||v<0||v>=1)return 0;
            const sx=u*71,sy=v*41,x=Math.floor(sx),y=Math.floor(sy),fx=sx-x,fy=sy-y,a=this.target.values,j=y*72+x;
            return (a[j]*(1-fx)+a[y*72+Math.min(71,x+1)]*fx)*(1-fy)
                +(a[Math.min(41,y+1)*72+x]*(1-fx)+a[Math.min(41,y+1)*72+Math.min(71,x+1)]*fx)*fy;
        }
        layout() {
            if(this.layoutCache&&this.layoutCache.target===this.target&&this.layoutCache.w===this.w&&this.layoutCache.h===this.h)return this.layoutCache;
            const grid=this.grid(this.target?.aspect||1.22),{cw,ch,cols,rows,ox,oy,imageX,imageY,width,height}=grid,n=cols*rows;
            const values=new Float32Array(n),edges=new Int16Array(n).fill(-1),xs=new Float32Array(n),ys=new Float32Array(n),radius=new Float32Array(n),wave=new Float32Array(n);
            for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
                const i=y*cols+x,px=xs[i]=ox+x*cw,py=ys[i]=oy+y*ch;
                if(this.target){
                    const u=(px+cw/2-imageX)/width,v=(py+ch/2-imageY)/height;
                    if(u<0||u>=1||v<0||v>=1)continue;
                    const sx=u*71,sy=v*41,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,a=this.target.values,j=y0*72+x0;
                    values[i]=(a[j]*(1-fx)+a[y0*72+Math.min(71,x0+1)]*fx)*(1-fy)
                        +(a[Math.min(41,y0+1)*72+x0]*(1-fx)+a[Math.min(41,y0+1)*72+Math.min(71,x0+1)]*fx)*fy;
                    edges[i]=this.target.edges?.[j]??-1;
                }else {
                    const nx=(x-cols/2)/(cols*.375),ny=(y-rows/2)/(rows*.405);
                    radius[i]=1-Math.hypot(nx,ny);wave[i]=nx*5+ny*3;
                }
            }
            return this.layoutCache={...grid,target:this.target,w:this.w,h:this.h,values,edges,xs,ys,radius,wave};
        }
        draw(now=performance.now()) {
            if(!this.w)return;const c=this.ctx,w=this.w,h=this.h;
            const still=this.motion.matches||this.paused,t=still?0:now/1000;
            this.tilt ||= {x:0,y:0,tx:0,ty:0};
            const returnState=this.tiltReturn&&!still?this.tiltReturn:null;
            const returnProgress=returnState?Math.min(1,(now-returnState.start)/520):0;
            const rx=this.target&&!still?this.tilt.tx:0,ry=this.target&&!still?this.tilt.ty:0;
            if(returnState){
                const eased=this.tiltReturnEase(returnProgress);
                this.tilt.x=returnState.x*(1-eased);this.tilt.y=returnState.y*(1-eased);
                if(this.pendingIdle&&returnProgress>=.5){
                    this.releaseGlyphs(now);
                    this.pendingIdle=false;this.target=null;this.from=null;this.layoutCache=null;
                }
                if(returnProgress>=1)this.tiltReturn=null;
            }else{
                const lerp=1-Math.exp(-Math.min(64,now-(this.tiltTime??now-16.67))/125);this.tiltTime=now;
                this.tilt.x+=(rx-this.tilt.x)*lerp;this.tilt.y+=(ry-this.tilt.y)*lerp;
            }
            if(still)this.tilt.x=this.tilt.y=0;
            this.tiltMoving=Math.abs(rx-this.tilt.x)+Math.abs(ry-this.tilt.y)>.005;
            const ax=this.tilt.x*Math.PI/180,ay=this.tilt.y*Math.PI/180;
            const cosX=Math.cos(ax),sinX=Math.sin(ax),cosY=Math.cos(ay),sinY=Math.sin(ay);
            const phase=still?1:Math.max(0,Math.min(1,(now-(this.morphStart||0)-120)/780));
            const morph=phase*phase*(3-2*phase);
            this.renderedCount=0;
            c.globalAlpha=1;c.fillStyle='#F7F1ED';c.fillRect(0,0,w,h);
            const layout=this.layout(),{cols,rows}=layout;
            if(this.current?.length!==cols*rows){this.current=new Float32Array(cols*rows);this.from=null;}
            const font=13; // Fixed typography; only the source plane is perspective-transformed.
            const atlas=this.atlas(font);c.fillStyle='#121212';
            this.pointer.x+=(this.pointer.tx-this.pointer.x)*.12;this.pointer.y+=(this.pointer.ty-this.pointer.y)*.12;
            this.pointer.strength+=((this.pointer.inside?1:0)-this.pointer.strength)*.12;
            const idle=!this.target?this.stepIdle(layout,now,still):null;
            const idlePulse=.8+Math.sin(t*.9)*.025,noiseFrame=Math.imul(Math.floor(now/75)+1,48271);
            const reliefDepth=this.reliefDepth??Math.min(220,layout.width*.45);
            const reflectionCenter=sinY*.65-sinX*.3;
            const reflectionStrength=still?0:Math.min(1,(Math.abs(sinX)+Math.abs(sinY))*7);
            if(!this.loading)for(let i=0;i<cols*rows;i++){
                let px=layout.xs[i],py=layout.ys[i];
                let value=this.target?layout.values[i]:Math.min(1,Math.max(0,layout.radius[i]+Math.sin(layout.wave[i]+t*.18)*.11)*idlePulse);
                let edge=layout.edges[i];
                if(this.target&&(Math.abs(ax)+Math.abs(ay)>.00001)){
                    // Inverse perspective: ray through a stationary glyph cell hits the rotated image plane.
                    const X=px+layout.cw/2-w/2,Y=py+layout.ch/2-h/2;
                    const A=cosY-X*sinY/900,B=sinX*sinY+X*sinX*cosY/900;
                    const C=-Y*sinY/900,E=cosX+Y*sinX*cosY/900,det=A*E-B*C;
                    const sx=(X*E-B*Y)/det,sy=(A*Y-C*X)/det;
                    let u=sx/layout.width+.5,v=sy/layout.height+.5;
                    value=this.sampleAt(u,v);edge=-1;
                    // Darker ink rises from the source plane; one extra bilinear sample gives
                    // depth parallax without moving glyph cells or reading canvas pixels.
                    if(value>.025&&reliefDepth){
                        const depth=value*value*(3-2*value)*reliefDepth;
                        u-=sinY*depth/layout.width;v+=sinX*cosY*depth/layout.height;
                        value=this.sampleAt(u,v);
                    }
                    if(u>=0&&u<1&&v>=0&&v<1)edge=this.target.edges?.[Math.floor(v*41)*72+Math.floor(u*71)]??-1;
                }
                if(this.from&&phase<1)value=this.from[i]*(1-morph)+value*morph;
                if(idle){
                    px+=idle.x[i];py+=idle.y[i];
                    const X=px+layout.cw/2-w/2,Y=py+layout.ch/2-h/2;
                    px=w/2+X*cosY-Y*sinX*.18-layout.cw/2;
                    py=h/2+Y*cosX+X*sinY*.18-layout.ch/2;
                }
                this.current[i]=Math.max(0,Math.min(1,value));
                const density=this.current[i]*(1-(this.dissolve||0));
                const rank=DENSITY_RANK[Math.min(1023,Math.max(0,(density*1023)|0))];
                let g=density<.025?-1:atlas.ramp[rank];
                if(g>=0&&edge>=0)g=edge;
                if(g>=0&&phase<1){
                    // Deterministic, low-frequency character noise, then a clean lock-in.
                    const noise=((Math.imul(i+1,16807)^noiseFrame)>>>0)%1000/1000;
                    if(noise>phase*.85+.15)continue;
                    if(noise>phase*.65)g=atlas.ramp[Math.floor(noise*(PALETTE.length-1))];
                    // Characters change in place; the incoming image keeps one stable grid.
                }
                if(g>=0){
                    const waveAge=still?2:(now-(this.morphStart||0)-i/(cols*rows)*400)/900;
                    let glyphAtlas=this.target&&waveAge<1&&atlas.rainbow
                        ?atlas.rainbow[Math.max(0,Math.min(12,Math.round(waveAge*12)))]:atlas;
                    if(idle&&idle.ink[i]>.02&&atlas.rainbow){
                        glyphAtlas=atlas.rainbow[Math.min(12,Math.round((1-idle.ink[i])*12))];
                    }
                    if(this.target&&waveAge>=1&&reflectionStrength&&atlas.reflections){
                        const nx=(px-w/2)/layout.width,ny=(py-h/2)/layout.height;
                        const band=Math.max(0,1-Math.abs(nx*.7+ny*.22-reflectionCenter)/.42);
                        const light=band*band*reflectionStrength;
                        if(light>.08){
                            const hue=Math.max(0,Math.min(8,Math.round((nx+ny*.2+reflectionCenter+.8)*5)));
                            glyphAtlas=atlas.reflections[Math.min(3,Math.floor(light*4))][hue];
                        }
                    }
                    this.stamp(glyphAtlas,g,px,py);
                    const entry=this.rendered[this.renderedCount]||(this.rendered[this.renderedCount]={});
                    entry.x=px;entry.y=py;entry.g=g;entry.atlas=glyphAtlas;entry.font=font;entry.zoom=1;
                    this.renderedCount++;
                }
            }
            if(still)this.particles=[];
            else {
                let retained=0;
                for(const p of this.particles){
                    if(now>=p.expires)continue;
                    const age=Math.max(0,(now-p.start)/1000);
                    const x=p.x+p.vx*age,y=p.y+p.vy*age+260*age*age;
                    if(y>h)continue;
                    this.particles[retained++]=p;
                    this.stamp(p.atlas,p.g,x,y,p.zoom??1);
                }
                this.particles.length=retained;
            }
            c.globalAlpha=1;if(this.dissolve>.92)this.stamp(atlas,PALETTE.indexOf('.'),w/2,h/2);
            this.container.dataset.asciiSource=this.target?'image':'field';
            this.container.dataset.asciiParticles=String(this.particles.length);
            this.container.dataset.asciiTilt=this.tilt.x.toFixed(2)+','+this.tilt.y.toFixed(2);
            this.container.dataset.asciiFontSize=String(font);
            this.dirty=false;
        }
        schedule(){
            this.container.dataset.asciiState=this.isActive&&!this.paused&&!this.motion.matches?'running':'paused';
            if(!this.isActive||document.hidden||!this.inView){cancelAnimationFrame(this.raf);this.raf=null;return;}
            if(this.paused||this.motion.matches){cancelAnimationFrame(this.raf);this.raf=null;this.draw();return;}
            if(this.raf)return; // Coalesce image decode, resize and activation into one paint.
            const tick=now=>{this.raf=null;if(!this.isActive||document.hidden||!this.inView)return;
                this.draw(now);
                if(this.dirty||this.tiltMoving||!this.target||this.loading||this.particles.length||now-this.morphStart<1350||(!this.pointer.inside&&this.pointer.strength>.002))this.raf=requestAnimationFrame(tick);};this.raf=requestAnimationFrame(tick);
        }
        snapshot(){return this.canvas;}
        setActive(active){this.isActive=active;this.schedule();}
        destroy(){++this.request;this.isActive=false;cancelAnimationFrame(this.raf);this.abort.abort();this.resizeObserver.disconnect();this.intersection.disconnect();this.figure.remove();this.cache.clear();this.container.classList.remove('ascii-placeholder');}
    }
    window.AsciiVolumeScene=SignalField;
})();
