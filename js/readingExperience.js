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
    const sizes=new ResizeObserver(invalidateEnding);
    [panel,document.getElementById('panel-post-body'),continuation].filter(Boolean).forEach(el=>sizes.observe(el));
    new MutationObserver(invalidateEnding).observe(viewer,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',invalidateEnding,{passive:true});
})();
