/* A real, lit 3D torus knot sampled into a square ASCII printing screen. */
(function () {
    'use strict';
    class AsciiVolumeScene {
        constructor(containerId) {
            this.container=document.getElementById(containerId);
            if(!this.container) return;
            this.isActive=true; this.paused=false; this.time=0; this.mouse={x:0,y:0,tx:0,ty:0};
            this.motion=matchMedia('(prefers-reduced-motion: reduce)'); this.abort=new AbortController();
            this.figure=document.createElement('figure'); this.figure.className='ascii-volume';
            this.figure.innerHTML='<div class="ascii-caption"><span>FORM / 001</span><span>ASCII IN THREE DIMENSIONS</span></div><canvas class="ascii-volume-canvas" role="img" aria-label="푸른 인쇄 격자와 밝은 ASCII 문자로 이루어진 회전하는 3차원 매듭"></canvas><figcaption><span>AN EXPERIMENT IN FORM.<small>움직임에 반응하는 3차원 기록</small></span><button type="button" aria-label="3D 작품 일시정지" aria-pressed="false">Ⅱ</button></figcaption>';
            this.container.replaceChildren(this.figure); this.container.classList.add('ascii-placeholder');
            this.canvas=this.figure.querySelector('canvas'); this.ctx=this.canvas.getContext('2d',{alpha:false});
            this.button=this.figure.querySelector('button');
            this.init3D();
            const options={signal:this.abort.signal};
            this.button.addEventListener('click',()=>{this.paused=!this.paused;this.button.textContent=this.paused?'▷':'Ⅱ';this.button.setAttribute('aria-pressed',String(this.paused));this.button.setAttribute('aria-label',this.paused?'3D 작품 재생':'3D 작품 일시정지');this.schedule();},options);
            window.addEventListener('pointermove',e=>{const r=this.container.getBoundingClientRect();this.mouse.tx=(e.clientX-r.left)/r.width-.5;this.mouse.ty=(e.clientY-r.top)/r.height-.5;},{passive:true,...options});
            document.addEventListener('visibilitychange',()=>this.schedule(),options);
            this.motion.addEventListener('change',()=>this.schedule(),options);
            this.resizeObserver=new ResizeObserver(()=>this.onResize());this.resizeObserver.observe(this.canvas);
            this.intersection=new IntersectionObserver(([entry])=>{this.inView=entry.isIntersecting;this.schedule();});this.intersection.observe(this.figure);
            this.onResize();
        }
        init3D() {
            this.scene=new THREE.Scene();
            this.camera=new THREE.PerspectiveCamera(42,1,.1,100);this.camera.position.z=4.9;
            this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,preserveDrawingBuffer:true});
            this.resolution=104;this.renderer.setSize(this.resolution,this.resolution);this.renderer.setClearColor(0x000000,0);
            this.sample=document.createElement('canvas');this.sample.width=this.sample.height=this.resolution;this.sampleCtx=this.sample.getContext('2d',{willReadFrequently:true});
            this.geometry=new THREE.TorusKnotGeometry(1.12,.37,160,28);
            this.material=new THREE.MeshStandardMaterial({color:0xe0e9df,roughness:.7,metalness:.08});
            this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.rotation.set(.3,.4,.05);this.scene.add(this.mesh);
            const key=new THREE.DirectionalLight(0xf1f1dc,2.3);key.position.set(-3,5,4);this.scene.add(key);
            const fill=new THREE.DirectionalLight(0x4c99e7,.8);fill.position.set(4,-3,2);this.scene.add(fill);
            this.scene.add(new THREE.AmbientLight(0x457aaf,.52));
            this.buildAtlas();
        }
        buildAtlas() {
            this.glyphs=' .:+×□#▦';this.atlas=document.createElement('canvas');this.atlas.width=8*32;this.atlas.height=8*32;
            const a=this.atlas.getContext('2d');a.textAlign='center';a.textBaseline='middle';a.font="24px 'Circular Std'";
            for(let tone=0;tone<8;tone++) for(let g=0;g<8;g++) {
                const mix=tone/7;a.fillStyle=`rgb(${Math.round(95+mix*144)},${Math.round(150+mix*94)},${Math.round(181+mix*52)})`;
                a.fillText(this.glyphs[g],g*32+16,tone*32+17);
            }
        }
        onResize() {
            const r=this.canvas.getBoundingClientRect();if(!r.width || !r.height)return;
            this.w=r.width;this.h=r.height;const dpr=Math.min(devicePixelRatio||1,2);
            this.canvas.width=Math.round(this.w*dpr);this.canvas.height=Math.round(this.h*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);
            this.draw();this.schedule();
        }
        draw() {
            if(!this.w)return;
            const c=this.ctx,w=this.w,h=this.h,s=Math.min(w*.94,h*.98),l=(w-s)/2,t=(h-s)/2;
            c.fillStyle='#181818';c.fillRect(0,0,w,h);
            // The blue print is a stage for the volume, not a replacement image.
            const frame=s*.82,fx=l+(s-frame)/2,fy=t+(s-frame)/2;
            c.fillStyle='#2d638a';c.fillRect(fx,fy,frame,frame);
            c.strokeStyle='rgba(176,211,219,.08)';c.lineWidth=.5;
            for(let n=0;n<=64;n++){const p=n*frame/64;c.beginPath();c.moveTo(fx+p,fy);c.lineTo(fx+p,fy+frame);c.moveTo(fx,fy+p);c.lineTo(fx+frame,fy+p);c.stroke();}
            this.mesh.rotation.x=.35+Math.sin(this.time*.24)*.4+this.mouse.y*.25;
            this.mesh.rotation.y=.3+this.time*.21+this.mouse.x*.35;
            this.mesh.rotation.z=Math.sin(this.time*.13)*.12;
            this.renderer.render(this.scene,this.camera);
            this.sampleCtx.clearRect(0,0,this.resolution,this.resolution);this.sampleCtx.drawImage(this.renderer.domElement,0,0);
            const pixels=this.sampleCtx.getImageData(0,0,this.resolution,this.resolution).data;
            const cell=s/this.resolution;
            for(let y=0;y<this.resolution;y++)for(let x=0;x<this.resolution;x++){
                const i=(y*this.resolution+x)*4;if(pixels[i+3]<90)continue;
                const light=(pixels[i]*.24+pixels[i+1]*.58+pixels[i+2]*.18)/255;
                const tone=Math.min(7,Math.floor(light*8));
                const glyph=Math.max(1,Math.min(7,Math.floor(light*8)));
                const px=l+x*cell,py=t+y*cell;
                c.fillStyle=`rgba(132,191,214,${.04+light*.14})`;c.fillRect(px,py,cell,cell);
                c.drawImage(this.atlas,glyph*32,tone*32,32,32,px,py,cell+1,cell+1);
                // A second angled register gives bright faces a woven, overprinted edge.
                if(light>.72){c.strokeStyle='rgba(236,242,225,.22)';c.lineWidth=.45;c.strokeRect(px-.3,py-.3,cell+1.4,cell+1.4);}
            }
            c.fillStyle='#e1e7de';const dot=cell*.65;
            for(let k=0;k<86;k++){
                const row=Math.floor(k/15),col=k%15;
                const flutter=Math.sin(this.time*.3+row)*cell*2;
                const px=fx-frame*.12+col*cell*1.8+flutter,py=fy+frame*(.22+row*.012)+Math.sin(col*.65)*cell*2;
                if((k*7)%13>8)continue;c.globalAlpha=.36+(k%4)*.16;c.fillRect(px,py,dot,dot);
            }
            c.globalAlpha=1;
        }
        schedule() {
            if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;
            this.container.dataset.asciiState=this.isActive&&!this.paused&&!this.motion.matches?'running':'paused';
            if(!this.isActive||document.hidden||this.inView===false)return;
            this.draw();if(this.paused||this.motion.matches)return;
            const tick=now=>{this.raf=null;if(!this.isActive||this.paused||document.hidden||this.inView===false)return;
                if(!this.last||now-this.last>40){this.time+=.04;this.mouse.x+=(this.mouse.tx-this.mouse.x)*.05;this.mouse.y+=(this.mouse.ty-this.mouse.y)*.05;this.draw();this.last=now;}
                this.raf=requestAnimationFrame(tick);
            };this.raf=requestAnimationFrame(tick);
        }
        setActive(active){this.isActive=active;this.schedule();}
        destroy(){this.isActive=false;if(this.raf)cancelAnimationFrame(this.raf);this.abort.abort();this.resizeObserver.disconnect();this.intersection.disconnect();this.geometry.dispose();this.material.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.figure.remove();this.container.classList.remove('ascii-placeholder');}
    }
    window.AsciiVolumeScene=AsciiVolumeScene;
})();
