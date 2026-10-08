(function () {
    const archive=document.querySelector('.index-panel');
    const toggle=document.querySelector('.archive-toggle');
    const viewer=document.getElementById('post-panel-viewer');
    const panel=document.getElementById('post-panel');
    const continuation=document.getElementById('panel-continuation');
    toggle?.addEventListener('click',()=>{
        const pinned=document.body.classList.toggle('archive-pinned');
        toggle.setAttribute('aria-expanded',String(pinned));
        toggle.setAttribute('aria-label',pinned ? '글 목록 접기' : '글 목록 펼치기');
        if(!pinned) { toggle.blur(); archive.classList.add('disable-hover'); }
    });
    archive?.addEventListener('pointerleave',()=>archive.classList.remove('disable-hover'));
    document.addEventListener('keydown',e=>{
        if(e.key==='Escape' && document.body.classList.contains('archive-pinned')) {
            e.preventDefault();
            document.body.classList.remove('archive-pinned');
            toggle.setAttribute('aria-expanded','false');
            toggle.setAttribute('aria-label','글 목록 펼치기');
            toggle.blur(); archive.classList.add('disable-hover');
        }
    });
    const observer=new MutationObserver(()=>{
        const open=viewer.classList.contains('active-state');
        document.getElementById('post-panel-placeholder').toggleAttribute('inert',open);
        document.title=open && document.getElementById('panel-title').textContent ? document.getElementById('panel-title').textContent+' — SWBLOG' : 'SWBLOG — Notes & Experiments';
    });
    observer.observe(viewer,{attributes:true,attributeFilter:['class']});
    observer.observe(document.getElementById('panel-title'),{childList:true});
    // The ending's position changes with content and viewport size, not with each scroll.
    let frame=0,dirty=true,endingTop=Infinity,threshold=0;
    const updateEnding=()=>{
        frame=0;
        if(!viewer.classList.contains('active-state')){dirty=true;return;}
        const scrollTop=panel.scrollTop;
        if(dirty){
            endingTop=continuation.getBoundingClientRect().top-panel.getBoundingClientRect().top+scrollTop;
            threshold=panel.clientHeight*.38;
            dirty=false;
        }
        document.body.classList.toggle('post-end-stage',endingTop-scrollTop<threshold);
    };
    const queueEnding=()=>{if(!frame)frame=requestAnimationFrame(updateEnding);};
    const invalidateEnding=()=>{dirty=true;queueEnding();};
    panel.addEventListener('scroll',queueEnding,{passive:true});
    // Phones and tablets: the close button, the menu arrow and the contents button sit over the
    // text. Reading down (a steady 28px or more) slides them away; scrolling up, or coming back
    // near the top, brings them back. Only the buttons' own class changes, and only when the
    // direction does, so scrolling restyles nothing else (css/reading.css).
    const narrow=window.matchMedia('(max-width:1180px)');
    let lastTop=0,travel=0,away=false,chromeFrame=0;
    const setAway=value=>{
        if(value===away)return;
        away=value;
        document.querySelectorAll('.panel-close-btn,.hamburger-btn,.mobile-contents').forEach(el=>el.classList.toggle('is-away',value));
    };
    const updateChrome=()=>{
        chromeFrame=0;
        const top=panel.scrollTop,delta=top-lastTop;lastTop=top;
        if(!narrow.matches||!viewer.classList.contains('active-state')||top<96){travel=0;setAway(false);return;}
        if(delta*travel<0)travel=0;
        travel+=delta;
        if(travel>28)setAway(true);
        else if(travel<-28)setAway(false);
    };
    panel.addEventListener('scroll',()=>{if(!chromeFrame)chromeFrame=requestAnimationFrame(updateChrome);},{passive:true});
    new MutationObserver(()=>{if(!viewer.classList.contains('active-state')){lastTop=0;travel=0;setAway(false);}}).observe(viewer,{attributes:true,attributeFilter:['class']});
    narrow.addEventListener?.('change',()=>{if(!narrow.matches)setAway(false);});
    const sizes=new ResizeObserver(invalidateEnding);
    [panel,document.getElementById('panel-post-body'),continuation].filter(Boolean).forEach(el=>sizes.observe(el));
    new MutationObserver(invalidateEnding).observe(viewer,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',invalidateEnding,{passive:true});
})();
