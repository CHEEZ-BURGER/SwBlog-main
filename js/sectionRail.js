/* The section rail: long thin pills, one per section of a blog post (the same headings the
   contents use, plus the opening before the first heading when it is long), each as tall as its
   share of the article. A pill fills in as its section is read and the section being read is ink.
   Styles: css/reading.css. index.html builds it once a blog post is laid out (SectionRail.build)
   and clears it when the post closes or another one starts loading (SectionRail.clear).

   Phones and tablets: the rail runs down the left edge in place of a contents button. Press and
   drag to run through the post (the article follows the finger and a label above it names the
   section); a tap jumps to that point.

   Desktop (a mouse, and the contents column on the left): the rail stands in the right margin.
   Pointing at it thickens the pills and a label beside the cursor names the section under it;
   a click glides there; pressing and dragging runs through the post as on a phone; the wheel over
   the rail steps a section at a time; with the keyboard, ↑/↓ (and Home/End) do the same. */
(function () {
    'use strict';
    const panel = document.getElementById('post-panel');
    if (!panel) return;
    const desk = window.matchMedia('(min-width:1181px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    let rail = null, label = null, pills = [], sections = [], content = null, sizes = null;
    let frame = 0, dirty = true, active = -1, held = null, shown = -1, wheelAt = 0;

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
            rail.setAttribute('aria-valuenow', String(now + 1));
            rail.setAttribute('aria-valuetext', sections[now].title);
        }
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };

    // A height on the rail → the section under it and how far down it.
    function pointAt(y, rects) {
        let index = rects.findIndex(rect => y < rect.bottom);
        if (index < 0) index = rects.length - 1;
        const rect = rects[index];
        return { index, along: clamp((y - rect.top) / rect.height, 0, 1) };
    }
    const rectsNow = () => pills.map(pill => {
        const rect = pill.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: Math.max(1, rect.height) };
    });
    const scrollFor = ({ index, along }) => {
        if (dirty) measure();
        const section = sections[index];
        return section.start + along * (section.end - section.start);
    };

    // The label: above the finger on a phone, beside the cursor (to its left) on a desktop.
    function showLabel(index, y) {
        label.style.transform = `translate3d(0,${clamp(y, desk.matches ? 24 : 78, innerHeight - 20).toFixed(1)}px,0) translateY(-50%)`;
        label.classList.add('is-on');
        pills.forEach((pill, i) => pill.classList.toggle('is-pointed', i === index));
        if (index === shown) return;
        shown = index;
        label.querySelector('.section-rail-number').textContent = sections[index].number;
        label.querySelector('.section-rail-title').textContent = sections[index].title;
    }
    function hideLabel() {
        label?.classList.remove('is-on');
        pills.forEach(pill => pill.classList.remove('is-pointed'));
        shown = -1;
    }

    function glideTo(top) {
        panel.scrollTo({ top, behavior: reduced.matches ? 'auto' : 'smooth' });
    }

    function down(event) {
        if (event.button > 0) return;
        event.preventDefault();
        try { rail.setPointerCapture(event.pointerId); } catch { /* the drag still follows while it stays on the rail */ }
        // Held pills only grow wider, so the heights measured now stay true for the whole drag.
        held = { id: event.pointerId, rects: rectsNow(), y: event.clientY, moved: false, mouse: event.pointerType === 'mouse' };
        rail.classList.add('is-held');
        const point = pointAt(event.clientY, held.rects);
        showLabel(point.index, event.clientY);
        // A finger runs from the first touch; a mouse waits to see whether this is a click or a drag.
        if (!held.mouse) { panel.scrollTop = scrollFor(point); queue(); }
    }
    function move(event) {
        if (!held) {
            // Pointing (desktop): name the section under the cursor.
            if (event.pointerType === 'mouse' && rail) showLabel(pointAt(event.clientY, rectsNow()).index, event.clientY);
            return;
        }
        if (event.pointerId !== held.id) return;
        event.preventDefault();
        if (Math.abs(event.clientY - held.y) > 3) held.moved = true;
        if (held.mouse && !held.moved) return;
        const point = pointAt(event.clientY, held.rects);
        if (point.index !== shown && !held.mouse) navigator.vibrate?.(6);
        showLabel(point.index, event.clientY);
        panel.scrollTop = scrollFor(point);
        queue();
    }
    function up(event) {
        if (!held || event.pointerId !== held.id) return;
        const click = held.mouse && !held.moved && event.type === 'pointerup';
        const point = click ? pointAt(event.clientY, held.rects) : null;
        held = null;
        rail.classList.remove('is-held');
        if (click) glideTo(scrollFor(point));
        if (!rail.matches(':hover')) hideLabel();
    }

    // Desktop: the wheel over the rail steps one section at a time.
    function wheel(event) {
        if (!desk.matches || !rail) return;
        event.preventDefault();
        const now = performance.now();
        if (now - wheelAt < 420 || Math.abs(event.deltaY) < 4) return;
        wheelAt = now;
        step(event.deltaY > 0 ? 1 : -1);
    }
    function step(direction) {
        if (dirty) measure();
        const next = clamp(active + direction, 0, sections.length - 1);
        glideTo(next === active && direction > 0 ? sections[next].end : sections[next].start);
    }
    function key(event) {
        if (event.key === 'ArrowDown' || event.key === 'PageDown') step(1);
        else if (event.key === 'ArrowUp' || event.key === 'PageUp') step(-1);
        else if (event.key === 'Home') glideTo(0);
        else if (event.key === 'End') { if (dirty) measure(); glideTo(sections[sections.length - 1].end); }
        else return;
        event.preventDefault();
    }

    function clear() {
        cancelAnimationFrame(frame); frame = 0;
        sizes?.disconnect(); sizes = null;
        panel.removeEventListener('scroll', queue);
        const leaving = [rail, label].filter(Boolean);
        leaving.forEach(el => el.classList.add('is-leaving'));
        setTimeout(() => leaving.forEach(el => el.remove()), 320);
        rail = label = content = held = null;
        pills = []; sections = []; active = -1; shown = -1;
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

        rail = document.createElement('div');
        rail.className = 'section-rail';
        rail.tabIndex = 0;
        rail.setAttribute('role', 'slider');
        rail.setAttribute('aria-orientation', 'vertical');
        rail.setAttribute('aria-label', '글 구역 탐색');
        rail.setAttribute('aria-valuemin', '1');
        rail.setAttribute('aria-valuemax', String(sections.length));
        pills = sections.map(() => {
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
        rail.addEventListener('pointerleave', () => { if (!held) hideLabel(); });
        rail.addEventListener('wheel', wheel, { passive: false });
        rail.addEventListener('keydown', key);
        panel.addEventListener('scroll', queue, { passive: true });
        sizes = new ResizeObserver(() => { dirty = true; queue(); });
        sizes.observe(contentEl);
        sizes.observe(panel);
        dirty = true;
        update();
    }

    window.SectionRail = { build, clear };
}());
