// Compare the current site with a Git revision using identical post data and viewport sizes.
// Requires Playwright and sharp. Start the preview server before running this check.
const { chromium } = require('playwright');
const sharp = require('sharp');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const reference = process.env.SWBLOG_REFERENCE || 'HEAD';
const out = process.env.SWBLOG_PERF_DIR || path.join(os.tmpdir(), 'swblog-motion-profile');
const normalReader = process.argv.includes('--normal-reader');

(async () => {
    const posts = JSON.parse(await fs.readFile(path.join(out, 'posts.json'), 'utf8'));
    const originals = new Map(execFileSync('git', ['ls-tree', '-r', '--name-only', reference], { encoding: 'utf8' }).trim().split('\n')
        .filter(file => /\.(html|js|css)$/.test(file)).map(file => [file, execFileSync('git', ['show', `${reference}:${file}`], { encoding: 'utf8', maxBuffer: 8e6 })]));
    // Only execution code and selectors may change; the markup is byte-identical.
    for (const file of ['index.html', 'post.html']) {
        const stripScripts = html => html.replace(/\r\n/g, '\n').replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
        assert.equal(stripScripts(await fs.readFile(file, 'utf8')), stripScripts(originals.get(file)), `${file}: visible markup unchanged`);
    }
    for (const [file, original] of originals) {
        if (!file.endsWith('.css')) continue;
        const current = await fs.readFile(file, 'utf8');
        // Equivalent transforms let settled words release their compositor layers.
        const normalize = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replaceAll(':is(.reader-open.reader-open)', ':has(.post-panel-viewer.active-state)')
            .replace('.rl-i{display:inline-block;transform:translateY(108%)', '.rl-i{display:inline-block;transform:translate3d(0,108%,0)')
            .replace('.rl-in.rl-offscreen .rl-i{transform:translateY(0);transition:none}', '').replace(/\s+/g, '');
        assert.equal(normalize(current), normalize(original), `${file}: design declarations unchanged`);
    }
    const browser = await chromium.launch({ channel: process.env.SWBLOG_BROWSER || 'msedge', headless: true });
    const results = [];
    try {
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
            if (normalReader && viewport.width !== 1440) continue;
            const contexts = [];
            const pages = [];
            for (const baseline of [true, false]) {
                const context = await browser.newContext({ viewport, reducedMotion: normalReader ? 'no-preference' : 'reduce' });
                contexts.push(context);
                await context.addInitScript(() => { let seed = 1; Math.random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646; });
                await context.route('**/rest/v1/posts?*', route => {
                    const id = new URL(route.request().url()).searchParams.get('id');
                    const data = id ? posts.filter(post => String(post.id) === id.replace(/^eq\./, '')) : posts;
                    return route.fulfill({ json: id && route.request().headers().accept?.includes('object') ? data[0] : data });
                });
                if (baseline) await context.route('http://127.0.0.1:4173/**', route => {
                    const file = new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html';
                    const body = originals.get(file);
                    return body === undefined ? route.continue() : route.fulfill({ body, contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' });
                });
                const page = await context.newPage();
                page.on('pageerror', error => { throw error; });
                pages.push(page);
                await page.goto('http://127.0.0.1:4173' + (normalReader ? '/?post=19' : ''), { waitUntil: 'networkidle' });
                await page.waitForSelector('.post-list-item', { state: 'attached' });
                await page.evaluate(() => document.fonts.ready);
                await page.waitForTimeout(500);
            }
            async function compare(name) {
                const buffers = [];
                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: no horizontal overflow`);
                    const buffer = await page.screenshot({ path: path.join(out, `visual-${viewport.width}x${viewport.height}-${name}-${i ? 'current' : 'original'}.png`) });
                    buffers.push(await sharp(buffer).ensureAlpha().raw().toBuffer());
                }
                let changed = 0, max = 0;
                for (let i = 0; i < buffers[0].length; i += 4) {
                    const difference = Math.max(...[0, 1, 2].map(c => Math.abs(buffers[0][i + c] - buffers[1][i + c])));
                    if (difference > 8) changed++;
                    max = Math.max(max, difference);
                }
                const result = { viewport, name, changedPixels: changed, changedPercent: 100 * changed / (buffers[0].length / 4), maxChannelDifference: max };
                results.push(result);console.log(JSON.stringify(result));
                assert.ok(result.changedPercent < .15, `${name}: visual comparison exceeds tolerance`);
            }
            if (normalReader) {
                for (const page of pages) {
                    await page.waitForFunction(() => document.getElementById('post-panel-viewer').classList.contains('active-state') && !document.body.classList.contains('content-pointer-locked'));
                    await page.waitForTimeout(2000);
                }
                await compare('reader-normal');
                for (const page of pages) {
                    await page.evaluate(() => { document.getElementById('post-panel').scrollTop = 1300; });
                    await page.waitForTimeout(2200);
                }
                await compare('reader-scrolled-normal');
                const contents = await Promise.all(pages.map(page => page.evaluate(() => document.getElementById('panel-content').textContent)));
                assert.equal(contents[0], contents[1], 'sanitized article content is unchanged');
                for (const context of contexts) await context.close();
                continue;
            }
            await compare('landing');
            for (const page of pages) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(350); }
            await compare('index');
            for (const page of pages) {
                await page.evaluate(() => {
                    const scroller = innerWidth <= 1180 ? document.scrollingElement : document.querySelector('.index-panel');
                    scroller.scrollTo({ top: 900, behavior: 'instant' });
                });
                await page.waitForTimeout(300);
            }
            await compare('index-scrolled');
            for (const page of pages) {
                await page.evaluate(() => openPanelPost(19, null, 'push'));
                await page.waitForSelector('#panel-content .post-editorial-section');
                await page.waitForTimeout(1000);
            }
            await compare('reader');
            for (const page of pages) {
                await page.evaluate(() => { document.getElementById('post-panel').scrollTop = 1300; });
                await page.waitForTimeout(250);
            }
            await compare('reader-scrolled');
            for (const page of pages) {
                await page.evaluate(() => closePanelPost());
                await page.waitForTimeout(350);
            }
            await compare('closed');
            for (const context of contexts) await context.close();
        }
        // Smoke-test the other public entrypoints with actual post data.
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const file of ['blog.html', 'gallery.html', 'playground.html', 'info.html', 'post.html?id=19', 'preview.html']) {
            await page.goto(`http://127.0.0.1:4173/${file}`, { waitUntil: 'networkidle' });
            await page.waitForTimeout(350);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${file}: no horizontal overflow`);
        }
        assert.deepEqual(errors, [], 'public pages have no uncaught errors');
        await fs.writeFile(path.join(out, 'visual-check.json'), JSON.stringify(results, null, 2));
        console.log('PASS: identical markup/design rules, desktop/mobile visual comparisons, reader reopen/close, public page smoke checks.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
