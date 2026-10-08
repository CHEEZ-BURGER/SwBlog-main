/* Info page (info.html). Lets text rise into view line by line as it arrives, fills the live
   counts from the posts table (js/siteData.js) and runs the contact block's copy button.

   Every [data-reveal] block is revealed once, when it scrolls in (the first screen when the
   fonts are ready). On reveal its [data-lines] paragraphs are cut into their lines, each line is
   put in a mask (.ln > .ln-in), and the lines rise one after another; afterwards the paragraphs
   are joined again so they reflow freely. Blocks may sit inside one another: each reveals only
   its own lines. */
(function () {
    'use strict';

    // The address the contact block offers. Empty until the owner sets one: the block then reads
    // "이메일 주소 — 준비 중" and the copy button stays disabled. Example: 'name@domain.com'.
    const EMAIL = '';

    // The longest rise and the step between lines in css/infoPage.css (--rise, --step, and the
    // name's own duration); paragraphs are joined again once the last line has settled.
    const RISE = 1700;
    const STEP = 90;

    const root = document.documentElement;
    window.clearTimeout(window.__infoFallback);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animated = root.classList.contains('info-js') && !root.classList.contains('info-static') && !reduced;
    if (!animated) root.classList.remove('info-js');

    // A line or paragraph belongs to the nearest block around it.
    const ownedBy = (element, group) => element.closest('[data-reveal]') === group;

    // ----- Lines -----

    // Cuts a paragraph of plain text into the lines it currently wraps to, each in a mask.
    function split(element) {
        if (element.classList.contains('is-split')) return;
        if (element.dataset.text == null) element.dataset.text = element.textContent.trim().replace(/\s+/g, ' ');
        const words = element.dataset.text.split(' ');
        element.textContent = '';
        const spans = words.map((word, index) => {
            const span = document.createElement('span');
            span.textContent = word;
            element.append(span);
            if (index < words.length - 1) element.append(' ');
            return span;
        });
        const lines = [];
        let top = null;
        for (const span of spans) {
            const y = span.offsetTop;
            if (top === null || Math.abs(y - top) > 3) {
                lines.push([]);
                top = y;
            }
            lines[lines.length - 1].push(span.textContent);
        }
        element.textContent = '';
        for (const line of lines) {
            const mask = document.createElement('span');
            const inner = document.createElement('span');
            mask.className = 'ln';
            inner.className = 'ln-in';
            inner.textContent = line.join(' ');
            mask.append(inner);
            element.append(mask);
        }
        element.classList.add('is-split');
    }

    function join(element) {
        if (!element.classList.contains('is-split')) return;
        element.textContent = element.dataset.text;
        element.classList.remove('is-split');
        element.classList.add('is-done');
    }

    function reveal(group) {
        if (group.classList.contains('is-in')) return;
        const paragraphs = [...group.querySelectorAll('[data-lines]')].filter(element => ownedBy(element, group));
        if (!animated) {
            group.classList.add('is-in');
            return;
        }
        paragraphs.forEach(split);
        const lines = [...group.querySelectorAll('.ln')]
            .filter(line => ownedBy(line, group) && !line.classList.contains('ln-wait'));
        lines.forEach((line, index) => line.style.setProperty('--i', index));
        void group.offsetWidth;
        group.classList.add('is-in');
        lines.forEach(line => line.classList.add('is-in'));
        if (!paragraphs.length) return;
        // Join the paragraphs once their lines have actually settled (a hidden tab holds the
        // motion back, so a plain timer could cut it short); the timer is only a fallback.
        const settle = () => paragraphs.forEach(join);
        const rising = paragraphs
            .flatMap(paragraph => [...paragraph.querySelectorAll('.ln-in')])
            .flatMap(inner => (inner.getAnimations ? inner.getAnimations() : []));
        if (rising.length) Promise.allSettled(rising.map(animation => animation.finished)).then(settle);
        else window.setTimeout(settle, RISE + STEP * lines.length + 900);
    }

    // A line whose text arrives later (a count): it rises on its own once its block is in.
    function fillLine(inner, text) {
        const line = inner.closest('.ln');
        inner.textContent = text;
        if (!line || !line.classList.contains('ln-wait')) return;
        line.classList.remove('ln-wait');
        const group = line.closest('[data-reveal]');
        if (!animated || !group?.classList.contains('is-in')) return;
        line.style.setProperty('--i', 0);
        line.style.setProperty('--d', '0ms');
        void line.offsetWidth;
        line.classList.add('is-in');
    }

    // ----- Reveal on arrival -----

    const observer = 'IntersectionObserver' in window
        ? new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                observer.unobserve(entry.target);
                reveal(entry.target);
            }
        }, { rootMargin: '0px 0px -8% 0px' })
        : null;

    function watch(group) {
        if (observer && animated) observer.observe(group);
        else reveal(group);
    }

    // The fonts decide where the lines break, so nothing is cut before they are in (or a moment
    // has passed).
    function fontsReady() {
        if (!document.fonts) return Promise.resolve();
        const loads = Promise.all([
            document.fonts.load('700 100px "Circular Std"'),
            document.fonts.load('400 20px "Pretendard Variable"')
        ]).then(() => document.fonts.ready).catch(() => {});
        return Promise.race([loads, new Promise(resolve => window.setTimeout(resolve, 1600))]);
    }

    // Coming from another page, the first lines wait until the page has mostly been uncovered
    // (js/pageTransition.js), so they rise where they can be seen.
    Promise.all([fontsReady(), window.SwblogArrival]).then(() => {
        document.querySelectorAll('[data-reveal="load"]').forEach(reveal);
        document.querySelectorAll('[data-reveal]:not([data-reveal="load"]):not([hidden])').forEach(watch);
    });

    // ----- Live counts -----

    function fill(posts) {
        const counts = { all: posts.length, blog: 0, gallery: 0 };
        const tags = {};
        for (const post of posts) {
            counts[post.type] = (counts[post.type] || 0) + 1;
            for (const tag of post.tags || []) tags[tag] = (tags[tag] || 0) + 1;
        }
        document.querySelectorAll('[data-count]').forEach(element => {
            fillLine(element, String(counts[element.dataset.count] || 0));
        });
        document.querySelectorAll('[data-tag-count]').forEach(element => {
            const count = tags[element.dataset.tagCount];
            if (count) fillLine(element, String(count));
        });

        const latest = posts.find(post => post.title);
        const block = document.querySelector('[data-latest]');
        if (latest && block) {
            block.querySelector('[data-latest-title]').textContent = latest.title;
            block.querySelector('[data-latest-date]').textContent = latest.date || '';
            const link = block.querySelector('a');
            link.href = latest.url;
            link.setAttribute('aria-label', `최근 기록: ${latest.title}${latest.date ? ', ' + latest.date : ''}`);
            block.hidden = false;
            watch(block);
        }
    }

    async function loadPosts() {
        // Without supabase-js the data layer answers with an empty list, which is not a count.
        if (!window.SwblogData || !window.supabase) return;
        try {
            fill(await window.SwblogData.fetchPosts());
        } catch (error) {
            // The counts simply stay empty.
        }
    }

    // This script runs first of the deferred ones; the data scripts after it have all run by
    // DOMContentLoaded (load is only a fallback).
    let asked = false;
    const askOnce = () => {
        if (asked) return;
        asked = true;
        loadPosts();
    };
    document.addEventListener('DOMContentLoaded', askOnce, { once: true });
    window.addEventListener('load', askOnce, { once: true });
    if (document.readyState === 'complete') askOnce();

    // ----- Contact -----

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            const field = document.createElement('textarea');
            field.value = text;
            field.setAttribute('readonly', '');
            field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
            document.body.append(field);
            field.select();
            let copied = false;
            try { copied = document.execCommand('copy'); } catch (ignored) { copied = false; }
            field.remove();
            return copied;
        }
    }

    function setupEmail() {
        const block = document.querySelector('[data-email]');
        const email = EMAIL.trim();
        if (!block || !email) return;
        const placeholder = block.querySelector('[data-email-address]');
        const button = block.querySelector('[data-copy]');
        const status = block.querySelector('[data-copy-status]');
        const link = document.createElement('a');
        link.className = 'info-email-address';
        link.href = 'mailto:' + email;
        link.textContent = email;
        placeholder.replaceWith(link);
        button.disabled = false;
        button.setAttribute('aria-label', '이메일 주소 복사');
        let timer = 0;
        button.addEventListener('click', async () => {
            const copied = await copyText(email);
            status.textContent = copied ? '이메일 주소를 복사했습니다.' : '복사하지 못했습니다. 주소를 선택해 두었습니다.';
            if (!copied) {
                // Leave the address selected, ready to copy by hand.
                const range = document.createRange();
                range.selectNodeContents(link);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
                return;
            }
            button.classList.add('is-copied');
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                button.classList.remove('is-copied');
                status.textContent = '';
            }, 2200);
        });
    }

    setupEmail();
    document.querySelectorAll('[data-year]').forEach(element => { element.textContent = String(new Date().getFullYear()); });
    document.querySelector('[data-top]')?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
}());
