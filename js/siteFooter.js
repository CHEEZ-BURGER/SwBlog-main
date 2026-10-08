/* The site's footer, the same on every page that has one (index list and reader, post.html,
   blog, gallery, info): a small row of links and a way back up, then "© 2026 KIMSUNGWOO" set
   large in the wordmark's face (Circular Std), sized so the letters' ink runs exactly from one
   margin to the other. The big line rises through a mask of its own height when the footer comes
   into view. Any element with [data-site-footer] is filled in; styles are in css/siteFooter.css. */
(function () {
    'use strict';
    const MARK = '© 2026 KIMSUNGWOO';
    const LINKS = [['INFO', './info.html'], ['BLOG', './blog.html'], ['GALLERY', './gallery.html'], ['PLAYGROUND', './playground.html']];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canvas = document.createElement('canvas').getContext('2d');

    // One line on a wide screen; on a narrow one two ("© 2026" over "KIMSUNGWOO") at one size,
    // so the longer line spans the width and the type stays large.
    const NARROW = 600;
    const linesFor = width => (width < NARROW ? ['© 2026', 'KIMSUNGWOO'] : [MARK]);

    function markup() {
        const here = location.pathname.split('/').pop() || 'index.html';
        const nav = LINKS.map(([name, href]) =>
            `<a href="${href}"${href.endsWith(here) ? ' aria-current="page"' : ''}><span class="site-footer-roll"><span>${name}</span><span aria-hidden="true">${name}</span></span></a>`
        ).join('');
        return `<div class="site-footer-top">
                <nav class="site-footer-nav" aria-label="사이트">${nav}</nav>
                <button type="button" class="site-footer-up" aria-label="맨 위로">TOP <span aria-hidden="true">↑</span></button>
            </div>
            <p class="site-footer-mark" aria-label="${MARK}"></p>`;
    }
    function setLines(mark, lines) {
        if (mark.dataset.footerLines === lines.join('|')) return;
        mark.dataset.footerLines = lines.join('|');
        mark.innerHTML = lines.map((text, i) =>
            `<span class="site-footer-line" aria-hidden="true" style="--line:${i}"><span class="site-footer-ink">${text}</span></span>`
        ).join('');
    }

    // Ink, not the text box: each line's advance width measured on the page, less the trailing
    // letter spacing and the side bearings of its first and last letters (measured on a canvas).
    // Layout widths (offsetWidth), not on-screen ones: the page may be mid-transition and scaled.
    // All lines share one size, set by the widest ink; each line starts exactly at the margin.
    const PROBE = 400;
    function fit(footer) {
        const mark = footer.querySelector('.site-footer-mark');
        if (!mark) return;
        const avail = mark.clientWidth;
        if (!avail) return;
        setLines(mark, linesFor(footer.clientWidth));
        const inks = [...mark.querySelectorAll('.site-footer-ink')];
        inks.forEach(ink => { ink.style.fontSize = PROBE + 'px'; ink.style.marginLeft = '0px'; });
        const style = getComputedStyle(inks[0]);
        const spacing = parseFloat(style.letterSpacing) || 0;
        canvas.font = `${style.fontWeight} ${PROBE}px ${style.fontFamily}`;
        const measured = inks.map(ink => {
            const text = ink.textContent;
            const first = canvas.measureText(text[0]);
            const last = canvas.measureText(text[text.length - 1]);
            const leftGap = -first.actualBoundingBoxLeft;
            const rightGap = last.width - last.actualBoundingBoxRight;
            return { ink, leftGap, width: ink.offsetWidth - spacing - leftGap - rightGap };
        });
        const widest = Math.max(...measured.map(line => line.width));
        if (!(widest > 0)) return;
        const scale = avail / widest;
        measured.forEach(({ ink, leftGap }) => {
            ink.style.fontSize = (PROBE * scale).toFixed(3) + 'px';
            ink.style.marginLeft = (-leftGap * scale).toFixed(3) + 'px';
        });
    }

    // The nearest box that scrolls (the reader panel, the index list on a desktop), else the page.
    function scrollerOf(el) {
        for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
            const overflow = getComputedStyle(node).overflowY;
            if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
        }
        return window;
    }

    function build(footer) {
        footer.classList.add('site-footer');
        footer.innerHTML = markup();
        footer.querySelector('.site-footer-up').addEventListener('click', () => {
            scrollerOf(footer).scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
        });
        const refit = () => fit(footer);
        // Measured again once the face has really arrived: measuring the stand-in font sets the
        // line a few percent too large.
        refit();
        if (document.fonts) {
            document.fonts.load('400 100px "Circular Std"').catch(() => {}).then(() => requestAnimationFrame(refit));
            document.fonts.ready.then(() => requestAnimationFrame(refit));
            document.fonts.addEventListener?.('loadingdone', () => requestAnimationFrame(refit));
        }
        if ('ResizeObserver' in window) {
            let width = 0;
            new ResizeObserver(entries => {
                const next = Math.round(entries[0].contentRect.width);
                if (next !== width) { width = next; refit(); }
            }).observe(footer);
        } else {
            window.addEventListener('resize', refit);
        }
        if (reduced.matches || !('IntersectionObserver' in window)) { footer.classList.add('is-in'); return; }
        // It rises once, the first time it is seen.
        const seen = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            footer.classList.add('is-in');
            seen.disconnect();
        }, { threshold: 0.25 });
        seen.observe(footer.querySelector('.site-footer-mark'));
    }

    // Only with the script running does the mark start below its mask (css/siteFooter.css).
    if (!reduced.matches && 'IntersectionObserver' in window) document.documentElement.classList.add('js-footer-motion');
    const start = () => document.querySelectorAll('[data-site-footer]').forEach(build);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
}());
