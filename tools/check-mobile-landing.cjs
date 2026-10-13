const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const viewport of [{width:375,height:812},{width:844,height:390}]) {
            const context = await browser.newContext({viewport,hasTouch:true,isMobile:true});
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            const cdp = await context.newCDPSession(page);
            const touch = (type,x,y) => cdp.send('Input.dispatchTouchEvent', {type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
            const reset = async () => {
                await page.goto('http://127.0.0.1:4173/');
                await page.locator('.strip-card').first().waitFor({state:'attached'});
                await page.waitForTimeout(2600);
            };
            await reset();
            const x = viewport.width*.35, y = viewport.height*.8;
            const initial = await page.locator('.main-cont-back').evaluate(el=>el.getBoundingClientRect().top);
            await touch('touchStart',x,y);
            for(let i=1;i<=8;i++) {
                await touch('touchMove',x,y-viewport.height*.023*i);
                await page.waitForTimeout(35);
            }
            const progress = await page.evaluate(()=>({
                list:document.querySelector('.main-cont-back').getBoundingClientRect().top,
                rail:new DOMMatrix(getComputedStyle(document.querySelector('.rail-scene')).transform).m42,
                title:new DOMMatrix(getComputedStyle(document.querySelector('.hello-content-box h1')).transform).m42,
                landing:document.body.classList.contains('landing-state')
            }));
            assert.ok(progress.landing, 'the scene follows the held finger before committing');
            assert.ok(initial-progress.list>40, 'the next list visibly rises during the gesture');
            assert.ok(progress.rail < -40 && progress.title < -40, 'pictures and title move upward together');
            await page.screenshot({path:path.join(os.tmpdir(),`swblog-mobile-pull-${viewport.width}.png`)});
            await touch('touchEnd');
            await page.waitForFunction(()=>!document.body.classList.contains('landing-state')&&!window.isLayoutTransitioning);
            assert.equal(await page.locator('.main-cont-back').evaluate(el=>el.style.transform),'');
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
            await page.screenshot({path:path.join(os.tmpdir(),`swblog-mobile-index-${viewport.width}.png`)});
            await reset();
            await touch('touchStart',x,y);
            for(let i=1;i<=4;i++) {await touch('touchMove',x,y-i*5);await page.waitForTimeout(60);}
            await touch('touchEnd');
            await page.waitForTimeout(1800);
            assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('landing-state')),true,'small pulls cancel');
            assert.equal(await page.locator('.main-cont-back').evaluate(el=>el.style.transform),'');
            await touch('touchStart',x,y);
            await touch('touchMove',x+60,y+1);
            await touch('touchEnd');
            assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('landing-state')),true,'horizontal input stays on landing');
            assert.deepEqual(errors,[]);
            console.log('PASS:',viewport,progress,'follow, release, cancellation, horizontal input, cleanup');
            await context.close();
        }
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
