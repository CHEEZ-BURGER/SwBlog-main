(() => {
    'use strict';
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'), mobile=matchMedia('(max-width:1180px)');
    const $=s=>document.querySelector(s);
    const motion=window.PublicationMotion={instant:160,fast:280,base:520,scene:850,ease:'cubic-bezier(.16,1,.3,1)'};
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const loadedPosts=new Set();
    let entry=null, entryId=0, activeRow=null, hoverTimer, previewRAF=0;
    const source=row=>row?{id:row.dataset.postId,title:row.getAttribute('aria-label')||row.querySelector('.post-list-title')?.textContent||'',category:row.querySelector('.post-list-category')?.textContent||'',src:row.dataset.previewImg||''}:null;
    const rowFor=id=>Array.from(document.querySelectorAll('.post-list-item')).find(r=>r.dataset.postId===String(id));

    // One preview physics implementation, shared by index and continuation.
    const preview=document.createElement('div'); preview.className='publication-preview';preview.setAttribute('aria-hidden','true');
    const previewImage=new Image();previewImage.alt='';preview.append(previewImage);document.body.append(preview);
    const pointer={x:0,y:0,tx:0,ty:0,rotation:0};let previewActive=false,previewWidth=0,previewHeight=0,rowBounds=null;
    function previewTick(){
        previewRAF=0;if(!previewActive||document.hidden)return;
        const dx=pointer.tx-pointer.x,dy=pointer.ty-pointer.y;
        pointer.x+=dx*.18;pointer.y+=dy*.18;pointer.rotation+=(Math.max(-5,Math.min(5,dx*.06))-pointer.rotation)*.15;
        preview.style.transform=`translate3d(${pointer.x}px,${pointer.y}px,0) rotate(${pointer.rotation}deg)`;
        if(Math.abs(dx)+Math.abs(dy)+Math.abs(pointer.rotation)>.08)previewRAF=requestAnimationFrame(previewTick);else preview.style.willChange='auto';
    }
    function hidePreview(){previewActive=false;cancelAnimationFrame(previewRAF);previewRAF=0;preview.classList.remove('is-visible');preview.style.willChange='auto';}
    function showPreview(src,e){
        if(!src||mobile.matches||reduced.matches){hidePreview();return;}
        if(!previewActive){pointer.x=e.clientX+24;pointer.y=e.clientY+24;}
        previewImage.src=src;previewActive=true;preview.classList.add('is-visible');
        previewWidth=preview.offsetWidth;previewHeight=preview.offsetHeight;movePreview(e);
    }
    function movePreview(e){
        if(!previewActive)return;pointer.tx=Math.max(12,Math.min(innerWidth-previewWidth-16,e.clientX+24));pointer.ty=Math.max(12,Math.min(innerHeight-previewHeight-16,e.clientY+24));
        preview.style.willChange='transform';if(!previewRAF)previewRAF=requestAnimationFrame(previewTick);
    }
    function select(row){
        if(row===activeRow)return;activeRow?.classList.remove('signal-active');activeRow=row;rowBounds=null;row?.classList.add('signal-active');clearTimeout(hoverTimer);
        if(!row)window.globalAsciiScene?.setRowPointer(null,null);
        hoverTimer=setTimeout(()=>window.globalAsciiScene?.setPost(source(row)),reduced.matches?0:60);
    }
    function tiltRaster(e,row=e.target.closest('.post-list-item')){
        if(!row||e.pointerType==='touch')return;
        const bounds=rowBounds||(rowBounds=row.getBoundingClientRect());
        if(bounds.width&&bounds.height)window.globalAsciiScene?.setRowPointer(
            (e.clientX-bounds.left)/bounds.width*2-1,(e.clientY-bounds.top)/bounds.height*2-1);
    }
    document.addEventListener('pointerover',e=>{
        const row=e.target.closest('.post-list-item');if(row){select(row);tiltRaster(e,row);showPreview(row.dataset.previewImg,e);return;}
        const next=e.target.closest('.post-continuation-link');if(next)showPreview(next.querySelector('img:not([hidden])')?.src,e);
    });
    document.addEventListener('pointerout',e=>{
        const target=e.target.closest('.post-list-item,.post-continuation-link');if(!target||target.contains(e.relatedTarget))return;
        hidePreview();if(!e.relatedTarget?.closest?.('.post-list-item'))select(null);
    });
    document.addEventListener('pointermove',e=>{movePreview(e);tiltRaster(e);},{passive:true});
    document.addEventListener('scroll',()=>{rowBounds=null;},{capture:true,passive:true});
    window.addEventListener('resize',()=>{rowBounds=null;previewWidth=preview.offsetWidth;previewHeight=preview.offsetHeight;},{passive:true});
    document.addEventListener('focusin',e=>{const row=e.target.closest('.post-list-item');if(row)select(row);});
    document.addEventListener('focusout',e=>{if(e.target.closest('.post-list-item')&&!e.relatedTarget?.closest?.('.post-list-item'))select(null);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)hidePreview();});
    reduced.addEventListener('change',hidePreview);

    // Capture input before document-level hover handlers during the entire loading reveal.
    for(const type of ['pointermove','pointerover','pointerout','pointerdown','pointerup','mousemove','mouseover','mouseout','mousedown','mouseup','click','dblclick','contextmenu','wheel','touchstart','touchmove','touchend']){
        window.addEventListener(type,e=>{
            if(!document.body.classList.contains('content-pointer-locked'))return;
            if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
        },{capture:true,passive:false});
    }
    function cancelEntry(){++entryId;entry?.getAnimations({subtree:true}).forEach(a=>a.cancel());entry?.remove();entry=null;document.body.classList.remove('content-resolving','content-pointer-locked');hidePreview();}
    async function number(state,value){
        if(state.ticket!==entryId)return;
        state.scene.dataset.percentage=String(value);
        const digits=String(value).padStart(3,' '),reels=state.scene.querySelectorAll('.resolution-digit'),animations=[];
        for(let index=2;index>=0;index--){
            const reel=reels[index],old=reel.lastElementChild;
            if(old.textContent===digits[index])continue;
            const next=document.createElement('span');next.textContent=digits[index];reel.append(next);
            if(reduced.matches){old.remove();continue;}
            const options={duration:1500,delay:(2-index)*35,easing:'cubic-bezier(0,.97,0,.97)',fill:'both'};
            const incoming=next.animate([{transform:'translateY(110%)'},{transform:'translateY(0)'}],options);
            // Add the exit to the still-running entrance so overlapping digits never snap.
            const outgoing=old.animate([{transform:'translateY(0)'},{transform:'translateY(-110%)'}],{...options,composite:'add'});
            animations.push(incoming.finished.then(()=>{old.remove();incoming.cancel();outgoing.cancel();}).catch(()=>{}));
        }
        await Promise.all(animations);
        state.value=value;
    }
    function begin(id){
        cancelEntry();if(loadedPosts.has(String(id)))return null;
        const ticket=entryId,scene=document.createElement('section');entry=scene;
        scene.className='resolution-scene';scene.setAttribute('aria-hidden','true');
        scene.innerHTML='<div class="resolution-typography"><div class="resolution-number"><div class="resolution-digit"><span> </span></div><div class="resolution-digit"><span>0</span></div><div class="resolution-digit"><span>0</span></div></div><span class="resolution-percent">%</span></div>';
        document.body.append(scene);document.body.classList.add('content-resolving','content-pointer-locked');
        clearTimeout(hoverTimer);hidePreview();activeRow?.classList.remove('signal-active');activeRow=null;window.globalAsciiScene?.setRowPointer(null,null);
        const state={ticket,scene,value:0,id:String(id)};
        state.progress=(async()=>{
            for(const value of [18,30,68,92]){
                if(ticket!==entryId)return;
                state.reelMotion=number(state,value);
                await sleep(210);
            }
        })();
        return state;
    }
    async function resolve(state,ok=true){
        if(!state||state.ticket!==entryId)return;
        if(ok)loadedPosts.add(state.id);
        await state.progress;if(state.ticket!==entryId)return;
        if(ok)await number(state,100);
        if(state.ticket!==entryId)return;
        // Rainbow starts with each glyph's entrance; completion needs only the settled hold.
        await sleep(210);if(state.ticket!==entryId)return;
        if(ok&&!reduced.matches){
            document.querySelector('#panel-post-body')?.animate([
                {transform:'translate3d(0,32px,0)'},{transform:'translate3d(0,0,0)'}
            ],{duration:1200,easing:'cubic-bezier(.72,-0.01,0,.98)'});
        }
        document.body.classList.remove('content-resolving');state.scene.classList.add('is-resolved');
        await sleep(reduced.matches?80:1200);if(state.ticket===entryId){state.scene.remove();entry=null;document.body.classList.remove('content-pointer-locked');}
    }
    let revealObserver, completionObserver, coverObserver, decodeObserver;
    function enhance(content,data={}){
        revealObserver?.disconnect();completionObserver?.disconnect();coverObserver?.disconnect();decodeObserver?.disconnect();
        const header=$('#panel-header')||$('.post-article-header');
        if(header){
            document.body.classList.add('cover-in-view');
            coverObserver=new IntersectionObserver(entries=>document.body.classList.toggle('cover-in-view',entries[0].isIntersecting),{threshold:0});coverObserver.observe(header);
            header.dataset.postNumber='A / '+String(data.id||'001').padStart(3,'0');
            header.querySelector('.publication-hero')?.remove();
            const src=rowFor(data.id)?.dataset.previewImg||content.querySelector('img')?.getAttribute('src');
            if(src){const figure=document.createElement('figure');figure.className='publication-hero';const img=new Image();img.src=src;img.alt=data.title||'';img.decoding='async';figure.append(img);header.append(figure);}
        }
        document.querySelectorAll('.footer-statement').forEach(el=>{el.textContent='KEEP EXPLORING.';});
        document.querySelectorAll('.footer-kicker').forEach(el=>{el.textContent='END / '+String(data.id||'INDEX').padStart(3,'0');});
        const archive=$('#archive-panel');if(archive){archive.dataset.currentNumber=String(data.id||'').padStart(2,'0');archive.style.setProperty('--current-number','"'+String(data.id||'').padStart(2,'0')+'"');}
        content.querySelectorAll('.post-editorial-heading').forEach((el,i)=>{el.classList.toggle('chapter-takeover',i===1||i===5);});
        content.querySelectorAll('pre').forEach(pre=>{pre.dataset.codeLabel='CODE / '+(pre.querySelector('code')?.className.match(/language-([\w-]+)/)?.[1]||'TEXT').toUpperCase();});
        const targets=content.querySelectorAll('.post-editorial-heading,h3,figure,.img-zoom-wrapper,blockquote,.post-split-section,video');
        revealObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-revealed');revealObserver.unobserve(e.target);}}),{threshold:.08});
        targets.forEach(el=>{el.classList.add('publication-reveal');revealObserver.observe(el);});
        // Decode only the first editorial figure; zoom and slider DOM remain untouched.
        const decode=content.querySelector('figure img,.img-zoom-wrapper img');
        if(decode&&!reduced.matches){
            decodeObserver=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)return;decodeImage(decode);decodeObserver.disconnect();},{threshold:.15});decodeObserver.observe(decode);
        }
        let complete=$('.reading-complete');
        if(!complete){complete=document.createElement('section');complete.className='reading-complete';complete.setAttribute('aria-label','읽기 완료');complete.innerHTML='<div><span class="complete-value">00</span><span>%</span></div><p>READING COMPLETE</p>';$('[id="panel-continuation"],.post-continuation')?.before(complete);}
        if(complete){
            complete.classList.remove('is-revealed');
            complete.querySelector('.complete-value').textContent='00';
            completionObserver=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){const value=complete.querySelector('.complete-value');value.textContent='100';if(!reduced.matches)value.animate([{transform:'translateY(70%)',clipPath:'inset(0 0 100%)'},{transform:'translateY(0)',clipPath:'inset(0)'}],{duration:520,easing:motion.ease});complete.classList.add('is-revealed');completionObserver.disconnect();}},{threshold:.35});completionObserver.observe(complete);
        }
        const next=$('.post-continuation-label'),nextLink=$('.post-continuation-link');if(next&&nextLink){const id=nextLink.dataset.postId||new URL(nextLink.href).searchParams.get('id');next.textContent=id?'NEXT / A'+String(id).padStart(3,'0'):'NEXT / INDEX';}
        setupContents();
    }
    function setupContents(){
        const toc=$('#post-toc-sidebar');if(!toc)return;
        let button=$('.mobile-contents');if(!button){button=document.createElement('button');button.type='button';button.className='mobile-contents';button.textContent='CONTENTS +';button.setAttribute('aria-controls',toc.id);button.setAttribute('aria-expanded','false');document.body.append(button);
            button.addEventListener('click',()=>{const open=document.body.classList.toggle('contents-open');button.setAttribute('aria-expanded',String(open));button.textContent=open?'CONTENTS −':'CONTENTS +';});
            const close=()=>{document.body.classList.remove('contents-open');button.setAttribute('aria-expanded','false');button.textContent='CONTENTS +';};
            toc.addEventListener('click',e=>{if(e.target.closest('li,a,button'))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('contents-open')){e.preventDefault();close();button.focus();}});
        }
        document.body.classList.remove('contents-open');button.setAttribute('aria-expanded','false');button.textContent='CONTENTS +';button.hidden=toc.hidden;
    }
    let mobileFrame=0;
    async function decodeImage(img){
        try{await img.decode();}catch{return;}
        if(!img.isConnected||reduced.matches)return;
        const parent=img.parentElement,rect=img.getBoundingClientRect(),pr=parent.getBoundingClientRect();if(!rect.width||!rect.height)return;
        const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
        Object.assign(canvas.style,{position:'absolute',left:(rect.left-pr.left)+'px',top:(rect.top-pr.top)+'px',width:rect.width+'px',height:rect.height+'px',pointerEvents:'none',zIndex:'2',imageRendering:'pixelated'});
        if(getComputedStyle(parent).position==='static')parent.style.position='relative';
        parent.append(canvas);
        try{for(const block of [32,16,8,4]){if(!img.isConnected||reduced.matches)break;canvas.width=Math.max(1,Math.ceil(rect.width/block));canvas.height=Math.max(1,Math.ceil(rect.height/block));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);await sleep(140);}}finally{canvas.remove();}
    }
    function mobileActive(){
        mobileFrame=0;if(!mobile.matches||$('#post-panel-viewer')?.classList.contains('active-state'))return;
        const rows=document.querySelectorAll('.post-list-item');let nearest=null,distance=Infinity;rows.forEach(row=>{const r=row.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;const d=Math.abs(r.top+r.height/2-innerHeight/2);if(d<distance){nearest=row;distance=d;}});select(nearest||rows[0]||null);
    }
    document.addEventListener('scroll',()=>{if(mobile.matches&&!mobileFrame)mobileFrame=requestAnimationFrame(mobileActive);},{capture:true,passive:true});
    window.addEventListener('resize',()=>{hidePreview();mobileActive();});
    document.querySelectorAll('.footer-statement').forEach(el=>{el.textContent='KEEP EXPLORING.';});
    window.Publication2026={begin,resolve,cancel:cancelEntry,enhance,refreshIndex:mobileActive};
})();
