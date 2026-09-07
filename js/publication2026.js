(() => {
    'use strict';
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'), mobile=matchMedia('(max-width:1180px)');
    const $=s=>document.querySelector(s);
    const motion=window.PublicationMotion={instant:160,fast:280,base:520,scene:850,ease:'cubic-bezier(.16,1,.3,1)'};
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    let entry=null, entryId=0, activeRow=null, hoverTimer, previewRAF=0;
    const source=row=>row?{id:row.dataset.postId,title:row.getAttribute('aria-label')||row.querySelector('.post-list-title')?.textContent||'',category:row.querySelector('.post-list-category')?.textContent||'',src:row.dataset.previewImg||''}:null;
    const rowFor=id=>Array.from(document.querySelectorAll('.post-list-item')).find(r=>r.dataset.postId===String(id));

    // One preview physics implementation, shared by index and continuation.
    const preview=document.createElement('div'); preview.className='publication-preview';preview.setAttribute('aria-hidden','true');
    const previewImage=new Image();previewImage.alt='';preview.append(previewImage);document.body.append(preview);
    const pointer={x:0,y:0,tx:0,ty:0,rotation:0};let previewActive=false;
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
        previewImage.src=src;previewActive=true;preview.classList.add('is-visible');movePreview(e);
    }
    function movePreview(e){
        if(!previewActive)return;pointer.tx=Math.max(12,Math.min(innerWidth-preview.offsetWidth-16,e.clientX+24));pointer.ty=Math.max(12,Math.min(innerHeight-preview.offsetHeight-16,e.clientY+24));
        preview.style.willChange='transform';if(!previewRAF)previewRAF=requestAnimationFrame(previewTick);
    }
    function select(row){
        if(row===activeRow)return;activeRow?.classList.remove('signal-active');activeRow=row;row?.classList.add('signal-active');clearTimeout(hoverTimer);
        hoverTimer=setTimeout(()=>window.globalAsciiScene?.setPost(source(row)),reduced.matches?0:60);
    }
    document.addEventListener('pointerover',e=>{
        const row=e.target.closest('.post-list-item');if(row){select(row);showPreview(row.dataset.previewImg,e);return;}
        const next=e.target.closest('.post-continuation-link');if(next)showPreview(next.querySelector('img:not([hidden])')?.src,e);
    });
    document.addEventListener('pointerout',e=>{
        const target=e.target.closest('.post-list-item,.post-continuation-link');if(!target||target.contains(e.relatedTarget))return;
        hidePreview();if(!e.relatedTarget?.closest?.('.post-list-item'))select(null);
    });
    document.addEventListener('pointermove',movePreview,{passive:true});
    document.addEventListener('focusin',e=>{const row=e.target.closest('.post-list-item');if(row)select(row);});
    document.addEventListener('focusout',e=>{if(e.target.closest('.post-list-item')&&!e.relatedTarget?.closest?.('.post-list-item'))select(null);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)hidePreview();});
    reduced.addEventListener('change',hidePreview);

    function cancelEntry(){++entryId;entry?.remove();entry=null;document.body.classList.remove('content-resolving');hidePreview();}
    function number(scene,value){
        const mask=scene.querySelector('.resolution-number');const old=mask.lastElementChild;const next=document.createElement('span');next.textContent=String(value).padStart(2,'0');
        mask.append(next);if(!reduced.matches){next.animate([{transform:'translateY(100%)'},{transform:'translateY(0)'}],{duration:180,easing:motion.ease});old?.animate([{transform:'translateY(0)'},{transform:'translateY(-100%)'}],{duration:180,easing:motion.ease}).finished.then(()=>old.remove()).catch(()=>{});}else old?.remove();
    }
    function begin(id){
        cancelEntry();const ticket=entryId,post=source(rowFor(id));const scene=document.createElement('section');entry=scene;
        scene.className='resolution-scene';scene.setAttribute('aria-hidden','true');
        scene.innerHTML='<img class="resolution-image" alt=""><canvas class="resolution-field"></canvas><div class="resolution-typography"><div class="resolution-number"><span>00</span></div><span class="resolution-percent">%</span></div><div class="resolution-meta"><span></span><span>RESOLVING CONTENT</span></div>';
        scene.querySelector('.resolution-meta span').textContent='POST / '+String(id).padStart(3,'0')+' · '+(post?.category||'NOTE');
        if(post?.src)scene.querySelector('img').src=post.src;
        const canvas=scene.querySelector('canvas'),snapshot=window.globalAsciiScene?.snapshot();canvas.width=720;canvas.height=420;
        if(snapshot)canvas.getContext('2d').drawImage(snapshot,0,0,720,420);
        document.body.append(scene);document.body.classList.add('content-resolving');
        const state={ticket,scene,start:performance.now(),ready:false};
        (async()=>{for(const step of [12,28,47,71,88,94]){await sleep(reduced.matches?12:115);if(ticket!==entryId||state.ready)return;number(scene,step);scene.style.setProperty('--resolution',step/100);} })();
        return state;
    }
    async function resolve(state,ok=true){
        if(!state||state.ticket!==entryId)return;state.ready=true;
        await sleep(Math.max(0,(reduced.matches?90:740)-(performance.now()-state.start)));
        if(state.ticket!==entryId)return;
        if(ok){number(state.scene,100);state.scene.style.setProperty('--resolution',1);state.scene.querySelector('.resolution-meta span:last-child').textContent='CONTENT RESOLVED';}
        else state.scene.querySelector('.resolution-meta span:last-child').textContent='CONTENT UNAVAILABLE';
        await sleep(reduced.matches?40:160);if(state.ticket!==entryId)return;
        if(ok&&!reduced.matches)document.querySelectorAll('#panel-header > :not(.publication-hero)').forEach((el,i)=>el.animate([{clipPath:'inset(0 0 100%)',transform:'translateY(16px)'},{clipPath:'inset(0)',transform:'translateY(0)'}],{duration:520,delay:i*60,easing:motion.ease}));
        document.body.classList.remove('content-resolving');state.scene.classList.add('is-resolved');
        await sleep(reduced.matches?80:520);if(state.ticket===entryId){state.scene.remove();entry=null;}
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
        let nearest=null,distance=Infinity;document.querySelectorAll('.post-list-item').forEach(row=>{const r=row.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;const d=Math.abs(r.top+r.height/2-innerHeight/2);if(d<distance){nearest=row;distance=d;}});if(nearest)select(nearest);
    }
    document.addEventListener('scroll',()=>{if(mobile.matches&&!mobileFrame)mobileFrame=requestAnimationFrame(mobileActive);},{capture:true,passive:true});
    window.addEventListener('resize',()=>{hidePreview();mobileActive();});
    document.querySelectorAll('.footer-statement').forEach(el=>{el.textContent='KEEP EXPLORING.';});
    window.Publication2026={begin,resolve,cancel:cancelEntry,enhance,refreshIndex:mobileActive};
})();
