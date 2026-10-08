/* Blog and Gallery, the two section pages beside the index (blog.html, gallery.html). One script
   drives both; <body data-section> says which. The blog lists writing as a quiet text index, the
   gallery shows works as large pictures. Both offer a hashtag filter made of the tags that occur on
   that page, kept in the address as ?tag=디자인 so a filtered view can be linked. Posts come from
   js/siteData.js (newest first) and open in the index's reader in the same tab.

   Motion lives in css/sections.css; this script only says when: a row gets .is-in as it scrolls
   into view (rows arriving together are staggered), and a filter change first sends the rows on
   screen out upward, then draws the new list and lets it rise in. */
(function () {
    'use strict';

    const body = document.body;
    const SECTION = body.dataset.section === 'gallery' ? 'gallery' : 'blog';
    const COPY = {
        blog: { unit: '편', noun: '글', empty: '아직 올린 글이 없습니다.', failed: '글을 불러오지 못했습니다.' },
        gallery: { unit: '점', noun: '작업', empty: '아직 올린 작업이 없습니다.', failed: '작업을 불러오지 못했습니다.' }
    }[SECTION];
    const ALL = '전체';
    const EXPO = 'cubic-bezier(.19,1,.22,1)';
    const EXPO_IN = 'cubic-bezier(.7,0,.3,1)';
    const STAGGER = 90;     // ms between rows that arrive together
    const EXIT = 560;       // the longest exit in css/sections.css (the gallery frames)
    const EXIT_STEP = 40;   // ms between rows that leave together
    const SETTLE = 2300;    // after this a row has fully arrived and its entrance delay can go

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const list = document.querySelector('[data-list]');
    const listFrame = document.querySelector('[data-list-frame]');
    const tools = document.querySelector('[data-tools]');
    const filter = document.querySelector('[data-filter]');
    const indicator = filter.querySelector('.tag-indicator');
    const count = document.querySelector('[data-count]');
    const status = document.querySelector('[data-status]');
    const live = document.querySelector('[data-live]');

    let posts = [];          // this section's posts, newest first
    let sectionTags = [];    // the hashtags that occur among them, in the canonical order
    let activeTag = null;    // null shows everything
    let swapTimer = 0;
    let revealFrom = 0;      // the first rows wait for the title to have begun rising

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
    // One line of text in its mask. `lag` holds it back behind the first line of its row.
    const line = (html, lag = 0) => `<span class="line"${lag ? ` style="--l:${lag}ms"` : ''}><span>${html}</span></span>`;

    // The title starts rising once the type has loaded (or after a short wait), so it never
    // swaps font halfway up.
    let readyAt = 0;
    // Coming from another page it also waits until the page has mostly been uncovered
    // (js/pageTransition.js).
    const pageReady = Promise.all([document.fonts ? Promise.race([document.fonts.ready, wait(900)]) : null, window.SwblogArrival])
        .then(() => {
            readyAt = performance.now();
            body.classList.add('is-ready');
        });

    /* ------------------------------------------------------------------------------ Rows */

    function blogEntry(post) {
        // The date and reading time, then the hashtags as pills (css/tags.css).
        const meta = [post.date, `${post.minutes}분 읽기`].filter(Boolean).map(escapeHTML)
            .join('<span class="sep" aria-hidden="true">·</span>')
            + (post.tags.length ? window.SwblogTags.pillsHTML(post.tags) : '');
        const excerpt = post.excerpt ? `<p class="entry-excerpt">${line(escapeHTML(post.excerpt), 70)}</p>` : '';
        const thumb = post.image
            ? `<div class="entry-thumb"><img src="${escapeHTML(post.image)}" alt="" loading="lazy" decoding="async"></div>`
            : '';
        return `<li class="entry">
            <a class="entry-link" href="${escapeHTML(post.url)}">
                <span class="entry-num">${line(post.order)}</span>
                <div class="entry-body">
                    <h2 class="entry-title">${line(`<span class="entry-title-text">${escapeHTML(post.title || '제목 없음')}</span>`)}</h2>
                    ${excerpt}
                    <p class="entry-meta">${line(meta, 140)}</p>
                </div>
                ${thumb}
            </a>
        </li>`;
    }

    // A work without a picture shows its title as type in the same frame.
    const plate = title => `<p class="work-plate" aria-hidden="true">${escapeHTML(title)}</p>`;

    /* The gallery's rhythm comes from the pictures themselves. A picture wide in shape and in
       pixels runs across the page (never two in a row); the others go in pairs, a larger place
       beside a smaller one, every other pair mirrored, and in a pair the wider file takes the
       larger place so nothing small is blown up. Each frame keeps its picture's proportions
       within the limits of its place, so a work is cropped as little as possible. */
    const sizes = new Map(); // picture URL → { w, h }
    const SLOT_RATIO = { wide: [1.6, 2.4, 16 / 9], major: [1, 1.8, 4 / 3], minor: [0.75, 1.5, 4 / 5] };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const sizeOf = post => (post.image && sizes.get(post.image)) || null;
    const canSpan = post => {
        const size = sizeOf(post);
        return !!size && size.w / size.h >= 1.4 && size.w >= 1400;
    };

    // A picture's size is known as soon as the head of its file arrives; the rest of the
    // download carries on into the cache the frames then draw from. A gallery is small enough to
    // ask for every picture at once; any still unknown after a moment gets its place's default.
    function measure(url) {
        if (sizes.has(url)) return Promise.resolve();
        return new Promise(resolve => {
            const probe = new Image();
            const finish = () => {
                clearInterval(poll);
                probe.onload = probe.onerror = null;
                if (probe.naturalWidth) sizes.set(url, { w: probe.naturalWidth, h: probe.naturalHeight });
                resolve();
            };
            const poll = setInterval(() => { if (probe.naturalWidth) finish(); }, 40);
            probe.onload = probe.onerror = finish;
            probe.src = url;
        });
    }
    const measureAll = items => Promise.race([
        Promise.all(items.filter(post => post.image).map(post => measure(post.image))),
        wait(1500)
    ]);

    function planGallery(shown) {
        const plan = new Map(); // post → { slot, flipped }
        let pairs = 0;
        let spanAllowed = true;
        for (let i = 0; i < shown.length;) {
            if (spanAllowed && canSpan(shown[i])) {
                plan.set(shown[i], { slot: 'wide', flipped: false });
                spanAllowed = false;
                i += 1;
                continue;
            }
            const [a, b] = [shown[i], shown[i + 1]];
            const flipped = pairs % 2 === 1;
            const larger = b && (sizeOf(b)?.w || 0) > (sizeOf(a)?.w || 0) ? b : a;
            plan.set(a, { slot: a === larger ? 'major' : 'minor', flipped });
            if (b) plan.set(b, { slot: b === larger ? 'major' : 'minor', flipped });
            pairs += 1;
            spanAllowed = true;
            i += b ? 2 : 1;
        }
        return plan;
    }

    function galleryWork(post, { slot, flipped }, index) {
        const size = sizeOf(post);
        const [min, max, fallback] = SLOT_RATIO[slot];
        const ratio = size ? clamp(size.w / size.h, min, max) : fallback;
        // On a phone every work stands in one column, so it gets a gentler range of its own.
        const narrow = size ? clamp(size.w / size.h, 0.8, 1.6) : (slot === 'wide' ? 4 / 3 : 4 / 5);
        const title = post.title || '제목 없음';
        const picture = post.image
            ? `<div class="work-drift"><img src="${escapeHTML(post.image)}" alt="" loading="${index < 3 ? 'eager' : 'lazy'}" decoding="async"></div>`
            : plate(title);
        return `<li class="work work--${slot}${flipped ? ' is-flipped' : ''}" style="--ratio:${ratio.toFixed(4)};--ratio-narrow:${narrow.toFixed(4)}">
            <a class="work-link" href="${escapeHTML(post.url)}">
                <div class="work-frame">${picture}</div>
                <div class="work-caption">
                    <h2 class="work-title">${line(escapeHTML(title), 120)}</h2>
                    ${post.tags.length ? `<p class="work-tags">${line(window.SwblogTags.pillsHTML(post.tags), 190)}</p>` : ''}
                    <p class="work-date">${line(escapeHTML(post.date), 190)}</p>
                </div>
            </a>
        </li>`;
    }

    // Pictures fade in once they have loaded. One that fails gives way: a blog row drops its
    // thumbnail, a gallery frame shows the title instead. (Load and error do not bubble, so these
    // listen on the way down.)
    list.addEventListener('load', event => {
        if (event.target.tagName === 'IMG') event.target.classList.add('is-loaded');
    }, true);
    list.addEventListener('error', event => {
        const img = event.target;
        if (img.tagName !== 'IMG') return;
        const thumb = img.closest('.entry-thumb');
        if (thumb) { thumb.remove(); return; }
        const frame = img.closest('.work-frame');
        if (frame) frame.innerHTML = plate(frame.closest('.work').querySelector('.work-title').textContent.trim());
    }, true);

    /* ------------------------------------------------------------------------- Arriving */

    const revealer = 'IntersectionObserver' in window
        ? new IntersectionObserver(arrive, { rootMargin: '0px 0px -8% 0px' })
        : null;

    function arrive(entries) {
        const base = Math.max(0, revealFrom - performance.now());
        entries.filter(entry => entry.isIntersecting).map(entry => entry.target)
            .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
            .forEach((item, order) => {
                revealer.unobserve(item);
                show(item, base + order * STAGGER);
            });
    }

    function show(item, delay) {
        item.style.setProperty('--d', `${Math.round(delay)}ms`);
        item.classList.add('is-in');
        // Once it has arrived its delay goes, so hover and the exit answer at once.
        setTimeout(() => {
            item.style.removeProperty('--d');
            item.classList.add('is-settled');
        }, delay + SETTLE);
    }

    const shownPosts = () => (activeTag ? posts.filter(post => post.tags.includes(activeTag)) : posts);

    function renderList() {
        revealer?.disconnect();
        const shown = shownPosts();
        if (SECTION === 'gallery') {
            const plan = planGallery(shown);
            list.innerHTML = shown.map((post, i) => galleryWork(post, plan.get(post), i)).join('');
        } else {
            list.innerHTML = shown.map(blogEntry).join('');
        }
        list.querySelectorAll('img').forEach(img => {
            if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
        });
        const items = [...list.children];
        if (!revealer || reduceMotion.matches) {
            items.forEach(item => item.classList.add('is-in', 'is-settled'));
            return;
        }
        items.forEach(item => revealer.observe(item));
    }

    // A filter change: the rows on screen leave upward (a little apart), then the new list is
    // drawn and rises in, while the list's height eases to its new size instead of jumping.
    function swapList() {
        if (reduceMotion.matches || !list.children.length) { renderList(); return; }
        if (swapTimer) return; // already leaving; the swap will draw whatever is chosen by then
        const from = listFrame.offsetHeight;
        const onScreen = [...list.children].filter(item => {
            const box = item.getBoundingClientRect();
            return box.bottom > 0 && box.top < window.innerHeight;
        });
        onScreen.forEach((item, i) => item.style.setProperty('--x', `${Math.min(i, 6) * EXIT_STEP}ms`));
        list.classList.add('is-leaving');
        swapTimer = setTimeout(() => {
            swapTimer = 0;
            list.classList.remove('is-leaving');
            revealFrom = performance.now() + 60;
            renderList();
            const to = listFrame.offsetHeight;
            if (Math.abs(to - from) > 1) {
                listFrame.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 1000, easing: EXPO });
            }
        }, EXIT + Math.min(Math.max(onScreen.length - 1, 0), 6) * EXIT_STEP);
    }

    /* --------------------------------------------------------------------------- Filter */

    function renderFilter() {
        const tally = new Map();
        posts.forEach(post => post.tags.forEach(tag => tally.set(tag, (tally.get(tag) || 0) + 1)));
        sectionTags = (window.SwblogTags?.TAGS || [...tally.keys()]).filter(tag => tally.has(tag));
        filter.querySelectorAll('.tag-chip').forEach(chip => chip.remove());
        if (!sectionTags.length) { filter.hidden = true; return; }
        const chip = (tag, label, n) => `<button type="button" class="tag-chip" data-tag="${escapeHTML(tag)}"
            aria-pressed="false" aria-label="${escapeHTML(`${label}, ${n}${COPY.unit}`)}">${escapeHTML(label)}<span class="tag-chip-count">${n}</span></button>`;
        filter.insertAdjacentHTML('beforeend', [
            chip('', ALL, posts.length),
            ...sectionTags.map(tag => chip(tag, tag, tally.get(tag)))
        ].join(''));
        filter.hidden = false;
        if ('ResizeObserver' in window) {
            const keepPlaced = new ResizeObserver(() => placeIndicator(true));
            filter.querySelectorAll('.tag-chip').forEach(button => keepPlaced.observe(button));
        }
    }

    // The soft pill sits under the chosen chip and glides to the next one.
    function placeIndicator(instant) {
        const chip = filter.querySelector('.tag-chip[aria-pressed="true"]');
        if (!chip || filter.hidden) return;
        if (instant) indicator.style.transition = 'none';
        indicator.style.width = `${chip.offsetWidth}px`;
        indicator.style.height = `${chip.offsetHeight}px`;
        indicator.style.transform = `translate3d(${chip.offsetLeft}px,${chip.offsetTop}px,0)`;
        if (instant) {
            void indicator.offsetWidth; // commit the jump before the glide comes back
            indicator.style.transition = '';
        }
    }

    // The count rolls: the old figure leaves upward while the new one rises into the same mask.
    function setCount(n, animate) {
        const text = `${n}${COPY.unit}`;
        const current = count.lastElementChild;
        if (current && current.textContent === text) return;
        const next = document.createElement('span');
        next.textContent = text;
        if (!animate || !current || reduceMotion.matches) { count.replaceChildren(next); return; }
        count.append(next);
        const out = current.animate(
            [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,-110%,0)' }],
            { duration: 520, easing: EXPO_IN, fill: 'forwards' }
        );
        out.finished.then(() => current.remove(), () => current.remove());
        next.animate(
            [{ transform: 'translate3d(0,110%,0)' }, { transform: 'translate3d(0,0,0)' }],
            { duration: 1100, delay: 260, easing: EXPO, fill: 'backwards' }
        );
    }

    // ?tag= accepts 디자인, #디자인 or an old category name (DESIGN); anything not on this page is
    // dropped from the address.
    function readAddress() {
        const raw = new URLSearchParams(window.location.search).get('tag');
        if (!raw) return null;
        const tag = window.SwblogTags ? window.SwblogTags.parse(raw)[0] : raw.replace(/^#/, '');
        return sectionTags.includes(tag) ? tag : null;
    }

    function writeAddress(tag) {
        const url = new URL(window.location.href);
        if (tag) url.searchParams.set('tag', tag);
        else url.searchParams.delete('tag');
        if (url.href !== window.location.href) history.replaceState(history.state, '', url);
    }

    function choose(tag, animate) {
        activeTag = tag;
        filter.querySelectorAll('.tag-chip').forEach(chip => {
            chip.setAttribute('aria-pressed', String((chip.dataset.tag || null) === tag));
        });
        placeIndicator(!animate);
        writeAddress(tag);
        const n = shownPosts().length;
        setCount(n, animate);
        if (animate) {
            live.textContent = `${tag || ALL} ${COPY.noun} ${n}${COPY.unit}`;
            swapList();
        } else {
            renderList();
        }
    }

    filter.addEventListener('click', event => {
        const chip = event.target.closest('.tag-chip');
        if (!chip) return;
        const tag = chip.dataset.tag || null;
        if (tag !== activeTag) choose(tag, true);
    });

    /* ------------------------------------------------------------------------- Loading */

    function setStatus(kind) {
        status.className = 'section-status';
        status.textContent = '';
        if (!kind) return;
        if (kind === 'loading') {
            status.classList.add('is-loading');
            status.textContent = '불러오는 중';
            return;
        }
        status.textContent = kind === 'failed' ? COPY.failed : COPY.empty;
        if (kind === 'failed') {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'section-retry';
            retry.textContent = '다시 시도';
            retry.addEventListener('click', load);
            status.append(retry);
        }
    }

    async function load() {
        setStatus('loading');
        let all;
        try {
            if (!window.supabase || !window.SwblogData) throw new Error('The posts client did not load.');
            all = await window.SwblogData.fetchPosts();
        } catch (error) {
            console.warn('[sections] Posts could not be loaded.', error);
            await pageReady;
            setStatus('failed');
            return;
        }
        // Numbered within this page, newest first, as the index numbers its list.
        posts = all.filter(post => post.type === SECTION)
            .map((post, i) => ({ ...post, order: String(i + 1).padStart(2, '0') }));
        if (SECTION === 'gallery') await measureAll(posts);
        await pageReady;
        setStatus(posts.length ? null : 'empty');
        if (!posts.length) return;
        renderFilter();
        tools.classList.add('is-in');
        revealFrom = Math.max(readyAt + 320, performance.now() + 220);
        choose(readAddress(), false);
    }

    load();
}());
