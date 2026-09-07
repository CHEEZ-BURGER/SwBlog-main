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
    let ticking=false;
    panel.addEventListener('scroll',()=>{
        if(ticking) return; ticking=true;
        requestAnimationFrame(()=>{
            ticking=false;
            if(!viewer.classList.contains('active-state')) return;
            const end=continuation.getBoundingClientRect().top-panel.getBoundingClientRect().top;
            document.body.classList.toggle('post-end-stage',end<panel.clientHeight*.38);
        });
    },{passive:true});
})();
