const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const image = '<img class="hidden-thumbnail" src="./mainPage_img/cat_b.png">';
    const posts = [
        { id: 901, title: '잠긴 기존 글', category: '개발', content: image + '<p>LOCKED_BODY_SENTINEL</p>', created_at: '2026-10-10T00:00:00Z' },
        { id: 902, title: '허용한 글', category: '개발', content: '<!--swblog:public-->' + image + '<p>ALLOWED_BODY_SENTINEL</p>', created_at: '2026-10-09T00:00:00Z' },
        { id: 903, title: '잠긴 갤러리', category: '디자인', content: '<!--swblog:type gallery-->' + image + '<p>GALLERY_BODY_SENTINEL</p>', created_at: '2026-10-08T00:00:00Z' }
    ];
    try {
        for (const width of [375, 1440]) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
            await context.route('**/rest/v1/posts?*', route => {
                const id = new URL(route.request().url()).searchParams.get('id');
                const selected = id?.startsWith('eq.') ? posts.find(p => String(p.id) === id.slice(3)) : null;
                return route.fulfill({ json: selected || posts });
            });
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            const errors = [];
            page.on('pageerror', e => errors.push(e.stack));
            for (const [url, selector] of [['/blog.html', '.entry-link'], ['/gallery.html', '.work-link']]) {
                await page.goto('http://127.0.0.1:4173' + url);
                const locked = page.locator(selector + '[data-locked-post]').first();
                await locked.waitFor();
                assert.match(await locked.textContent(), /잠긴/);
                assert.match(await locked.locator('img').first().evaluate(el => getComputedStyle(el).filter), /blur/);
                await locked.click();
                assert.equal(await page.locator('.post-preparing-dialog').evaluate(el => el.open), true);
                assert.match(await page.locator('.post-preparing-dialog').textContent(), /준비 중인 글입니다/);
                await page.locator('.post-preparing-dialog button').click();
                await locked.focus();
                await page.keyboard.press('Enter');
                assert.equal(await page.locator('.post-preparing-dialog').evaluate(el => el.open), true);
                await page.keyboard.press('Escape');
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
            }
            for (const url of ['/?post=901', '/post.html?id=901']) {
                await page.goto('http://127.0.0.1:4173' + url);
                await page.getByText('준비 중인 글입니다.', { exact: true }).waitFor();
                assert.equal(await page.locator('body').getByText('LOCKED_BODY_SENTINEL', { exact: true }).count(), 0);
            }
            await page.goto('http://127.0.0.1:4173/?post=902');
            await page.getByText('ALLOWED_BODY_SENTINEL', { exact: true }).waitFor();
            await page.goto('http://127.0.0.1:4173/');
            const row = page.locator('.post-list-item[data-post-id="901"]');
            await row.waitFor({ state: 'attached' });
            assert.equal(await row.getAttribute('data-locked-post'), '');
            assert.equal(await row.getAttribute('data-preview-img'), null);
            assert.match(await row.locator('img').first().evaluate(el => getComputedStyle(el).filter), /blur/);
            const landingLocked = page.locator('.strip-card[data-locked-post]').first();
            await landingLocked.waitFor({state:'attached'});
            assert.match(await landingLocked.locator('img').evaluate(el => getComputedStyle(el).filter), /blur/);
            await landingLocked.evaluate(el => el.click());
            assert.equal(await page.locator('.post-preparing-dialog').evaluate(el => el.open), true);
            await page.locator('.post-preparing-dialog button').click();
            // Invoke the actual list anchor from the landing state.
            await row.evaluate(el => el.click());
            assert.equal(await page.locator('.post-preparing-dialog').evaluate(el => el.open), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `swblog-locked-${width}.png`) });
            assert.deepEqual(errors, []);
            console.log(`PASS: ${width}px lists, blurred thumbnails, mouse/keyboard notice, direct URLs, allowed reader.`);
            await context.close();
        }
        const editorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await editorContext.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => route.fulfill({ contentType: 'text/javascript', body: `
            window.testPosts = ${JSON.stringify(posts)};
            window.testWrites = [];
            window.supabase = { createClient: () => ({
                auth: { getSession: async () => ({data:{session:{user:{id:'test'}}}}) },
                from: () => {
                    let id, payload, inserting = false;
                    const result = () => {
                        const post = window.testPosts.find(p => String(p.id) === String(id));
                        if (payload) {
                            window.testWrites.push(payload);
                            if (post) Object.assign(post, payload);
                        }
                        return {data: inserting ? null : id ? post : window.testPosts, error:null};
                    };
                    const query = {
                        select: () => query, order: () => query,
                        eq: (key,value) => { id=value; return query; },
                        update: value => { payload=value; return query; },
                        insert: value => { payload=value[0]; inserting=true; return query; },
                        single: async () => result(),
                        then: resolve => Promise.resolve(result()).then(resolve)
                    };
                    return query;
                }
            }) };
        ` }));
        const editorPage = await editorContext.newPage();
        const editorErrors = [];
        editorPage.on('pageerror', e => editorErrors.push(e.message));
        await editorPage.goto('http://127.0.0.1:4173/editor.html');
        await editorPage.locator('#tab-manage').click();
        const toggle = editorPage.locator('tr[data-index="0"] .visibility-toggle');
        await toggle.waitFor();
        assert.match(await toggle.textContent(), /잠김/);
        await toggle.click();
        await editorPage.waitForFunction(() => window.testPosts[0].content.includes('<!--swblog:public-->'));
        assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
        await toggle.click();
        await editorPage.waitForFunction(() => window.testPosts[0].content.includes('<!--swblog:private-->'));
        // Restore a stale locked draft of an allowed post; saving must preserve DB permission.
        await editorPage.evaluate(async () => {
            restoreDraft({id:902,locked:true,title:'허용한 글 수정',content:'<p>수정된 본문</p>',category:'개발'});
            await uploadPost();
        });
        assert.match(await editorPage.evaluate(() => window.testPosts[1].content), /<!--swblog:public-->/);
        assert.deepEqual(editorErrors, []);
        await editorPage.close();
        const newPostPage = await editorContext.newPage();
        await newPostPage.goto('http://127.0.0.1:4173/editor.html');
        await newPostPage.evaluate(async () => {
            restoreDraft({title:'새 글',content:'<p>새 본문</p>',category:'개발',locked:false});
            await uploadPost();
        });
        assert.match(await newPostPage.evaluate(() => window.testWrites[0].content), /<!--swblog:private-->/);
        await editorContext.close();
        console.log('PASS: editor allow/relock, stale draft permission preservation, new posts locked.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
