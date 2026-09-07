import { readFileSync, writeFileSync } from 'node:fs';
const read = f => readFileSync(f,'utf8');
const write = (f,s) => writeFileSync(f,s,'utf8');
const replace = (s,a,b) => { if(!s.includes(a)) throw new Error('Missing edit anchor: '+a.slice(0,70)); return s.replace(a,b); };
let s=read('index.html');
s=replace(s,'    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>', '    <script src="./js/skyPrint.js?v=exhibition-1"></script>');
s=s.replace(/^.*<script src="https:\/\/cdn.jsdelivr.net\/npm\/three@.*\r?\n/gm,'');
s=replace(s,'</head>', '    <link rel="stylesheet" href="./css/editorial.css?v=exhibition-1">\n    <link rel="stylesheet" href="./css/exhibition.css?v=exhibition-1">\n</head>');
s=replace(s,'<div class="split-layout">', '<div class="site-edition" aria-hidden="true"><span>INDEPENDENT NOTES & EXPERIMENTS</span><span>SEOUL, KR &nbsp; / &nbsp; <span class="current-year">2026</span></span></div>\n<div class="split-layout">');
s=replace(s,'<header class="masthead">', `<header class="masthead">
                <div class="landing-note">
                    <span class="landing-eyebrow">A PERSONAL COLLECTION &nbsp; / &nbsp; 001—∞</span>
                    <h2>관찰에서<br>시작되는 것들<span class="landing-period">.</span></h2>
                    <p>디자인과 기술, 그리고 그 사이.<br>만들고 생각하며 쌓아가는 작은 기록들.</p>
                    <button type="button" class="landing-explore" onclick="exploreContent()">기록 둘러보기 <span>↗</span></button>
                    <div class="landing-featured" aria-label="최근 기록"></div>
                </div>`);
s=s.replace('2026</span> Work / Blog / Etc','2026</span> &nbsp; / &nbsp; SELECTED NOTES & EXPERIMENTS');
s=replace(s,'<h2 class="section-title">전체 글 목록</h2>', '<div class="archive-heading"><h2 class="section-title">The index<span>전체 글 목록</span></h2><span class="archive-count" id="archive-count">00 ENTRIES</span></div>');
s=replace(s,'<div class="index-panel">','<div class="index-panel" id="archive-panel">\n        <button type="button" class="archive-toggle" aria-label="글 목록 펼치기" aria-expanded="false" aria-controls="post-container"><span class="archive-toggle-icon">☷</span><span class="archive-toggle-copy">THE INDEX <small>글 목록</small></span><span class="archive-toggle-arrow">↗</span></button>');
s=replace(s,'<time class="post-viewer-date" id="panel-date"></time>','<time class="post-viewer-date" id="panel-date"></time><span class="post-reading-meta" id="panel-reading-meta"></span>');
s=replace(s,'<div class="toc-title">Navigate</div>','<div class="toc-title">IN THIS NOTE <span>목차</span></div>');
s=replace(s,'<strong id="toc-progress-text">0%</strong>','<span>READING PROGRESS</span><strong id="toc-progress-text">0%</strong>');
const transitionStart=s.indexOf('    function createLandingTransitionLayer(');
const transitionEnd=s.indexOf('    requestAnimationFrame(syncLandingChromeAlignment);',transitionStart);
if(transitionStart<0 || transitionEnd<0) throw new Error('Transition not found');
s=s.slice(0,transitionStart)+`    function mountReadingPlaceholder() {
        if (window.globalPlaceholderScene) {
            window.globalAsciiScene = window.globalPlaceholderScene;
            window.globalPlaceholderScene = null;
            window.globalAsciiScene.triggerEnter();
        } else if (!window.globalAsciiScene) {
            window.globalAsciiScene = new AsciiArtScene('post-panel-placeholder');
        }
        window.globalAsciiScene?.onResize();
    }

    function exploreContent() {
        if (isMobileLayout()) {
            document.querySelector('.main-cont-back')?.scrollIntoView({ behavior: reducedMotionQuery.matches ? 'auto' : 'smooth', block: 'start' });
            return;
        }
        exitLandingState();
    }
    window.exploreContent = exploreContent;

    async function transitionArchive(toLanding, immediate = false) {
        if (landingTransitionActive || isLanding === toLanding) return;
        const run = ++landingTransitionRun;
        const title = document.querySelector('.hello-content-box h1');
        const panel = document.getElementById('post-panel');
        const fromTitle = title.getBoundingClientRect();
        const fromPanel = panel.getBoundingClientRect();
        const animate = !immediate && !reducedMotionQuery.matches;
        const clone = animate ? title.cloneNode(true) : null;
        const style = getComputedStyle(title);
        landingTransitionActive = true;
        window.isLayoutTransitioning = true;
        if (clone) {
            clone.className='landing-transition-title';
            clone.setAttribute('aria-hidden','true');
            Object.assign(clone.style,{left:fromTitle.left+'px',top:fromTitle.top+'px',width:fromTitle.width+'px',height:fromTitle.height+'px',fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,color:style.color});
            document.body.append(clone);
            title.style.visibility='hidden';
        }
        isLanding=toLanding;
        document.body.classList.add('landing-layout-snap','landing-transition-active');
        document.body.classList.toggle('landing-state',toLanding);
        document.body.classList.remove('list-footer-stage');
        clearLandingInlineMotion(); resetLandingControls();
        if(toLanding) {
            window.globalPlaceholderScene=window.globalAsciiScene || new PlaceholderScene('post-panel-placeholder');
            window.globalAsciiScene=null;
            window.globalPlaceholderScene.triggerEnter();
            document.querySelector('.index-panel').scrollTop=0;
        } else mountReadingPlaceholder();
        if(animate) {
            await waitForTwoFrames();
            const toTitle=title.getBoundingClientRect(), toPanel=panel.getBoundingClientRect();
            const timing={duration:850,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'};
            const titleMotion=clone.animate([
                {transform:'translate3d(0,0,0) scale(1)'},
                {transform:'translate3d('+(toTitle.left-fromTitle.left)+'px,'+(toTitle.top-fromTitle.top)+'px,0) scale('+(toTitle.width/fromTitle.width)+','+(toTitle.height/fromTitle.height)+')'}
            ],timing);
            const artMotion=panel.animate([
                {transformOrigin:'top left', transform:'translate('+(fromPanel.left-toPanel.left)+'px,'+(fromPanel.top-toPanel.top)+'px) scale('+(fromPanel.width/toPanel.width)+','+(fromPanel.height/toPanel.height)+')'},
                {transformOrigin:'top left', transform:'none'}
            ],timing);
            const entering=document.querySelector(toLanding ? '.landing-note' : '.main-cont-back');
            const reveal=entering?.animate([{opacity:0,transform:'translateY(24px)'},{opacity:1,transform:'translateY(0)'}],{duration:580,delay:180,easing:'cubic-bezier(.22,1,.36,1)'});
            await Promise.allSettled([titleMotion.finished,artMotion.finished,reveal?.finished]);
            titleMotion.cancel(); artMotion.cancel();
        }
        if(run!==landingTransitionRun) return;
        clone?.remove(); title.style.visibility='';
        document.body.classList.remove('landing-layout-snap','landing-transition-active');
        landingTransitionActive=false; window.isLayoutTransitioning=false;
        targetScrollDown=currentScrollDown=targetScrollUp=currentScrollUp=0;
        window.globalAsciiScene?.onResize(); window.globalPlaceholderScene?.onResize();
        requestJellyFrame();
    }
    const exitLandingState = ({immediate=false}={}) => transitionArchive(false,immediate);
    const enterLandingState = () => { if (!isMobileLayout()) return transitionArchive(true); };

`+s.slice(transitionEnd);
const classStart=s.indexOf('    class AsciiArtScene {');
const classEnd=s.indexOf('    fetchPosts();',classStart);
if(classStart<0 || classEnd<0) throw new Error('Scene not found');
s=s.slice(0,classStart)+`    class AsciiArtScene extends window.SkyPrintScene {}
    class PlaceholderScene extends window.SkyPrintScene {
        updateCards(posts) {
            const featured=document.querySelector('.landing-featured');
            if(!featured) return;
            featured.replaceChildren();
            const label=document.createElement('span'); label.className='featured-label'; label.textContent='RECENT ENTRIES'; featured.append(label);
            posts.slice(0,2).forEach((post,index)=> {
                const link=document.createElement('a');
                link.href='?post='+encodeURIComponent(post.id);
                const img=getFirstImage(post.content);
                link.innerHTML=(img ? '<img src="'+escapeHtml(img)+'" alt="" loading="lazy">' : '<span class="featured-number">'+String(index+1).padStart(2,'0')+'</span>')+'<span>'+escapeHtml(post.title)+'</span><span aria-hidden="true">↗</span>';
                link.addEventListener('click',e=> { if(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); const item=document.querySelector('.post-list-item[data-post-id="'+post.id+'"]'); openPanelPost(post.id,item,'push'); });
                featured.append(link);
            });
        }
    }

`+s.slice(classEnd);
s=s.replace('window.globalPlaceholderScene = new PlaceholderScene(\'post-panel-placeholder\');\n        if (allPosts.length)', 'window.globalPlaceholderScene = new PlaceholderScene(\'post-panel-placeholder\');\n        if (!isLanding) { window.globalAsciiScene = window.globalPlaceholderScene; }\n        if (allPosts.length)');
s=s.replace('window.globalPlaceholderScene = new PlaceholderScene(\'post-panel-placeholder\');\r\n        if (allPosts.length)', 'window.globalPlaceholderScene = new PlaceholderScene(\'post-panel-placeholder\');\r\n        if (!isLanding) { window.globalAsciiScene = window.globalPlaceholderScene; }\r\n        if (allPosts.length)');
s=replace(s,"        container.innerHTML = postMarkup;", "        container.innerHTML = postMarkup;\n        document.getElementById('archive-count').textContent = String(posts.length).padStart(2, '0') + ' ENTRIES';");
s=replace(s,"        const headings = Array.from(contentEl.querySelectorAll('h2'));", "        const headings = Array.from(contentEl.querySelectorAll('h1, h2'));\n        const characters = contentEl.textContent.replace(/\\s/g, '').length;\n        document.getElementById('panel-reading-meta').textContent = '약 ' + Math.max(1, Math.ceil(characters / 500)) + '분 읽기';");
s=replace(s,"            const scrollableHeight = postPanel.scrollHeight - postPanel.clientHeight;", "            const bodyBottom = contentEl.getBoundingClientRect().bottom - postPanel.getBoundingClientRect().top + postPanel.scrollTop;\n            const scrollableHeight = bodyBottom - postPanel.clientHeight;");
s=replace(s,'const progress = scrollableHeight > 0 ? (postPanel.scrollTop / scrollableHeight) * 100 : 0;', 'const progress = scrollableHeight > 0 ? Math.min(100, (postPanel.scrollTop / scrollableHeight) * 100) : 100;');
s=s.replace("behavior: 'smooth'\n                    });", "behavior: reducedMotionQuery.matches ? 'auto' : 'smooth'\n                    });");
s=replace(s,"        const renderId = ++currentRenderId;", "        const renderId = ++currentRenderId;\n        document.body.classList.remove('post-end-stage', 'archive-pinned');\n        const archiveToggle = document.querySelector('.archive-toggle');\n        archiveToggle?.setAttribute('aria-expanded', 'false');");
s=replace(s,"        const nextPost = allPosts.find(post => String(post.id) !== String(currentPostId));", "        const currentPost = allPosts.find(post => String(post.id) === String(currentPostId));\n        const candidates = allPosts.filter(post => String(post.id) !== String(currentPostId));\n        const nextPost = candidates.find(post => post.category === currentPost?.category) || candidates[0];");
s=replace(s,"        if (panelReturnFocus instanceof HTMLElement) panelReturnFocus.focus", "        document.body.classList.remove('archive-pinned');\n        if (panelReturnFocus instanceof HTMLElement) panelReturnFocus.focus");
s=replace(s,"<script src=\"./js/footerTheme.js?v=footer-tone-1\"></script>", "<script src=\"./js/footerTheme.js?v=exhibition-1\"></script>\n<script src=\"./js/readingExperience.js?v=exhibition-1\"></script>");
write('index.html',s);

for(const f of ['post.html','editor.html']) {
    let p=read(f);
    p=replace(p,'</head>','    <link rel="stylesheet" href="./css/editorial.css?v=exhibition-1">\n    <link rel="stylesheet" href="./css/exhibition.css?v=exhibition-1">\n</head>');
    if(f==='post.html') {
        p=replace(p,'<time class="post-date" id="post-date-el"></time>','<time class="post-date" id="post-date-el"></time><span class="post-reading-meta" id="post-reading-meta"></span>');
        p=replace(p,'        processImageSliders(body);', "        document.getElementById('post-reading-meta').textContent = '약 ' + Math.max(1,Math.ceil(body.textContent.replace(/\\s/g,'').length/500)) + '분 읽기';\n        processImageSliders(body);");
        p=p.replace('./js/footerTheme.js?v=footer-tone-1','./js/footerTheme.js?v=exhibition-1');
    }
    write(f,p);
}

let main=read('js/main.js');
const introStart=main.indexOf('    if (reducedMotion) {');
const introEnd=main.indexOf("    root.classList.remove('intro-pending');",introStart);
main=main.slice(0,introStart)+`    const visited = sessionStorage.getItem('swblog-intro-seen');
    if (!reducedMotion && !visited && !new URLSearchParams(location.search).has('post')) {
      name?.classList.add('is-visible');
      await wait(400);
      scene.classList.add('is-revealing');
      await wait(500);
    }
    sessionStorage.setItem('swblog-intro-seen', '1');

`+main.slice(introEnd);
main=main.replace('    if (!reducedMotion) window.setTimeout(() => nudgeLandingRail(), 90);','');
write('js/main.js',main);
