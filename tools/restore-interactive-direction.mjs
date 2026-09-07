import {readFileSync,writeFileSync} from 'node:fs';
const read=f=>readFileSync(f,'utf8'), write=(f,s)=>writeFileSync(f,s,'utf8');
const original=read('.design-backup/original/index.html');
let page=read('index.html');
const oldStart=original.indexOf('    class PlaceholderScene {'), oldEnd=original.indexOf('    class WovenArchiveScene {');
const start=page.indexOf('    class AsciiArtScene extends'), end=page.indexOf('    fetchPosts();',start);
if([oldStart,oldEnd,start,end].some(x=>x<0)) throw new Error('Missing scene anchors');
let rail=original.slice(oldStart,oldEnd);
// The original rail's motion, cards, hover titles, depth and drag are retained.
rail=rail.replace('this.container.placeholderScene = this;',"this.container.placeholderScene = this;\n            this.container.classList.add('rail-placeholder');");
rail=rail.replace('delete this.container.placeholderScene;',"delete this.container.placeholderScene;\n            this.container.classList.remove('rail-placeholder');");
rail=rail.replace("if (typeof exitLandingState === 'function') exitLandingState({ immediate: true });", "if (typeof exitLandingState === 'function') exitLandingState({ immediate: true });");
rail=rail.replace('loadPanelPost(post.id);', "openPanelPost(post.id, listItem, 'push');");
page=page.slice(0,start)+"    class AsciiArtScene extends window.AsciiVolumeScene {}\n"+rail+page.slice(end);
page=page.replace('    <script src="./js/skyPrint.js?v=exhibition-1"></script>', '    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n    <script src="./js/asciiVolume.js?v=volume-1"></script>');
const mastheadStart=page.indexOf('            <header class="masthead">'), mastheadEnd=page.indexOf('            </header>',mastheadStart)+25;
const originalMastheadStart=original.indexOf('            <header class="masthead">'), originalMastheadEnd=original.indexOf('            </header>',originalMastheadStart)+25;
page=page.slice(0,mastheadStart)+original.slice(originalMastheadStart,originalMastheadEnd)+page.slice(mastheadEnd);
page=page.replace(/<div class="site-edition"[^\n]+\n/,'');
page=page.replace('The index<span>전체 글 목록</span>','전체 글 목록');
const motionStart=page.indexOf('    function mountReadingPlaceholder() {');
const motionEnd=page.indexOf('    requestAnimationFrame(syncLandingChromeAlignment);',motionStart);
page=page.slice(0,motionStart)+`    function mountReadingPlaceholder() {
        window.globalPlaceholderScene?.destroy();
        window.globalPlaceholderScene=null;
        const placeholder=document.getElementById('post-panel-placeholder');
        placeholder.replaceChildren();
        window.globalAsciiScene?.destroy();
        window.globalAsciiScene=new AsciiArtScene('post-panel-placeholder');
    }
    function exploreContent() {
        if(isMobileLayout()) {
            document.querySelector('.main-cont-back')?.scrollIntoView({behavior:reducedMotionQuery.matches?'auto':'smooth',block:'start'});
        } else exitLandingState();
    }
    window.exploreContent=exploreContent;

    async function transitionArchive(toLanding,immediate=false) {
        if(landingTransitionActive || isLanding===toLanding) return;
        const animate=!immediate && !reducedMotionQuery.matches;
        const title=document.querySelector('.hello-content-box h1');
        const from=title.getBoundingClientRect();
        const font=getComputedStyle(title);
        const clone=animate?title.cloneNode(true):null;
        landingTransitionActive=true; window.isLayoutTransitioning=true;
        document.body.classList.add('landing-transition-active');
        if(clone) {
            clone.className='landing-transition-title'; clone.setAttribute('aria-hidden','true');
            Object.assign(clone.style,{left:from.left+'px',top:from.top+'px',width:'max-content',height:'auto',fontFamily:font.fontFamily,fontSize:font.fontSize,fontWeight:font.fontWeight,lineHeight:font.lineHeight,letterSpacing:font.letterSpacing,color:font.color});
            document.body.append(clone); title.style.visibility='hidden';
        }
        // Cards leave on their own curved rail before the archive opens.
        if(!toLanding && animate) { window.globalPlaceholderScene?.triggerExit(); await waitForLandingMotion(300); }
        isLanding=toLanding;
        document.body.classList.add('landing-layout-snap');
        document.body.classList.toggle('landing-state',toLanding);
        document.body.classList.remove('list-footer-stage');
        clearLandingInlineMotion(); resetLandingControls();
        if(toLanding) {
            window.globalAsciiScene?.destroy(); window.globalAsciiScene=null;
            document.getElementById('post-panel-placeholder').replaceChildren();
            window.globalPlaceholderScene=new PlaceholderScene('post-panel-placeholder');
            if(allPosts.length) window.globalPlaceholderScene.updateCards(allPosts);
            if(animate) window.globalPlaceholderScene.triggerEnter();
            document.querySelector('.index-panel').scrollTop=0;
        } else mountReadingPlaceholder();
        await waitForTwoFrames();
        if(animate) {
            const to=title.getBoundingClientRect();
            const finalFont=parseFloat(getComputedStyle(title).fontSize);
            const scale=finalFont/parseFloat(font.fontSize);
            // Uniform scaling preserves letterforms and round category symbols.
            const titleMotion=clone.animate([
                {transform:'translate3d(0,0,0) scale(1)'},
                {transform:'translate3d('+(to.left-from.left)+'px,'+(to.top-from.top)+'px,0) scale('+scale+')'}
            ],{duration:800,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
            const motions=[titleMotion];
            if(!toLanding) {
                document.querySelectorAll('.post-list-item').forEach((row,index)=> {
                    if(index>6) return;
                    motions.push(row.animate([
                        {clipPath:'inset(0 0 100% 0)',transform:'translateY(35px)'},
                        {clipPath:'inset(0 0 0 0)',transform:'translateY(0)'}
                    ],{duration:700,delay:110+index*65,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'}));
                });
                motions.push(document.getElementById('post-panel').animate([
                    {clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}
                ],{duration:850,easing:'cubic-bezier(.22,1,.36,1)'}));
            }
            await Promise.allSettled(motions.map(m=>m.finished));
            motions.forEach(m=>m.cancel());
        }
        clone?.remove(); title.style.visibility='';
        document.body.classList.remove('landing-layout-snap','landing-transition-active');
        landingTransitionActive=false; window.isLayoutTransitioning=false;
        targetScrollDown=currentScrollDown=targetScrollUp=currentScrollUp=0;
        window.globalAsciiScene?.onResize(); window.globalPlaceholderScene?.onWindowResize();
        syncLandingChromeAlignment(true); requestJellyFrame();
    }
    const exitLandingState=({immediate=false}={})=>transitionArchive(false,immediate);
    const enterLandingState=()=>{if(!isMobileLayout())return transitionArchive(true);};

`+page.slice(motionEnd);
page=page.replace("        if (!isLanding) { window.globalAsciiScene = window.globalPlaceholderScene; }\n",'');
write('index.html',page);
