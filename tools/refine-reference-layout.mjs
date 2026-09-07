import {readFileSync,writeFileSync} from 'node:fs';
let css=readFileSync('css/exhibition.css','utf8').split('/* Reader typography')[0];
css=css.replaceAll('#f5f5f3','#fafafa').replaceAll('#efefec','#f1f1f1').replaceAll('#eaeae7','#eee');
css=css.replace('padding-left:clamp(315px,23vw,400px)!important','padding-left:clamp(310px,25vw,420px)!important');
css=css.replace('top:148px!important','top:142px!important');
css+=`
/* A wide opening, a measured reading column, then an edge-to-edge ending. */
.post-article{width:100%;max-width:none;margin:0;padding:0}
html body:has(.post-panel-viewer.active-state) #post-panel{border:0!important}
.post-article-header,.post-viewer-header{position:relative;display:block;padding:138px clamp(24px,5vw,80px) 80px;background:var(--post-canvas);min-height:560px;border:0;margin:0}
.post-article-header::before,.post-viewer-header::before{content:'JOURNAL / KIMSUNGWOO';display:block;position:static;font:13px/1.5 'Pretendard',sans-serif;letter-spacing:.045em;color:#777;border-bottom:1px solid #d5d5d5;padding-bottom:20px;margin-bottom:36px;width:100%;height:auto;background:none;transform:none}
.post-article-header::after,.post-viewer-header::after{display:none}
.post-category,.post-viewer-category{display:block;color:#555!important;font:14px/1.5 'Pretendard',sans-serif;letter-spacing:.06em;margin:0 0 24px;padding:0}
.post-title,.post-viewer-title,#panel-title{font:500 clamp(48px,5.7vw,86px)/1.13 'Pretendard Variable','Pretendard',sans-serif;letter-spacing:-.065em;word-break:keep-all;overflow-wrap:anywhere;max-width:22ch;margin:0 0 44px;padding:0;color:#171717!important;text-wrap:balance}
.post-date,.post-viewer-date{display:inline-block;font:14px/1.5 'Pretendard',sans-serif;letter-spacing:0;color:#666!important;margin:0}
.post-reading-meta{display:inline-block;font:14px/1.5 'Pretendard',sans-serif;color:#666;margin-left:20px;padding-left:20px;border-left:1px solid #bbb}
#panel-content,.post-body{font-size:19px!important}
.toc-title{display:flex;justify-content:space-between;gap:12px;margin-bottom:30px;padding-bottom:20px;border-bottom:1px solid #d5d5d5;font:14px/1.5 'Pretendard',sans-serif;letter-spacing:0}
.toc-title span{font-size:13px;color:#777}.toc-current{display:none}.toc-list{padding:0;margin:0;list-style:none;counter-reset:chapter}
body:has(.post-panel-viewer.active-state) .toc-list li{counter-increment:chapter;display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding:12px 0;border:0;margin:0;border-radius:0;font:15px/1.5 'Pretendard',sans-serif;color:#737373!important;white-space:normal;transition:color .25s,transform .25s;cursor:pointer}
.toc-list li::before{content:counter(chapter,decimal-leading-zero);font:12px/1.9 monospace;color:#999}
body:has(.post-panel-viewer.active-state) .toc-list li.active{color:#171717!important;background:none;transform:translateX(3px)}
body:has(.post-panel-viewer.active-state) .toc-list li.active::before{color:#3058f9}
.toc-progress-meta{display:flex;justify-content:space-between;align-items:center;font:12px/1.5 'Pretendard',sans-serif;margin-top:38px;color:#777}.toc-progress-meta strong{font:13px/1.5 monospace}.toc-reading-progress{height:2px;background:#ddd;margin-top:12px}.toc-reading-bar{height:100%;background:#171717}
.post-continuation,.post-page-footer,.footer{left:0;width:100%!important;max-width:none!important;margin:0!important;position:relative}
.post-continuation{padding:64px 48px 72px;background:#ededed;border-top:1px solid #bdbdbd;color:#171717}
.post-continuation-inner{max-width:1600px;width:100%;margin:0 auto;padding:0!important}
.post-continuation-label{display:flex;justify-content:space-between;align-items:center;gap:24px;font:500 clamp(38px,4.5vw,68px)/1.1 'Pretendard',sans-serif;letter-spacing:-.055em;text-transform:none;color:#171717;margin:0 0 56px}
.post-continuation-label::after{content:'CONTINUE READING ↙';font:13px/1.5 'Pretendard',sans-serif;letter-spacing:.035em}
.post-continuation-link{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:48px;align-items:stretch;color:inherit;text-decoration:none;border-top:1px solid #bdbdbd;padding-top:24px}.post-continuation-link::after{display:none}
.post-continuation-copy{grid-column:1;grid-row:1;display:flex;flex-direction:column;align-items:flex-start;padding:4px 40px 0 0}
.post-continuation-media{grid-column:2;grid-row:1;position:relative;display:block;width:100%;height:auto;max-height:none;aspect-ratio:4/3;overflow:hidden;background:#dedede}
.post-continuation-media::before{content:'↗';position:absolute;right:20px;bottom:8px;font:100px/1 'Pretendard',sans-serif;color:#999}
.post-continuation-media img{position:relative;width:100%;height:100%;object-fit:cover;border-radius:0;transition:transform .8s cubic-bezier(.2,.7,.1,1),filter .8s}.post-continuation-link:hover img{transform:scale(1.06)}
.post-continuation-meta{display:block;font:14px/1.6 'Pretendard',sans-serif;color:#666;margin-bottom:32px}
.post-continuation-title{display:block;font:500 clamp(32px,3.9vw,60px)/1.22 'Pretendard Variable','Pretendard',sans-serif;letter-spacing:-.055em;color:#171717;word-break:keep-all}
.post-continuation-copy::after{content:'글 읽기 ↗';display:block;font:16px/1.5 'Pretendard',sans-serif;padding:20px 0 0;margin-top:auto;color:#555;transition:transform .3s}.post-continuation-link:hover .post-continuation-copy::after{transform:translateX(8px);color:#3058f9}
.footer,.post-page-footer{min-height:0;padding:0!important;background:#fafafa!important;color:#171717!important;overflow:hidden;border-top:1px solid #bdbdbd}
.footer-shell,body:has(.post-panel-viewer.active-state) .panel-post-layout>.post-page-footer .footer-shell{width:100%;min-height:0;display:block;padding:0!important}
.footer-shell::before{display:none}
.footer-main{display:grid;grid-template-columns:1.4fr 1fr;gap:0;align-items:stretch;min-height:360px}
.footer-main>div{padding:40px 48px 56px;border-right:1px solid #bbb;display:flex;flex-direction:column}
.footer-kicker,.footer-nav-label,.footer-meta{font:14px/1.6 'Pretendard',sans-serif;letter-spacing:0;color:#777}
.footer .footer-statement,.post-page-footer .footer-statement{font:500 clamp(36px,4vw,60px)/1.2 'Pretendard',sans-serif;letter-spacing:-.055em;max-width:15ch;margin:50px 0 0;color:#171717!important}
.footer-nav{display:flex;flex-direction:column;padding:40px 48px 36px}
.footer-nav-label{display:block;margin-bottom:24px}
.footer-nav a{display:flex;justify-content:space-between;align-items:center;font:450 22px/1.5 'Pretendard',sans-serif;min-height:64px;padding:14px 0;border-bottom:1px solid #ccc;color:#171717;text-decoration:none;transition:padding .25s,color .25s}.footer-nav a::after{content:'↗';transition:transform .25s}.footer-nav a:hover{color:#3058f9;padding-inline:8px}.footer-nav a:hover::after{transform:translate(3px,-3px)}
.footer-bottom{display:grid;grid-template-columns:1fr auto;align-items:center;gap:36px;border:0;background:#1c1c1c;color:#fafafa;margin:0;padding:28px 48px 40px}
.footer-bottom .footer-wordmark{grid-row:2;grid-column:1/-1;display:block;font:600 clamp(48px,10.4vw,168px)/.88 'Circular Std',Arial,sans-serif;letter-spacing:-.065em;color:inherit;white-space:nowrap;overflow:visible;margin:20px 0 0}
.footer-meta{grid-row:1;grid-column:1;color:#bcbcbc;font-size:13px}
.footer-top-button{grid-row:1;grid-column:2;width:48px;height:48px;border:1px solid #666;border-radius:0;background:none;color:inherit;cursor:pointer;font-size:25px;transition:background .25s,color .25s}.footer-top-button:hover{background:#fafafa;color:#171717}
.story-controls{opacity:1;transform:none;pointer-events:auto}.story-btn{width:44px;height:44px;border:1px solid #ddd;box-shadow:none}
@media(min-width:821px){body:not(:has(.split-layout)) .post-article-header,body:not(:has(.split-layout)) .post-body{padding-left:max(40px,calc((100vw - 1120px)/2));padding-right:max(40px,calc((100vw - 1120px)/2))}}
@media(max-width:1180px){
html body:not(.landing-state):not(:has(.post-panel-viewer.active-state)) .hamburger-btn::before{background:#fafafa!important;border-color:#ddd}
html body:not(.landing-state):not(:has(.post-panel-viewer.active-state)) .hamburger-btn :is(.up-bar,.down-bar){background:#171717}
html body .scroll-down-btn{display:none!important}.hello-scene{min-height:0;padding:130px 24px 70px}.hello-content-box{width:100%;padding:0;margin:0}.hello-content-box h1{font-size:8.5vw}.hello-p{font-size:15px;line-height:1.6;margin:16px 0 0}
.post-panel:not(:has(.post-panel-viewer.active-state)){display:none!important}.post-panel:has(.post-panel-viewer.active-state){display:grid}
body:has(.post-panel-viewer.active-state) .post-viewer-toc-sidebar{display:none!important}
.post-list-content.main,.post-list-content.clone{min-height:170px;padding:38px 24px 38px 72px!important}.post-list-title{font-size:32px}.post-list-dot{width:40px;height:40px}
.panel-close-btn{left:24px!important;top:25px!important;width:48px;height:48px}
.post-viewer-header,.post-article-header{padding-top:118px;min-height:460px}
}
@media(max-width:600px){
html body .headerBtn-box .hamburger-btn,html body:has(.post-panel-viewer.active-state) .hamburger-btn{right:20px!important}
.archive-heading{padding:0 24px 24px}.archive-heading .section-title{font-size:20px}.archive-count{font-size:13px}
.post-list-content.main,.post-list-content.clone{min-height:162px;padding:32px 22px 32px 52px!important;gap:16px}.post-list-num{width:46px;font-size:15px}.post-list-dot{width:36px;height:36px}.post-list-title{font-size:28px;line-height:1.32}.post-list-category{display:block;font-size:13px}.post-list-date{display:none}
.post-title,.post-viewer-title,#panel-title{font-size:42px!important;line-height:1.16;letter-spacing:-.055em;margin-bottom:36px}
.post-article-header,body:has(.post-panel-viewer.active-state) .post-viewer-header{padding:112px 24px 60px;min-height:0}
.post-article-header::before,.post-viewer-header::before{font-size:12px;margin-bottom:28px}
.post-category,.post-viewer-category{font-size:13px}.post-date,.post-viewer-date,.post-reading-meta{font-size:13px}.post-reading-meta{margin-left:12px;padding-left:12px}
#panel-content,.post-body{font-size:18px!important}
.post-continuation{padding:40px 24px 48px}.post-continuation-label{font-size:36px;display:block;margin-bottom:32px}.post-continuation-label::after{display:block;font-size:12px;margin-top:16px}
.post-continuation-link{grid-template-columns:1fr;gap:32px}.post-continuation-copy{grid-column:1;grid-row:1;padding:0}.post-continuation-media{grid-column:1;grid-row:2;aspect-ratio:4/3}.post-continuation-meta{font-size:13px;margin-bottom:24px}.post-continuation-title{font-size:34px}.post-continuation-copy::after{font-size:15px;margin-top:24px}
.footer-main{grid-template-columns:1fr;min-height:0}.footer-main>div{padding:32px 24px 40px;border-right:0;border-bottom:1px solid #ccc}.footer .footer-statement,.post-page-footer .footer-statement{font-size:38px;margin-top:32px}.footer-nav{padding:28px 24px 36px}.footer-nav a{font-size:20px;min-height:60px}.footer-kicker,.footer-nav-label{font-size:13px}.footer-bottom{padding:24px 24px 32px;gap:20px}.footer-bottom .footer-wordmark{font-size:10.3vw;margin-top:10px}.footer-meta{font-size:12px}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
`;
writeFileSync('css/exhibition.css',css);
for(const file of ['index.html','post.html','preview.html']){let html=readFileSync(file,'utf8').replaceAll('v=exhibition-1','v=journal-2');writeFileSync(file,html);}
let footer=readFileSync('js/footerTheme.js','utf8').replace("label.textContent = 'One more thought.'","label.textContent = '다음으로 읽을 글'");
footer=footer.replace("footer.dataset.footerTone = tone.name;", "footer.dataset.footerTone = tone.name;\n        const wordmark = footer.querySelector('.footer-wordmark');\n        if (wordmark) wordmark.textContent = 'KIMSUNGWOO';");
writeFileSync('js/footerTheme.js',footer);
