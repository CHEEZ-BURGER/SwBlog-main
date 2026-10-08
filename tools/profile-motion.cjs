// Run against `npm run dev`. Requires Playwright (NODE_PATH may point to a bundled runtime).
// Browser timing is diagnostic evidence, not a guarantee of physical display refresh rate.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const label = process.argv[2] || 'current';
const out = process.env.SWBLOG_PERF_DIR || path.join(os.tmpdir(), 'swblog-motion-profile');
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] : 0;

async function profile(page, name, action) {
    const client = await page.context().newCDPSession(page);
    const events = [];
    client.on('Tracing.dataCollected', data => events.push(...data.value));
    await page.evaluate(() => {
        window.__motionProfile = { frames: new Map(), reads: 0, tasks: [] };
        window.__motionObserver = new PerformanceObserver(list => {
            window.__motionProfile.tasks.push(...list.getEntries().map(e => e.duration));
        });
        window.__motionObserver.observe({ type: 'longtask', buffered: false });
    });
    await client.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
    await action();
    const data = await page.evaluate(() => {
        window.__motionObserver.disconnect();
        const data = window.__motionProfile;
        window.__motionProfile = null;
        const stamps = [...data.frames.keys()];
        return { costs: [...data.frames.values()], intervals: stamps.slice(1).map((t, i) => t - stamps[i]), reads: data.reads, tasks: data.tasks };
    });
    const ended = new Promise(resolve => client.once('Tracing.tracingComplete', resolve));
    await client.send('Tracing.end');
    await ended;
    const total = name => events.filter(e => e.name === name && e.ph === 'X').reduce((sum, e) => sum + (e.dur || 0) / 1000, 0);
    const result = {
        name, frames: data.costs.length, frameIntervalP95Ms: percentile(data.intervals, .95), callbackP95Ms: percentile(data.costs, .95), callbackMaxMs: Math.max(0, ...data.costs),
        callbackOver8ms: data.costs.filter(n => n > 1000 / 120).length,
        geometryReads: data.reads, longTasks: data.tasks.length, longestTaskMs: Math.max(0, ...data.tasks),
        layoutMs: total('Layout'), styleMs: total('UpdateLayoutTree'), paintMs: total('Paint'),
        layoutCount: events.filter(e => e.name === 'Layout' && e.ph === 'X').length,
        styleCount: events.filter(e => e.name === 'UpdateLayoutTree' && e.ph === 'X').length
    };
    await fs.writeFile(path.join(out, `${label}-${name}-trace.json`), JSON.stringify({ traceEvents: events }));
    console.log(JSON.stringify(result));
    await client.detach();
    return result;
}

async function scroll(page, selector, duration = 5000) {
    await page.evaluate(({ selector, duration }) => new Promise(resolve => {
        const el = document.querySelector(selector);
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        const distance = Math.min(max, 6500);
        let start;
        function step(now) {
            start ??= now;
            const progress = Math.min(1, (now - start) / duration);
            el.scrollTop = distance * progress;
            if (progress < 1) requestAnimationFrame(step); else resolve();
        }
        requestAnimationFrame(step);
    }), { selector, duration });
}

(async () => {
    await fs.mkdir(out, { recursive: true });
    const browser = await chromium.launch({ channel: process.env.SWBLOG_BROWSER || 'msedge', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
        await context.addInitScript(() => {
            const nativeRAF = window.requestAnimationFrame.bind(window);
            window.requestAnimationFrame = callback => nativeRAF(timestamp => {
                const data = window.__motionProfile;
                if (!data) return callback(timestamp);
                const start = performance.now();
                try { callback(timestamp); } finally {
                    data.frames.set(timestamp, (data.frames.get(timestamp) || 0) + performance.now() - start);
                }
            });
            const rect = Element.prototype.getBoundingClientRect;
            Element.prototype.getBoundingClientRect = function () {
                if (window.__motionProfile) window.__motionProfile.reads++;
                return rect.call(this);
            };
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
        await page.waitForSelector('.post-list-item', { state: 'attached' });
        await page.waitForTimeout(3000);
        const posts = await page.evaluate(() => allPosts);
        // Reuse exactly the same public post data across measurements.
        const fixture = path.join(out, 'posts.json');
        let saved;
        try { saved = JSON.parse(await fs.readFile(fixture, 'utf8')); } catch { saved = posts; await fs.writeFile(fixture, JSON.stringify(posts)); }
        await context.route('**/rest/v1/posts?*', route => {
            const id = new URL(route.request().url()).searchParams.get('id');
            const data = id ? saved.filter(post => String(post.id) === id.replace(/^eq\./, '')) : saved;
            return route.fulfill({ json: id && route.request().headers().accept?.includes('object') ? data[0] : data });
        });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('.post-list-item', { state: 'attached' });
        await page.waitForTimeout(3000);
        const results = [];
        results.push(await profile(page, 'landing', () => page.waitForTimeout(3000)));
        results.push(await profile(page, 'transition', async () => {
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(1800);
        }));
        results.push(await profile(page, 'index-scroll', () => scroll(page, '.index-panel')));
        await page.screenshot({ path: path.join(out, `${label}-index.png`) });
        const longest = saved.filter(post => windowlessKind(post) !== 'gallery').sort((a, b) => (b.content || '').length - (a.content || '').length)[0];
        console.log(JSON.stringify({ post: longest.id, title: longest.title }));
        results.push(await profile(page, 'reader-open', async () => {
            await page.evaluate(id => openPanelPost(id, null, 'push'), longest.id);
            await page.waitForFunction(() => document.getElementById('panel-content').textContent.trim().length > 100);
            await page.waitForTimeout(2400);
        }));
        await page.screenshot({ path: path.join(out, `${label}-reader.png`) });
        results.push(await profile(page, 'reader-scroll', () => scroll(page, '#post-panel', 6000)));
        await page.goto('http://127.0.0.1:4173/playground.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3500);
        results.push(await profile(page, 'playground', async () => {
            for (let i = 0; i < 10; i++) {
                await page.mouse.wheel(180, 260);
                await page.waitForTimeout(120);
            }
            await page.waitForTimeout(2200);
        }));
        await fs.writeFile(path.join(out, `${label}.json`), JSON.stringify({ browser: browser.version(), viewport: [1440, 900], results, errors }, null, 2));
        console.log(JSON.stringify({ errors, artifacts: out }));
        if (errors.length) process.exitCode = 1;
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

function windowlessKind(post) {
    return /swblog:type\s+gallery/.test(post.content || '') || post.post_type === 'gallery' || post.category === 'gallery' ? 'gallery' : 'blog';
}
