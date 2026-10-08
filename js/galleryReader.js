/* Reading a gallery post: a portfolio piece told in large pictures.
   The post's content is read in order and set again: the text before the first picture becomes
   a project sheet (the facts of the post beside its opening words), the pictures become large
   plates (one across the page, or two side by side), and any text between them becomes a short
   note set to the right. Each plate is uncovered from the bottom as it comes into view while its
   picture settles, the picture drifts a little with the scroll inside its frame (a CSS view
   timeline, so the scroll never waits on script), and a counter at the foot of the screen says
   which picture is in view. Clicking a picture opens it full screen. */
(function () {
    'use strict';
    const BLOCK = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,table,section,article,figure';
    const SKIP = 'script,style,button,svg,input,.hidden-thumbnail,.story-controls,.story-progress,.global-zoom-btn';
    let plateObserver = null, counter = null, counterValue = null;

    // The content in reading order: pictures, and blocks of text that hold no picture.
    function sequence(root, title) {
        const out = [];
        const walk = node => {
            [...node.children].forEach(child => {
                if (child.matches(SKIP)) return;
                if (child.tagName === 'IMG') {
                    const src = child.currentSrc || child.getAttribute('src');
                    if (src) out.push({ src, alt: child.getAttribute('alt') || '' });
                    return;
                }
                const text = child.textContent.trim();
                if (child.querySelector('img:not(.hidden-thumbnail)')) { walk(child); return; }
                if (!text) return;
                if (child.querySelector(`:scope > :is(${BLOCK})`)) { walk(child); return; }
                if (/^H1$/.test(child.tagName) && title && text === title.trim()) return;
                out.push({ node: child });
            });
        };
        walk(root);
        // A picture that appears twice (sliders repeat frames) is shown once.
        return out.filter((item, i) => !item.src || out.findIndex(other => other.src === item.src) === i);
    }

    function plate(item, number, total, open) {
        const figure = document.createElement('figure');
        figure.className = 'gallery-plate';
        figure.innerHTML = '<div class="gallery-frame"></div><figcaption><span class="gallery-plate-number"></span><span class="gallery-plate-alt"></span></figcaption>';
        const img = new Image();
        img.decoding = 'async';
        img.loading = number <= 2 ? 'eager' : 'lazy';
        img.alt = item.alt;
        img.src = item.src;
        const shape = () => { if (img.naturalHeight > img.naturalWidth * 1.08) figure.classList.add('is-portrait'); };
        if (img.complete) shape(); else img.addEventListener('load', shape, { once: true });
        figure.querySelector('.gallery-frame').append(img);
        figure.querySelector('.gallery-plate-number').textContent = String(number).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
        figure.querySelector('.gallery-plate-alt').textContent = item.alt;
        figure.dataset.number = String(number);
        figure.tabIndex = 0;
        figure.setAttribute('role', 'button');
        figure.setAttribute('aria-label', `${number}번째 이미지 크게 보기`);
        const zoom = () => open?.(img.currentSrc || img.src);
        figure.addEventListener('click', zoom);
        figure.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); zoom(); } });
        return figure;
    }

    function textBlock(className, nodes) {
        const box = document.createElement('div');
        box.className = className;
        nodes.forEach(item => box.append(item.node.cloneNode(true)));
        // Old posts keep text in bare <div>s; they read as paragraphs here.
        box.querySelectorAll(':scope > div').forEach(div => {
            const p = document.createElement('p');
            p.innerHTML = div.innerHTML;
            div.replaceWith(p);
        });
        return box;
    }

    function setCounter(number, total) {
        if (!counter) return;
        const next = String(number).padStart(2, '0');
        if (counterValue === next) return;
        counterValue = next;
        const mask = counter.querySelector('.gallery-counter-mask');
        const line = document.createElement('span');
        line.textContent = next;
        const old = [...mask.children];
        mask.append(line);
        counter.querySelector('.gallery-counter-total').textContent = '/ ' + String(total).padStart(2, '0');
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) { old.forEach(node => node.remove()); return; }
        const ease = 'cubic-bezier(.19,1,.22,1)';
        line.animate([{ transform: 'translate3d(0,110%,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: 700, easing: ease });
        old.forEach(node => node.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,-110%,0)' }], { duration: 500, easing: ease, fill: 'forwards' })
            .finished.then(() => node.remove(), () => node.remove()));
    }

    function build(content, data = {}, { open } = {}) {
        stop();
        const items = sequence(content, data.title || '');
        const pictures = items.filter(item => item.src);
        const total = pictures.length;
        const post = document.createElement('div');
        post.className = 'gallery-post';

        // The opening: the text before the first picture, beside the post's facts.
        const firstPicture = items.findIndex(item => item.src);
        const opening = items.slice(0, firstPicture < 0 ? items.length : firstPicture);
        const sheet = document.createElement('section');
        sheet.className = 'gallery-sheet';
        const facts = document.createElement('dl');
        facts.className = 'gallery-facts';
        const created = data.created_at ? new Date(data.created_at) : null;
        const date = created ? [created.getFullYear(), created.getMonth() + 1, created.getDate()].map(n => String(n).padStart(2, '0')).join('.') : '';
        [['Tags', window.SwblogTags?.label(window.SwblogTags.tagsOf(data)) || ''], ['Date', date], ['Images', String(total).padStart(2, '0')]].forEach(([term, value]) => {
            if (!value) return;
            const row = document.createElement('div');
            row.innerHTML = '<dt></dt><dd></dd>';
            row.querySelector('dt').textContent = term;
            row.querySelector('dd').textContent = value;
            facts.append(row);
        });
        sheet.append(facts);
        if (opening.length) sheet.append(textBlock('gallery-sheet-text', opening));
        post.append(sheet);

        // The rest: runs of pictures become plates (one across, then two side by side, and so on),
        // runs of text become notes.
        let number = 0, i = Math.max(0, firstPicture < 0 ? items.length : firstPicture);
        while (i < items.length) {
            if (!items[i].src) {
                const run = [];
                while (i < items.length && !items[i].src) run.push(items[i++]);
                post.append(textBlock('gallery-note', run));
                continue;
            }
            const run = [];
            while (i < items.length && items[i].src) run.push(items[i++]);
            let k = 0, single = true;
            while (k < run.length) {
                if (single || k === run.length - 1) {
                    post.append(plate(run[k], ++number, total, open));
                    k += 1;
                } else {
                    const pair = document.createElement('div');
                    pair.className = 'gallery-pair';
                    pair.append(plate(run[k], ++number, total, open), plate(run[k + 1], ++number, total, open));
                    post.append(pair);
                    k += 2;
                }
                single = !single;
            }
        }
        content.replaceChildren(post);
        content.dataset.galleryLayout = 'ready';

        // The counter at the foot of the screen, and each plate's uncovering.
        if (total) {
            counter = document.createElement('div');
            counter.className = 'gallery-counter';
            counter.setAttribute('aria-hidden', 'true');
            counter.innerHTML = '<span class="gallery-counter-mask"></span><span class="gallery-counter-total"></span>';
            document.body.append(counter);
            counterValue = null;
            setCounter(1, total);
        }
        const plates = [...post.querySelectorAll('.gallery-plate')];
        plateObserver = new IntersectionObserver(entries => entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-in');
        }), { rootMargin: '0px 0px -12% 0px' });
        const spotter = new IntersectionObserver(entries => entries.forEach(entry => {
            if (entry.isIntersecting) setCounter(Number(entry.target.dataset.number), total);
        }), { rootMargin: '-45% 0px -45% 0px' });
        plates.forEach(figure => { plateObserver.observe(figure); spotter.observe(figure); });
        const previous = plateObserver;
        plateObserver = { disconnect: () => { previous.disconnect(); spotter.disconnect(); } };
        return { pictures: total };
    }

    function stop() {
        plateObserver?.disconnect();
        plateObserver = null;
        counter?.remove();
        counter = null;
        counterValue = null;
    }

    window.GalleryReader = { build, stop };
}());
