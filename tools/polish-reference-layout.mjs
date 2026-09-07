import {readFileSync,writeFileSync} from 'node:fs';
let css=readFileSync('css/editorial.css','utf8').replaceAll(':is(.post-body,.post-viewer-content,.publication-content)',':is(.post-body,.post-viewer-content,.publication-content,#markdown-content)');
css=css.replace('/* Explicit editorial splits',`:is(.post-body,.post-viewer-content,.publication-content,#markdown-content) .post-editorial-heading:not([data-section-number])::before{display:none}
:is(.post-body,.post-viewer-content,.publication-content,#markdown-content) .post-principles>li::marker{content:''}
/* Explicit editorial splits`);
writeFileSync('css/editorial.css',css);
css=readFileSync('css/exhibition.css','utf8').replace('max-width:15ch;margin:50px','max-width:15ch;word-break:keep-all;text-wrap:balance;margin:50px');
css=css.replace('/* A wide opening',`html body:has(.post-panel-viewer.active-state) .panel-close-btn{background:#fafafa!important}
.post-list-item{opacity:1!important;transform:none!important}
/* A wide opening`);
writeFileSync('css/exhibition.css',css);
let source=readFileSync('index.html','utf8');
const start=source.indexOf('    function setupPostReveal(container)');
const end=source.indexOf('    narrowPostListQuery.addEventListener',start);
source=source.slice(0,start)+`    function setupPostReveal(container) {
        postRevealObserver?.disconnect();
        const items = container.querySelectorAll('.post-list-item');
        items.forEach(item => item.classList.add('revealed'));
        if (reducedMotionQuery.matches) return;
        postRevealObserver = new IntersectionObserver((entries, observer) => {
            let order = 0;
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                if (document.getElementById('post-panel-viewer').classList.contains('active-state')) return;
                entry.target.querySelector('.post-list-content.main')?.animate([
                    { clipPath:'inset(0 0 100% 0)', transform:'translateY(28px)' },
                    { clipPath:'inset(0 0 0 0)', transform:'translateY(0)' }
                ], { duration:750, delay:order++*75, easing:'cubic-bezier(.16,1,.3,1)', fill:'backwards' });
            });
        }, { root:isMobileLayout() ? null : document.querySelector('.index-panel'), threshold:.05 });
        items.forEach(item => postRevealObserver.observe(item));
    }

`+source.slice(end);
source=source.replace("tocItems.forEach((item, index) => item.li.classList.toggle('active', index === activeIndex));",`tocItems.forEach((item, index) => {
                    item.li.classList.toggle('active', index === activeIndex);
                    if (index === activeIndex) item.li.setAttribute('aria-current','location');
                    else item.li.removeAttribute('aria-current');
                });`);
writeFileSync('index.html',source);
let helper=readFileSync('js/postContent.js','utf8').replace("heading.dataset.sectionNumber = String(++sectionNumber).padStart(2, '0');", "sectionNumber++;\n            if (!/^\\d+[.)]/.test(heading.textContent.trim())) heading.dataset.sectionNumber = String(sectionNumber).padStart(2, '0');");
writeFileSync('js/postContent.js',helper);
let preview=readFileSync('preview.html','utf8').replace('font-size:11px;line-height:1.7','font-size:13px;line-height:1.7').replace('font-size:11px;color:#6b6b68','font-size:14px;color:#666').replace("font:italic 44px/1.2 'Instrument Serif',Georgia,serif", "font:500 32px/1.3 'Pretendard',sans-serif").replace('font-size:34px;line-height:1.3','font-size:42px;line-height:1.16').replace('.preview-notice{font-size:10px}', '.preview-notice{font-size:12px}');
writeFileSync('preview.html',preview);
