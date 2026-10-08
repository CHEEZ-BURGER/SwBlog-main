/* The index's right-hand panel: each post's panel picture, full bleed.
   A post can carry a picture made for this panel (set in the editor); without one, its first
   picture stands in. The newest post shows until another is pointed at, and the last one
   pointed at stays when the pointer leaves the list. A new picture is uncovered from the
   bottom up while it settles from a slight enlargement (expo out), over the one before.
   Across the middle of the picture three words give the post's hashtags, date and reading
   time (inverted against the picture); below it a small caption names it. Their words rise in masks as posts change. */
(() => {
    'use strict';
    const EXPO = 'cubic-bezier(.19,1,.22,1)';
    const UNCOVER = 1150;       // ms for a picture to be uncovered
    const SETTLE = 1700;        // ms for it to settle to its size
    const WAIT = 900;           // longest wait for a picture to decode before it is shown anyway

    // The panel picture of a post, written into its content by the editor as a comment, so it
    // shows nowhere else.
    const panelImage = content => (String(content || '').match(/<!--\s*swblog:panel\s+(\S+?)\s*-->/) || [])[1] || null;

    class PanelScene {
        constructor(id) {
            this.container = document.getElementById(id);
            if (!this.container) return;
            this.isActive = true; this.request = 0; this.key = null;
            this.motion = matchMedia('(prefers-reduced-motion: reduce)');
            this.figure = document.createElement('figure');
            this.figure.className = 'panel-field';
            this.figure.innerHTML = '<div class="panel-field-stack"></div>'
                + '<div class="panel-field-meta" aria-hidden="true">'
                + '<span class="panel-field-tag is-category"></span><span class="panel-field-tag is-date"></span><span class="panel-field-tag is-read"></span></div>'
                + '<figcaption class="panel-field-caption" aria-live="polite"><span class="panel-field-mask"><span class="panel-field-line"></span></span></figcaption>';
            this.stack = this.figure.querySelector('.panel-field-stack');
            this.tags = [...this.figure.querySelectorAll('.panel-field-tag')];
            // The caption's words sit in a mask one line tall inside the strip, not in the strip
            // itself, so the words leaving are hidden as soon as they rise out of their line.
            this.caption = this.figure.querySelector('.panel-field-mask');
            this.container.replaceChildren(this.figure);
            this.container.classList.add('panel-placeholder');
            // Until something is pointed at, the newest post stands in the panel.
            const list = document.getElementById('post-container');
            if (list) {
                this.listObserver = new MutationObserver(() => this.showNewest());
                this.listObserver.observe(list, { childList: true });
            }
            this.showNewest();
        }
        // What a row of the list says about its post.
        static fromRow(row) {
            if (!row) return null;
            return {
                id: row.dataset.postId,
                title: row.getAttribute('aria-label') || '',
                category: row.dataset.category || '',
                date: row.dataset.date || '',
                read: row.dataset.read || '',
                number: row.querySelector('.post-list-num')?.textContent?.trim() || '',
                src: row.dataset.panelImg || row.dataset.previewImg || ''
            };
        }
        showNewest() {
            if (this.key) return;
            const post = PanelScene.fromRow(document.querySelector('#post-container .post-list-item'));
            if (post?.src) this.setPost(post);
        }
        // Points the panel at a post. Leaving the list (null) keeps the last picture.
        async setPost(post = null) {
            if (!post) return;
            // A row passed from the list may only carry its first picture; its own row knows
            // the panel picture.
            const row = document.querySelector(`#post-container .post-list-item[data-post-id="${CSS.escape(String(post.id))}"]`);
            const known = PanelScene.fromRow(row);
            const view = { ...post, ...(known || {}), title: known?.title || post.title, src: known?.src || post.src };
            if (!view.src) return;
            const key = view.id + ':' + view.src;
            if (key === this.key) return;
            this.key = key;
            const ticket = ++this.request;
            const image = new Image();
            image.alt = ''; image.decoding = 'async'; image.draggable = false; image.src = view.src;
            await Promise.race([image.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, WAIT))]);
            if (ticket !== this.request) return;
            this.show(image, view);
        }
        show(image, view) {
            const layer = document.createElement('div');
            layer.className = 'panel-field-layer';
            const frame = document.createElement('div');
            frame.className = 'panel-field-frame';
            frame.append(image);
            layer.append(frame);
            this.stack.append(layer);
            this.label(view);
            const older = [...this.stack.children].slice(0, -1);
            const done = () => older.forEach(node => node.remove());
            if (this.motion.matches || !older.length) {
                if (!older.length && !this.motion.matches) {
                    // The first picture simply comes up out of the paper.
                    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
                }
                done();
                return;
            }
            // Uncovered from the bottom: the layer slides up while the picture inside it slides
            // down by the same amount, so the picture holds still and its edge sweeps up it.
            const uncover = { duration: UNCOVER, easing: EXPO };
            layer.animate([{ transform: 'translate3d(0,100%,0)' }, { transform: 'translate3d(0,0,0)' }], uncover);
            frame.animate([{ transform: 'translate3d(0,-100%,0)' }, { transform: 'translate3d(0,0,0)' }], uncover);
            image.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: SETTLE, easing: EXPO });
            // The picture underneath is pushed up a little as it is covered.
            const below = older[older.length - 1];
            below?.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,-14%,0)' }], { ...uncover, fill: 'forwards' });
            // Many quick changes stack up; only the last few layers are kept.
            older.slice(0, -2).forEach(node => node.remove());
            setTimeout(() => { if (layer.isConnected && this.stack.lastElementChild === layer) done(); }, UNCOVER + 50);
        }
        // Swaps the words in one mask: the old ones rise out as the new ones rise in.
        swap(box, build, delay) {
            const next = document.createElement('span');
            next.className = 'panel-field-line';
            build(next);
            const old = [...box.children];
            box.append(next);
            if (this.motion.matches) { old.forEach(node => node.remove()); return; }
            next.animate([{ transform: 'translate3d(0,110%,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: 900, delay: 180 + delay, easing: EXPO, fill: 'backwards' });
            old.forEach(node => {
                node.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,-110%,0)' }], { duration: 600, delay, easing: EXPO, fill: 'forwards' })
                    .finished.then(() => node.remove(), () => node.remove());
            });
        }
        // The words across the picture (hashtags, date, reading time, one after another) and
        // the caption under it (number and title).
        label(view) {
            const [category, date, read] = this.tags;
            this.swap(category, line => { line.textContent = view.category || ''; }, 0);
            this.swap(date, line => { line.textContent = view.date || ''; }, 60);
            this.swap(read, line => { line.textContent = view.read ? `약 ${view.read}분 읽기` : ''; }, 120);
            this.swap(this.caption, line => {
                line.innerHTML = '<span class="panel-field-number"></span><span class="panel-field-title"></span>';
                line.querySelector('.panel-field-number').textContent = view.number || '';
                line.querySelector('.panel-field-title').textContent = view.title || '';
            }, 0);
        }
        // The old scene's interface: nothing here draws on frames.
        setRowPointer() {}
        setActive(active) { this.isActive = active; }
        onResize() {}
        draw() {}
        atlas() {}
        destroy() { ++this.request; this.listObserver?.disconnect(); this.figure.remove(); this.container.classList.remove('panel-placeholder'); }
    }
    PanelScene.panelImage = panelImage;
    window.PanelScene = PanelScene;
})();
