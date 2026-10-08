const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

(async () => {
    const posts = JSON.parse(await fs.readFile(path.join(process.env.SWBLOG_PERF_DIR || path.join(os.tmpdir(), 'swblog-motion-profile'), 'posts.json'), 'utf8'));
    // Existing slider posts are galleries on the index. Exercise the blog slider branch with
    // the same content in a local response fixture; nothing is written to the live database.
    const sliderFixture = { ...posts.find(post => /story-slider/.test(post.content)), id: 9001 };
    sliderFixture.content = '<!--swblog:type blog-->\n' + sliderFixture.content.replace(/<!--\s*swblog:type\s+(gallery|blog)\s*-->/g, '');
    const browser = await chromium.launch({ channel: process.env.SWBLOG_BROWSER || 'msedge', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.route('**/rest/v1/posts?*', route => {
            const id = new URL(route.request().url()).searchParams.get('id');
            const data = id ? [...posts, sliderFixture].filter(post => String(post.id) === id.replace(/^eq\./, '')) : posts;
            return route.fulfill({ json: id && route.request().headers().accept?.includes('object') ? data[0] : data });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
        await page.waitForSelector('.post-list-item', { state: 'attached' });
        await page.waitForTimeout(2500);
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(() => !document.body.classList.contains('landing-state') && !document.body.classList.contains('landing-transition-active'));
        await page.waitForTimeout(200);
        await page.mouse.move(300, 600);
        await page.mouse.wheel(0, 360);await page.waitForTimeout(1200);
        const wheelTravel = await page.evaluate(() => document.querySelector('.index-panel').scrollTop);
        assert.ok(wheelTravel > 300 && wheelTravel <= 362, `real wheel input glides without overshoot (${wheelTravel}px)`);
        await page.mouse.wheel(0, 12);await page.waitForTimeout(150);
        assert.ok(await page.evaluate(() => document.querySelector('.index-panel').scrollTop) > wheelTravel, 'small input remains native');
        console.log('PASS: real wheel input and small native deltas.');

        const open = async id => {
            await page.evaluate(id => openPanelPost(id, null, 'push'), id);
            await page.waitForFunction(() => document.getElementById('post-panel-viewer').classList.contains('active-state'));
            await page.waitForFunction(() => !document.body.classList.contains('content-pointer-locked'));
            await page.waitForTimeout(1000);
            assert.equal(await page.evaluate(() => {
                const viewer = document.getElementById('post-panel-viewer');
                return viewer.classList.contains('active-state') && [...(function* () { for (let el = viewer.parentElement; el; el = el.parentElement) yield el; })()].every(el => el.classList.contains('reader-open'));
            }), true, 'reader state and selector cache agree');
        };
        await open(19);
        await page.mouse.move(1100, 600);await page.mouse.wheel(0, 720);await page.waitForTimeout(1000);
        assert.ok(await page.evaluate(() => document.getElementById('post-panel').scrollTop) > 600);
        assert.equal(await page.locator('.rl-m .rl-m').count(), 0, 'words are never wrapped twice');
        await page.locator('.panel-close-btn').click();
        await page.waitForFunction(() => !document.getElementById('post-panel-viewer').classList.contains('active-state'));
        assert.equal(await page.locator('.reader-open').count(), 0, 'all cached reader states clear on close');
        await page.waitForTimeout(1100);
        await open(19);
        await page.locator('.panel-close-btn').click();await page.waitForTimeout(1400);
        console.log('PASS: normal-motion reader scroll, close and cached reopen, no duplicate masks.');

        for (const url of ['http://127.0.0.1:4173/?post=9001', 'http://127.0.0.1:4173/post.html?id=15']) {
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForSelector('.story-slider');
            if (url.includes('?post=')) await page.waitForFunction(() => !document.body.classList.contains('content-pointer-locked'));
            const slider = page.locator('.story-slider').first();
            await slider.scrollIntoViewIfNeeded();await page.mouse.move(1, 1);await page.waitForTimeout(700);
            const progress = () => slider.locator('.story-segment.active .story-segment-fill').evaluate(el => el.style.transform || el.style.width);
            const first = await progress();await page.waitForTimeout(300);
            assert.notEqual(await progress(), first, 'visible slider progresses');
            await page.evaluate(() => openFullscreen(document.querySelector('.story-img').src));await page.waitForTimeout(100);
            const paused = await progress();await page.waitForTimeout(350);
            assert.equal(await progress(), paused, 'zoom pauses autoplay');
            await page.evaluate(() => closeFullscreen());await page.mouse.move(1, 1);await page.waitForTimeout(100);
            const resumed = await progress();await page.waitForTimeout(300);
            assert.notEqual(await progress(), resumed, 'zoom close resumes autoplay');
            await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true });document.dispatchEvent(new Event('visibilitychange')); });
            const hidden = await progress();await page.waitForTimeout(300);
            assert.equal(await progress(), hidden, 'hidden-tab lifecycle stops updates');
            await page.evaluate(() => { delete document.hidden;document.dispatchEvent(new Event('visibilitychange')); });
            await page.waitForTimeout(100);
            const visible = await progress();await page.waitForTimeout(300);
            assert.notEqual(await progress(), visible, 'visibility restoration resumes updates');
            console.log(`PASS: slider playback, zoom pause/resume and visibility lifecycle (${new URL(url).pathname}).`);
        }
        await page.goto('http://127.0.0.1:4173/playground.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3500);
        await page.mouse.move(800, 500);await page.mouse.wheel(180, 240);await page.waitForTimeout(1200);
        await page.locator('.pg-views [data-view="list"]').click();
        assert.equal(await page.locator('#playground').getAttribute('data-view'), 'list');
        await page.locator('.pg-views [data-view="field"]').click();
        assert.equal(await page.locator('#playground').getAttribute('data-view'), 'field');
        assert.deepEqual(errors, []);
        console.log('PASS: playground wheel and view switching; no uncaught browser errors.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
