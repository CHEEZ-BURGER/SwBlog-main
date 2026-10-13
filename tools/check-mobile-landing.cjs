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
                await page.goto(process.env.SWBLOG_URL || 'http://127.0.0.1:4173/');
                await page.locator('.strip-card').first().waitFor({state:'attached'});
                await page.waitForTimeout(2600);
            };
            await reset();
            const x = viewport.width*.35, y = viewport.height*.8;
            const pose = () => page.evaluate(()=>({
                progress: mobileProgress,
                active: !!shift.interactive,
                list: document.querySelector('.main-cont-back').getBoundingClientRect().top,
                fold: new DOMMatrix(getComputedStyle(document.querySelector('.strip-card-surface')).transform).m22
            }));
            const initial = await pose();
            await touch('touchStart',x,y);
            for(let i=1;i<=8;i++) {
                await touch('touchMove',x,y-viewport.height*.023*i);
                await page.waitForTimeout(35);
            }
            const held = await pose();
            assert.ok(held.active && held.progress > .1 && held.progress < .3);
            assert.ok(initial.list-held.list>(viewport.height>500?40:0), 'list follows the finger');
            assert.ok(held.fold < .9 && held.fold > .65, 'images fold with gesture distance');
            await touch('touchEnd');
            await page.waitForTimeout(1000);
            const released = await pose();
            assert.ok(Math.abs(released.progress-held.progress)<.001, 'release never snaps or finishes automatically');
            assert.ok(Math.abs(released.list-held.list)<1, 'release holds the page exactly');
            await page.setViewportSize({...viewport,height:viewport.height+20});
            await page.waitForTimeout(200);
            assert.ok(Math.abs((await pose()).progress-held.progress)<.001,'resize keeps the held progress');
            await page.setViewportSize(viewport);
            await page.waitForTimeout(200);
            await page.screenshot({path:path.join(os.tmpdir(),`swblog-linear-${viewport.width}.png`)});
            await page.mouse.wheel(0,viewport.height*.1);
            await page.waitForTimeout(150);
            const next = await pose();
            assert.ok(Math.abs(next.progress-released.progress-.1/.85)<.003, 'wheel distance maps linearly');
            await page.mouse.wheel(0,-viewport.height*.1);
            await page.waitForTimeout(150);
            assert.ok(Math.abs((await pose()).progress-released.progress)<.003, 'reverse retraces the same poses');
            await page.mouse.wheel(0,-viewport.height);
            await page.waitForTimeout(150);
            assert.equal((await pose()).active,false);
            assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('landing-state')));
            await touch('touchStart',x,y);
            await touch('touchMove',x+60,y+1);
            await touch('touchEnd');
            assert.equal((await pose()).active,false,'horizontal drag leaves the landing intact');
            await page.mouse.wheel(0,viewport.height);
            await page.waitForTimeout(200);
            assert.equal((await pose()).active,false);
            assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('landing-state')),false);
            assert.equal(await page.locator('.main-cont-back').evaluate(el=>el.style.transform),'');
            await page.mouse.wheel(0,300);
            await page.waitForTimeout(400);
            assert.ok(await page.evaluate(()=>window.scrollY)>50,'reading scroll remains native');
            await page.evaluate(()=>window.scrollTo(0,0));
            await page.waitForTimeout(500);
            await page.mouse.wheel(0,-viewport.height*.2);
            await page.waitForTimeout(150);
            assert.ok((await pose()).active && (await pose()).progress < .8,'return is also distance controlled');
            await page.mouse.wheel(0,-viewport.height);
            await page.waitForTimeout(150);
            assert.equal((await pose()).active,false);
            assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('landing-state')));
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
            assert.deepEqual(errors,[]);
            console.log('PASS:',viewport,'linear distance, hold on release, reverse, endpoints, native scroll');
            await context.close();
        }
        const reduced = await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
        const page = await reduced.newPage();
        await page.goto('http://127.0.0.1:4173/');
        await page.locator('.strip-card').first().waitFor({state:'attached'});
        const cdp = await reduced.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:700}]});
        for(let i=1;i<=8;i++) {
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:700-i*28}]});
            await page.waitForTimeout(25);
        }
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('landing-state')),false,'reduced motion enters the index once per gesture');
        await page.mouse.wheel(0,350);
        await page.waitForTimeout(600);
        assert.ok(await page.evaluate(()=>window.scrollY)>50,'native reading scroll resumes');
        await reduced.close();
        console.log('PASS: reduced motion and native reading scroll');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
