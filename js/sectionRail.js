/* Phones and tablets (where the contents column is not shown): a rail of long thin pills at the
   left edge of a post, one per section (the same headings the contents use, plus the opening
   before the first heading), each as tall as its share of the article. A pill fills in as its
   section is read and the section being read is ink. Press anywhere on the rail and drag up or
   down to run through the post: the article follows the finger, a label beside it names the
   section, and the pills widen while held. A tap jumps to that point. Styles: css/reading.css.
   index.html builds it once a blog post is laid out (SectionRail.build) and clears it when the
   post closes or another one starts loading (SectionRail.clear). */
(function () {
    'use strict';
    const narrow = window.matchMedia('(max-width:1180px)');
    const panel = document.getElementById('post-panel');
    if (!panel) return;

    let rail = null, label = null, pills = [], sections = [], content = null, sizes = null;
    let frame = 0, dirty = true, active = -1, held = null, last = -1;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const offsetOf = el => el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;

    // Where each section starts and ends, in the panel's scroll positions.
    function measure() {
        dirty = false;
        if (!content) return;
        const end = Math.max(0, Math.min(offsetOf(content) + content.offsetHeight - panel.clientHeight * 0.6, panel.scrollHeight - panel.clientHeight));
        sections.forEach((section, i) => {
            section.start = i === 0 ? 0 : Math.max(0, offsetOf(section.el) - 72);
        });
        sections.forEach((section, i) => {
            section.end = Math.max(section.start + 1, i < sections.length - 1 ? sections[i + 1].start : end);
            pills[i].style.flexGrow = String(Math.max(1, section.end - section.start));
        });
    }

    function update() {
        frame = 0;
        if (!rail) return;
        if (dirty) measure();
        const top = panel.scrollTop;
        let now = 0;
        sections.forEach((section, i) => {
            const read = clamp((top - section.start) / (section.end - section.start), 0, 1);
            if (Math.abs(read - (section.read ?? -1)) > 0.002) {
                section.read = read;
                pills[i].fill.style.transform = `scaleY(${read.toFixed(4)})`;
            }
            if (top >= section.start - 1) now = i;
        });
        if (now !== active) {
            pills[active]?.classList.remove('is-active');
            pills[now]?.classList.add('is-active');
            active = now;
        }
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };

    // Finger height → a point in the article: the pill under the finger, and how far down it.
    function scrubTo(y) {
        if (dirty) measure();
        const rects = held.rects;
        let index = rects.findIndex(rect => y < rect.bottom);
        if (index < 0) index = rects.length - 1;
        const rect = rects[index];
        const along = clamp((y - rect.top) / rect.height, 0, 1);
        const section = sections[index];
        panel.scrollTop = section.start + along * (section.end - section.start);
        label.style.transform = `translate3d(0,${clamp(y, held.min, held.max).toFixed(1)}px,0) translateY(-50%)`;
        if (index !== last) {
            last = index;
            label.querySelector('.section-rail-number').textContent = section.number;
            label.querySelector('.section-rail-title').textContent = section.title;
            if (held.moved) navigator.vibrate?.(6);
        }
        queue();
    }

    function down(event) {
        if (event.button > 0 || !narrow.matches) return;
        event.preventDefault();
        try { rail.setPointerCapture(event.pointerId); } catch { /* the drag still follows while it stays on the rail */ }
        // Held pills only grow wider, so the heights measured now stay true for the whole drag.
        const rects = pills.map(pill => {
            const rect = pill.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, height: Math.max(1, rect.height) };
        });
        held = { id: event.pointerId, rects, min: 78, max: innerHeight - 20, y: event.clientY, moved: false };
        last = -1;
        rail.classList.add('is-held');
        label.classList.add('is-on');
        scrubTo(event.clientY);
    }
    function move(event) {
        if (!held || event.pointerId !== held.id) return;
        event.preventDefault();
        if (Math.abs(event.clientY - held.y) > 3) held.moved = true;
        scrubTo(event.clientY);
    }
    function up(event) {
        if (!held || event.pointerId !== held.id) return;
        held = null;
        rail.classList.remove('is-held');
        label.classList.remove('is-on');
    }

    function clear() {
        cancelAnimationFrame(frame); frame = 0;
        sizes?.disconnect(); sizes = null;
        panel.removeEventListener('scroll', queue);
        const leaving = [rail, label].filter(Boolean);
        leaving.forEach(el => el.classList.add('is-leaving'));
        setTimeout(() => leaving.forEach(el => el.remove()), 320);
        rail = label = content = held = null;
        pills = []; sections = []; active = -1; last = -1;
    }

    function build(contentEl) {
        clear();
        if (!contentEl || document.body.classList.contains('reading-gallery')) return;
        const headings = [...contentEl.querySelectorAll('h1:not([hidden]), h2:not([hidden])')];
        if (headings.length < 2) return;
        content = contentEl;
        const numberOf = heading => (heading.closest('.post-editorial-heading') || heading).dataset.sectionNumber || '';
        sections = headings.map(heading => ({ el: heading, title: heading.textContent.trim(), number: numberOf(heading) }));
        // The opening before the first heading is a section of its own when it is more than a glance.
        if (offsetOf(headings[0]) - offsetOf(contentEl) > panel.clientHeight * 0.35) {
            sections.unshift({ el: contentEl, title: document.getElementById('panel-title')?.textContent.trim() || '처음', number: '' });
        }

        rail = document.createElement('nav');
        rail.className = 'section-rail';
        rail.setAttribute('aria-label', '글 구역 탐색: 누른 채 위아래로 끌기');
        pills = sections.map((section, i) => {
            const pill = document.createElement('span');
            pill.className = 'section-rail-pill';
            pill.fill = document.createElement('span');
            pill.fill.className = 'section-rail-fill';
            pill.append(pill.fill);
            rail.append(pill);
            return pill;
        });
        label = document.createElement('div');
        label.className = 'section-rail-label';
        label.setAttribute('aria-hidden', 'true');
        label.innerHTML = '<span class="section-rail-number"></span><span class="section-rail-title"></span>';
        document.body.append(rail, label);

        rail.addEventListener('pointerdown', down);
        rail.addEventListener('pointermove', move);
        rail.addEventListener('pointerup', up);
        rail.addEventListener('pointercancel', up);
        rail.addEventListener('lostpointercapture', up);
        panel.addEventListener('scroll', queue, { passive: true });
        sizes = new ResizeObserver(() => { dirty = true; queue(); });
        sizes.observe(contentEl);
        sizes.observe(panel);
        dirty = true;
        update();
    }

    window.SectionRail = { build, clear };
}());
