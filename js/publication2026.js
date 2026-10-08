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
    const pointer={x:0,y:0,tx:0,ty:0,rotation:0};let previewActive=false,previewWidth=0,previewHeight=0,rowBounds=null,previewTime=null;
    function previewTick(now){
        previewRAF=0;if(!previewActive||document.hidden)return;
        const dt=previewTime===null?1000/60:Math.max(0,Math.min(64,now-previewTime));previewTime=now;
        const step=dt/(1000/60),follow=1-Math.pow(.82,step),turn=1-Math.pow(.85,step);
        const dx=pointer.tx-pointer.x,dy=pointer.ty-pointer.y;
        pointer.x+=dx*follow;pointer.y+=dy*follow;pointer.rotation+=(Math.max(-5,Math.min(5,dx*.06))-pointer.rotation)*turn;
        preview.style.transform=`translate3d(${pointer.x}px,${pointer.y}px,0) rotate(${pointer.rotation}deg)`;
        if(Math.abs(dx)+Math.abs(dy)+Math.abs(pointer.rotation)>.08)previewRAF=requestAnimationFrame(previewTick);else preview.style.willChange='auto';
    }
    function hidePreview(){previewActive=false;cancelAnimationFrame(previewRAF);previewRAF=0;previewTime=null;preview.classList.remove('is-visible');preview.style.willChange='auto';}
    function showPreview(src,e){
        if(!src||mobile.matches||reduced.matches){hidePreview();return;}
        if(!previewActive){pointer.x=e.clientX+24;pointer.y=e.clientY+24;previewTime=null;}
        previewImage.src=src;previewActive=true;preview.classList.add('is-visible');
        previewWidth=preview.offsetWidth;previewHeight=preview.offsetHeight;movePreview(e);
    }
    function movePreview(e){
        if(!previewActive)return;pointer.tx=Math.max(12,Math.min(innerWidth-previewWidth-16,e.clientX+24));pointer.ty=Math.max(12,Math.min(innerHeight-previewHeight-16,e.clientY+24));
        preview.style.willChange='transform';if(!previewRAF){previewTime=null;previewRAF=requestAnimationFrame(previewTick);}
    }
    function select(row){
        if(row===activeRow)return;activeRow?.classList.remove('signal-active');activeRow=row;rowBounds=null;row?.classList.add('signal-active');clearTimeout(hoverTimer);
        if(!row)window.globalPanelScene?.setRowPointer(null,null);
        hoverTimer=setTimeout(()=>window.globalPanelScene?.setPost(source(row)),reduced.matches?0:60);
    }
    function tiltRaster(e,row=e.target instanceof Element?e.target.closest('.post-list-item'):null){
        if(!row||e.pointerType==='touch')return;
        const bounds=rowBounds||(rowBounds=row.getBoundingClientRect());
        if(bounds.width&&bounds.height)window.globalPanelScene?.setRowPointer(
            (e.clientX-bounds.left)/bounds.width*2-1,(e.clientY-bounds.top)/bounds.height*2-1);
    }
    // In the gallery every row already carries its picture; the cursor preview only serves
    // the collapsed list beside an open post.
    const readerOpen=()=>!!$('#post-panel-viewer')?.classList.contains('active-state');
    document.addEventListener('pointerover',e=>{
        if(!(e.target instanceof Element))return;
        const row=e.target.closest('.post-list-item');if(row){select(row);tiltRaster(e,row);if(readerOpen())showPreview(row.dataset.previewImg,e);else hidePreview();return;}
        const next=e.target.closest('.post-continuation-link');if(next)showPreview(next.querySelector('img:not([hidden])')?.src,e);
    });
    document.addEventListener('pointerout',e=>{
        const target=e.target instanceof Element?e.target.closest('.post-list-item,.post-continuation-link'):null;if(!target||target.contains(e.relatedTarget))return;
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
    function cancelEntry(){++entryId;document.querySelector('.split-layout')?.getAnimations().forEach(a=>{if(a.id==='resolution-under')a.cancel();});entry?.getAnimations({subtree:true}).forEach(a=>a.cancel());entry?.remove();entry=null;document.body.classList.remove('content-resolving','content-pointer-locked');hidePreview();}
    // The loading mark: the logo, at the size it has in the header, stands in the middle of the
    // paper, pale, and fills from the bottom up as the post loads. What fills it is a band of
    // the category colours that keeps flowing upward through the letters while the level rises;
    // both are compositor transforms.
    const FILL={duration:1000,easing:'cubic-bezier(.65,0,.2,1)'};
    function number(state,value){
        if(state.ticket!==entryId)return Promise.resolve();
        state.value=value;state.scene.dataset.percentage=String(value);
        const empty=(100-value).toFixed(2);
        state.level.style.transform=`translate3d(0,${empty}%,0)`;
        return sleep(reduced.matches||!state.ready?0:FILL.duration);
    }
    // A post that is already loaded gets the same paper, but it does not stop: it comes up over
    // the page and carries straight on off the top, and the post is there underneath.
    function pass(){
        if(reduced.matches)return;
        const sheet=document.createElement('div');sheet.className='resolution-pass';sheet.setAttribute('aria-hidden','true');
        document.body.append(sheet);
        sheet.animate([{transform:'translate3d(0,100%,0)'},{transform:'translate3d(0,-100%,0)'}],
            {duration:1300,easing:'cubic-bezier(.7,0,.3,1)',fill:'forwards'}).finished.then(()=>sheet.remove(),()=>sheet.remove());
        const page=document.querySelector('.split-layout');
        const under=page?.animate([{transform:'translate3d(0,0,0) scale(1)'},{transform:'translate3d(0,-150px,0) scale(.96)'}],
            {duration:650,easing:'cubic-bezier(.7,0,.84,0)',fill:'forwards',id:'resolution-under'});
        setTimeout(()=>{
            under?.cancel();
            document.querySelector('#panel-post-body')?.animate([
                {transform:'translate3d(0,220px,0)',opacity:.4},{transform:'translate3d(0,0,0)',opacity:1}
            ],{duration:1150,easing:'cubic-bezier(.22,1,.36,1)'});
        },650);
    }
    function begin(id){
        cancelEntry();if(loadedPosts.has(String(id))){pass();return null;}
        const ticket=entryId,scene=document.createElement('section');entry=scene;
        scene.className='resolution-scene';scene.setAttribute('aria-hidden','true');
        scene.innerHTML='<div class="resolution-stage"><div class="resolution-mark"><span class="resolution-mark-base"></span><span class="resolution-mark-level"><span class="resolution-mark-colours"></span></span></div></div><p class="resolution-label"><span>Loading</span><span class="resolution-title"></span></p>';
        // An absolute address: a relative one inside a custom property resolves against the stylesheet.
        scene.querySelector('.resolution-mark').style.setProperty('--mark',`url("${new URL('./mainPage_img/Frame 2.png',document.baseURI).href}")`);
        scene.querySelector('.resolution-title').textContent=source(rowFor(id))?.title||'';
        // The same size as the logo in the header.
        const headerLogo=document.querySelector('#site-header-controls .logo')?.getBoundingClientRect();
        const markSize=Math.round(headerLogo&&headerLogo.width>8?headerLogo.width:72);
        const mark=scene.querySelector('.resolution-mark');mark.style.width=mark.style.height=markSize+'px';
        document.body.append(scene);document.body.classList.add('content-resolving','content-pointer-locked');
        clearTimeout(hoverTimer);hidePreview();activeRow?.classList.remove('signal-active');activeRow=null;window.globalPanelScene?.setRowPointer(null,null);
        const state={ticket,scene,value:0,id:String(id),ready:false,level:scene.querySelector('.resolution-mark-level')};
        number(state,0);state.ready=true;
        // The page underneath is drawn down and back as the paper comes up over it.
        if(!reduced.matches)document.querySelector('.split-layout')?.animate([
            {transform:'translate3d(0,0,0) scale(1)'},{transform:'translate3d(0,-150px,0) scale(.96)'}
        ],{duration:900,easing:'cubic-bezier(.76,0,.24,1)',fill:'forwards',id:'resolution-under'});
        // A few calm steps while the post loads.
        state.progress=(async()=>{
            await sleep(reduced.matches?0:420);
            for(const value of [26,58,84]){
                if(ticket!==entryId)return;
                number(state,value);
                await sleep(reduced.matches?0:560);
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
        await sleep(reduced.matches?0:220);if(state.ticket!==entryId)return;
        document.querySelector('.split-layout')?.getAnimations().forEach(a=>{if(a.id==='resolution-under')a.cancel();});
        if(ok&&!reduced.matches){
            // The article rises from well below as the paper lifts away.
            document.querySelector('#panel-post-body')?.animate([
                {transform:'translate3d(0,220px,0)',opacity:.4},{transform:'translate3d(0,0,0)',opacity:1}
            ],{duration:1250,easing:'cubic-bezier(.22,1,.36,1)'});
        }
        document.documentElement.classList.remove('opening-post');
        document.body.classList.remove('content-resolving');state.scene.classList.add('is-resolved');
        await sleep(reduced.matches?80:860);if(state.ticket===entryId){state.scene.remove();entry=null;document.body.classList.remove('content-pointer-locked');}
    }
    let revealObserver, completionObserver, coverObserver, decodeObserver, linePrepObserver, lineRevealObserver, lineVisibilityObserver, lineVersion=0;
    // Reading: the text comes up line by line as it scrolls into view, each line rising from
    // below through a mask of its own height. Every word is put in a mask (an inline-block clipped
    // to its line) with the word inside it; when a block comes into view its words are grouped
    // into lines by where they sit, and each line rises a moment after the one above it. Blocks
    // are split a little before they arrive, so the work is spread over the scroll.
    const LINE_BLOCKS='p,li,h1,h2,h3,h4,h5,h6,figcaption,dt,dd';
    function lineBlocks(root){
        return [...root.querySelectorAll(LINE_BLOCKS)].filter(el=>
            !el.closest('pre,table,.img-zoom-wrapper,.image-slider,.slider-container,.post-button-row')&&
            !el.querySelector(LINE_BLOCKS)&&el.textContent.trim());
    }
    function splitWords(block){
        const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{acceptNode:node=>
            node.textContent.trim()&&!node.parentElement.closest('code,kbd,svg,.rl-m')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
        const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
        nodes.forEach(node=>{
            const frag=document.createDocumentFragment();
            node.textContent.split(/(\s+)/).forEach(part=>{
                if(!part)return;
                if(/^\s+$/.test(part)){frag.append(part);return;}
                const mask=document.createElement('span');mask.className='rl-m';
                const word=document.createElement('span');word.className='rl-i';word.textContent=part;
                mask.append(word);frag.append(mask);
            });
            node.replaceWith(frag);
        });
        // Inline code is kept whole, as one word.
        block.querySelectorAll('code,kbd').forEach(code=>{
            if(code.closest('.rl-m'))return;
            const mask=document.createElement('span');mask.className='rl-m';
            const word=document.createElement('span');word.className='rl-i';
            code.replaceWith(mask);word.append(code);mask.append(word);
        });
        block.classList.add('rl-split');
    }
    function revealLines(blocks){
        // Read every line position before writing any delay. Interleaving these used to force
        // style recalculation once per word, right in the middle of a scroll frame.
        const lines=blocks.map(block=>{
            let line=-1,last=null;
            return [...block.querySelectorAll('.rl-m')].map(mask=>{
                const top=Math.round(mask.getBoundingClientRect().top);
                if(last===null||Math.abs(top-last)>4){line++;last=top;}
                return {word:mask.firstElementChild,delay:Math.min(line,12)*70+'ms'};
            });
        });
        lines.forEach(words=>words.forEach(({word,delay})=>{word.style.transitionDelay=delay;}));
        blocks.forEach(block=>block.classList.add('rl-in'));
    }
    function setupLines(content){
        linePrepObserver?.disconnect();lineRevealObserver?.disconnect();lineVisibilityObserver?.disconnect();
        const version=++lineVersion,visible=new Set();
        if(reduced.matches)return;
        const blocks=[$('#panel-title'),...lineBlocks(content)].filter(Boolean);
        lineVisibilityObserver=new IntersectionObserver(entries=>entries.forEach(({target:block,isIntersecting})=>{
            if(isIntersecting){visible.add(block);block.classList.remove('rl-offscreen');return;}
            visible.delete(block);
            if(!block.classList.contains('rl-in'))return;
            const release=()=>{
                if(version===lineVersion&&block.isConnected&&!visible.has(block))block.classList.add('rl-offscreen');
            };
            // Finish the existing rise even if it leaves the screen. A fast scroll back still
            // sees precisely the same animation phase; only completed, invisible words shed layers.
            const running=block.getAnimations({subtree:true}).filter(animation=>
                animation.effect?.target?.classList.contains('rl-i')&&animation.playState!=='finished');
            if(running.length)Promise.allSettled(running.map(animation=>animation.finished)).then(release);
            else release();
        }));
        lineRevealObserver=new IntersectionObserver(entries=>{
            const arriving=entries.filter(e=>e.isIntersecting).map(e=>e.target);
            arriving.forEach(block=>{
                lineRevealObserver.unobserve(block);
                if(!block.classList.contains('rl-split'))splitWords(block);
            });
            revealLines(arriving);
        },{rootMargin:'0px 0px -6% 0px'});
        linePrepObserver=new IntersectionObserver(entries=>entries.forEach(e=>{
            if(!e.isIntersecting)return;linePrepObserver.unobserve(e.target);
            if(!e.target.classList.contains('rl-split'))splitWords(e.target);
        }),{rootMargin:'0px 0px 60% 0px'});
        blocks.forEach(block=>{
            block.classList.remove('rl-split','rl-in','rl-offscreen');block.classList.add('rl-block');
            lineVisibilityObserver.observe(block);
            linePrepObserver.observe(block);lineRevealObserver.observe(block);
        });
    }
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
        // Code blocks carry their own head (language and copy), see PostContent.normalizeCodeBlocks.
        window.PostContent?.normalizeCodeBlocks?.(content);
        // Pictures and media are uncovered as whole blocks; text rises line by line (setupLines).
        const targets=content.querySelectorAll('figure:not(.gallery-plate),.img-zoom-wrapper,video');
        revealObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-revealed');revealObserver.unobserve(e.target);}}),{threshold:.08});
        targets.forEach(el=>{el.classList.add('publication-reveal');revealObserver.observe(el);});
        // Pictures are shown as they are: the old pixelated decode reveal on the first figure read as a broken image.
        let complete=$('.reading-complete');
        if(!complete){complete=document.createElement('section');complete.className='reading-complete';complete.setAttribute('aria-label','읽기 완료');complete.innerHTML='<div><span class="complete-value">00</span><span>%</span></div><p>READING COMPLETE</p>';$('[id="panel-continuation"],.post-continuation')?.before(complete);}
        if(complete){
            complete.classList.remove('is-revealed');
            complete.querySelector('.complete-value').textContent='00';
            completionObserver=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){const value=complete.querySelector('.complete-value');value.textContent='100';if(!reduced.matches)value.animate([{transform:'translateY(70%)',clipPath:'inset(0 0 100%)'},{transform:'translateY(0)',clipPath:'inset(0)'}],{duration:520,easing:motion.ease});complete.classList.add('is-revealed');completionObserver.disconnect();}},{threshold:.35});completionObserver.observe(complete);
        }
        const next=$('.post-continuation-label'),nextLink=$('.post-continuation-link');if(next&&nextLink){const id=nextLink.dataset.postId||new URL(nextLink.href).searchParams.get('id');next.textContent=id?'NEXT / A'+String(id).padStart(3,'0'):'NEXT / INDEX';}
        setupContents();
        setupLines(content);
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
    function mobileActive(){
        mobileFrame=0;if(!mobile.matches||$('#post-panel-viewer')?.classList.contains('active-state'))return;
        const rows=document.querySelectorAll('.post-list-item');let nearest=null,distance=Infinity;rows.forEach(row=>{const r=row.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;const d=Math.abs(r.top+r.height/2-innerHeight/2);if(d<distance){nearest=row;distance=d;}});select(nearest||rows[0]||null);
    }
    document.addEventListener('scroll',()=>{if(mobile.matches&&!mobileFrame)mobileFrame=requestAnimationFrame(mobileActive);},{capture:true,passive:true});
    window.addEventListener('resize',()=>{hidePreview();mobileActive();});
    document.querySelectorAll('.footer-statement').forEach(el=>{el.textContent='KEEP EXPLORING.';});
    window.Publication2026={begin,resolve,cancel:cancelEntry,enhance,refreshIndex:mobileActive};
})();
