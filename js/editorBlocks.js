/* SWBLOG writing room — the block editor.
   The document is a column of blocks (paragraph, heading, quote, note, list, code, divider, media,
   two-column section, numbered principles, and raw HTML kept as it was). Each text block is its own
   small contenteditable; media blocks hold pictures with a layout (single / 2 columns / 3 columns /
   slider), a caption, and per-picture alt text. The editor reads stored HTML into blocks and writes
   plain semantic HTML back out, reusing the markup the site already renders (img.big,
   .image-grid image-grid-2/3, .story-slider). Undo/redo keep snapshots of the whole column so that
   moving, merging and converting blocks undo as cleanly as typing. */
(function () {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = window.matchMedia('(hover: none), (pointer: coarse)');
    const EASE = 'cubic-bezier(.19,1,.22,1)';

    const MERGEABLE = new Set(['paragraph', 'heading', 'quote', 'note']);
    const LAYOUTS = ['single', 'grid-2', 'grid-3', 'story'];
    const LAYOUT_LABEL = { single: '단일', 'grid-2': '2열', 'grid-3': '3열', story: '슬라이드' };
    const LAYOUT_CLASS = { single: 'big', 'grid-2': 'mini', 'grid-3': 'mini', story: 'story-img' };
    const INLINE_CLASSES = ['high', 'lead-text', 'muted-text', 'chip-blue'];
    const INLINE_TAGS = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DEL', 'DFN', 'EM', 'FONT', 'I', 'INS', 'KBD', 'MARK', 'Q', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR']);
    const EDITOR_ATTRS = ['contenteditable', 'data-editable', 'data-ph', 'spellcheck', 'data-editor-block', 'data-insert-token', 'onclick', 'tabindex', 'draggable'];
    const PLACEHOLDER = { paragraph: '‘/’를 눌러 블록 추가', heading: '제목', quote: '인용문', note: '메모', code: '코드' };

    // The exact slider buttons the site's own slider markup has always used.
    const STORY_PREV = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    const STORY_ZOOM = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
    const STORY_NEXT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    const ICON = {
        plus: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11"/></svg>',
        grip: '<svg class="icon icon-fill" viewBox="0 0 20 20" aria-hidden="true"><circle cx="7.5" cy="5" r="1.3"/><circle cx="12.5" cy="5" r="1.3"/><circle cx="7.5" cy="10" r="1.3"/><circle cx="12.5" cy="10" r="1.3"/><circle cx="7.5" cy="15" r="1.3"/><circle cx="12.5" cy="15" r="1.3"/></svg>',
        link: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1"/></svg>',
        clear: '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5.5h9M9.5 5.5 7.4 15"/><path d="m12 12 4 4M16 12l-4 4"/></svg>'
    };

    let root = null;
    let docEl = null;
    let options = {};
    let activeBlock = null;
    let lastActiveBlock = null;
    let hoverBlock = null;
    let uidCounter = 0;
    let changeTimer = null;
    let plainMode = 'plaintext-only';
    const ui = {};

    try {
        const probe = document.createElement('div');
        probe.contentEditable = 'plaintext-only';
        if (probe.contentEditable !== 'plaintext-only') plainMode = 'true';
    } catch (error) { plainMode = 'true'; }

    /* ---------- small helpers ---------- */
    const uid = () => 'b' + Date.now().toString(36) + (uidCounter++).toString(36);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const readJson = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch (error) { return fallback; } };
    const attrsOf = (el, skip = []) => [...el.attributes].filter(attr => !skip.includes(attr.name.toLowerCase())).map(attr => [attr.name, attr.value]);
    const attrString = pairs => (pairs || []).map(([name, value]) => ` ${name}="${esc(value)}"`).join('');
    const isImageFile = file => file && /^image\//.test(file.type);
    const preload = (url, timeout = 4000) => new Promise(resolve => {
        const probe = new Image();
        const done = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(done, timeout);
        probe.onload = probe.onerror = done;
        probe.src = url;
    });
    const blocks = () => [...root.children].filter(el => el.classList.contains('blk'));
    const typeOf = blk => blk?.dataset.type || '';
    const isTextual = blk => !!blk && !!editableOf(blk) && typeOf(blk) !== 'media';

    function editableOf(blk) {
        if (!blk) return null;
        const type = blk.dataset.type;
        if (type === 'table') return blk.querySelector('th[data-editable], td[data-editable]');
        if (type === 'buttons') return blk.querySelector('.btn-label');
        return blk.querySelector(':scope > [data-editable]') || blk.querySelector('[data-editable]');
    }

    // The place the caret lands when arriving from below: the last cell, the last button label.
    function lastEditable(blk) {
        const type = blk?.dataset.type;
        if (type === 'table') {
            const cells = blk.querySelectorAll('th[data-editable], td[data-editable]');
            return cells[cells.length - 1] || null;
        }
        if (type === 'buttons') {
            const labels = blk.querySelectorAll('.btn-label');
            return labels[labels.length - 1] || null;
        }
        return editableOf(blk);
    }

    function hasMediaContent(node) {
        return !!node.querySelector?.('img, iframe, video, svg, hr, table');
    }

    function isBlank(node) {
        if (!node) return true;
        return node.textContent.replace(/[\s\u200B\u00a0\uFEFF]/g, '') === '' && !hasMediaContent(node);
    }

    function fixEmpty(el) {
        if (!el) return;
        if (el.tagName === 'UL' || el.tagName === 'OL') {
            if (!el.querySelector('li')) el.innerHTML = '<li><br></li>';
            return;
        }
        if (el.tagName === 'PRE') return;
        if (isBlank(el) && !el.querySelector('br')) el.innerHTML = '<br>';
    }

    function stripTrailingBreak(el) {
        let last = el.lastChild;
        while (last && last.nodeType === Node.TEXT_NODE && !last.textContent.replace(/\u200B/g, '').length) {
            const prev = last.previousSibling;
            last.remove();
            last = prev;
        }
        if (last && last.nodeName === 'BR') last.remove();
    }

    function animateIn(el) {
        if (reduceMotion.matches || !el.animate) return;
        el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
    }

    // Measure, change the column, then glide every block from where it was to where it is.
    function flip(mutate, scope) {
        const container = scope || root;
        const before = new Map([...container.children].map(el => [el, el.getBoundingClientRect()]));
        mutate();
        if (reduceMotion.matches) return;
        [...container.children].forEach(el => {
            const old = before.get(el);
            if (!old || !el.animate) return;
            const now = el.getBoundingClientRect();
            const dx = old.left - now.left;
            const dy = old.top - now.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 460, easing: EASE });
        });
    }

    /* ---------- caret ---------- */
    function textNodes(el) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
    }

    function selectionRange() {
        const selection = window.getSelection();
        return selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    }

    function caretOffset(el) {
        const range = selectionRange();
        if (!range || !el.contains(range.startContainer)) return 0;
        const pre = document.createRange();
        pre.selectNodeContents(el);
        pre.setEnd(range.startContainer, range.startOffset);
        return pre.toString().length;
    }

    function textLength(el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.toString().length;
    }

    function setCaret(el, where = 'end') {
        if (!el) return;
        el.focus({ preventScroll: true });
        const range = document.createRange();
        const nodes = textNodes(el).filter(node => node.textContent.length);
        if (where === 'start' || where === 0 || !nodes.length) {
            range.selectNodeContents(el);
            range.collapse(true);
        } else if (where === 'end') {
            const last = nodes[nodes.length - 1];
            range.setStart(last, last.textContent.length);
            range.collapse(true);
        } else {
            let remaining = Math.max(0, Number(where) || 0);
            let placed = false;
            for (const node of nodes) {
                if (remaining <= node.textContent.length) {
                    range.setStart(node, remaining);
                    placed = true;
                    break;
                }
                remaining -= node.textContent.length;
            }
            if (!placed) {
                const last = nodes[nodes.length - 1];
                range.setStart(last, last.textContent.length);
            }
            range.collapse(true);
        }
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        revealCaret();
    }

    function revealCaret() {
        const range = selectionRange();
        if (!range) return;
        const rect = range.getClientRects()[0] || range.startContainer?.parentElement?.getBoundingClientRect?.();
        if (!rect) return;
        const top = (options.topInset?.() || 0) + 24;
        const bottom = window.innerHeight - (options.bottomInset?.() || 0) - 40;
        if (rect.top < top) window.scrollBy({ top: rect.top - top, behavior: 'auto' });
        else if (rect.bottom > bottom) window.scrollBy({ top: rect.bottom - bottom, behavior: 'auto' });
    }

    function caretRect() {
        const range = selectionRange();
        if (!range) return null;
        const rects = range.getClientRects();
        if (rects.length) return rects[0];
        const marker = document.createElement('span');
        marker.textContent = '\u200B';
        const clone = range.cloneRange();
        clone.insertNode(marker);
        const rect = marker.getBoundingClientRect();
        const parent = marker.parentNode;
        marker.remove();
        parent?.normalize();
        return rect;
    }

    function lineInfo(el) {
        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 || 24;
        return { lineHeight, padTop: parseFloat(style.paddingTop) || 0, padBottom: parseFloat(style.paddingBottom) || 0 };
    }

    function onFirstLine(el) {
        const rect = caretRect();
        if (!rect || (!rect.top && !rect.bottom)) return true;
        const box = el.getBoundingClientRect();
        const { lineHeight, padTop } = lineInfo(el);
        return rect.top - (box.top + padTop) < lineHeight * 0.75;
    }

    function onLastLine(el) {
        const rect = caretRect();
        if (!rect || (!rect.top && !rect.bottom)) return true;
        const box = el.getBoundingClientRect();
        const { lineHeight, padBottom } = lineInfo(el);
        return (box.bottom - padBottom) - rect.bottom < lineHeight * 0.75;
    }

    /* ---------- block construction ---------- */
    function shell(type) {
        const blk = document.createElement('div');
        blk.className = 'blk';
        blk.dataset.id = uid();
        blk.dataset.type = type;
        return blk;
    }

    function makeEditable(el, type, plain = false) {
        el.setAttribute('contenteditable', plain ? plainMode : 'true');
        el.setAttribute('data-editable', '');
        if (PLACEHOLDER[type]) el.setAttribute('data-ph', PLACEHOLDER[type]);
    }

    function copyAttributes(from, to) {
        attrsOf(from, EDITOR_ATTRS).forEach(([name, value]) => to.setAttribute(name, value));
        to.classList.remove('is-selected-block');
        if (!to.getAttribute('class')) to.removeAttribute('class');
    }

    function textBlock(type, source) {
        const blk = shell(type);
        let el;
        if (source instanceof Element) {
            el = document.createElement(source.tagName.toLowerCase());
            copyAttributes(source, el);
            el.innerHTML = source.innerHTML;
        } else {
            el = document.createElement(source.tag || 'p');
            (source.attrs || []).forEach(([name, value]) => el.setAttribute(name, value));
            el.innerHTML = source.html || '';
        }
        if (type === 'note') el.classList.add('note-box');
        el.querySelectorAll('[contenteditable], [data-editor-block], [data-insert-token]').forEach(node => {
            node.removeAttribute('contenteditable');
            node.removeAttribute('data-editor-block');
            node.removeAttribute('data-insert-token');
        });
        makeEditable(el, type);
        fixEmpty(el);
        blk.append(el);
        refreshEmpty(blk);
        return blk;
    }

    function paragraph(html = '') {
        return textBlock('paragraph', { tag: 'p', html });
    }

    function heading(level, html = '') {
        return textBlock('heading', { tag: 'h' + Math.min(4, Math.max(1, level)), html });
    }

    function codeBlock(source) {
        const blk = shell('code');
        const pre = document.createElement('pre');
        let text = '';
        if (source instanceof Element) {
            copyAttributes(source, pre);
            const code = source.querySelector(':scope > code');
            if (code) {
                const codeAttrs = attrsOf(code, EDITOR_ATTRS);
                if (codeAttrs.length) blk.dataset.codeAttrs = JSON.stringify(codeAttrs);
            }
            text = source.textContent;
        } else {
            text = source?.text || '';
        }
        makeEditable(pre, 'code', true);
        pre.setAttribute('spellcheck', 'false');
        pre.textContent = text.replace(/\n$/, '');
        blk.append(pre);
        refreshEmpty(blk);
        return blk;
    }

    function dividerBlock(source) {
        const blk = shell('divider');
        blk.tabIndex = -1;
        const hr = document.createElement('hr');
        if (source instanceof Element) copyAttributes(source, hr);
        blk.append(hr);
        return blk;
    }

    const PRINCIPLE_BAR = `<div class="blk-bar" role="toolbar" aria-label="번호 원칙 도구">
        <button type="button" data-act="principle-add">항목 추가</button>
        <button type="button" data-act="principle-remove">항목 삭제</button>
        <button type="button" data-act="principle-up" aria-label="항목 위로">↑</button>
        <button type="button" data-act="principle-down" aria-label="항목 아래로">↓</button>
    </div>`;

    function richBlock(type, source) {
        const blk = shell(type);
        const el = document.createElement(source.tagName.toLowerCase());
        copyAttributes(source, el);
        el.innerHTML = source.innerHTML;
        el.querySelectorAll('[contenteditable], [data-editor-block], [data-insert-token], .is-selected-block').forEach(node => {
            node.removeAttribute('contenteditable');
            node.removeAttribute('data-editor-block');
            node.removeAttribute('data-insert-token');
            node.classList.remove('is-selected-block');
        });
        makeEditable(el, type);
        if (type === 'principles') blk.insertAdjacentHTML('afterbegin', PRINCIPLE_BAR);
        blk.append(el);
        return blk;
    }

    function htmlBlock(html) {
        const blk = shell('html');
        blk.tabIndex = -1;
        blk.innerHTML = '<div class="blk-html-label">HTML · 원문 그대로 보존</div><div class="blk-html-view"></div>';
        blk.querySelector('.blk-html-view').innerHTML = html;
        return blk;
    }

    /* ---------- table ---------- */
    const TABLE_BAR = `<div class="blk-bar table-bar" role="toolbar" aria-label="표 도구">
        <button type="button" data-act="table-header" aria-pressed="true">머리 행</button>
        <button type="button" data-act="table-row-add">행 추가</button>
        <button type="button" data-act="table-row-remove">행 삭제</button>
        <button type="button" data-act="table-col-add">열 추가</button>
        <button type="button" data-act="table-col-remove">열 삭제</button>
    </div>`;

    function tableCell(tag, html = '') {
        const cell = document.createElement(tag);
        makeEditable(cell, 'cell');
        cell.innerHTML = html || '';
        cell.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
        fixEmpty(cell);
        return cell;
    }

    function tableRow(tag, width) {
        const tr = document.createElement('tr');
        for (let index = 0; index < width; index++) tr.append(tableCell(tag));
        return tr;
    }

    const tableOf = blk => blk.querySelector('table.blk-table');
    const tableWidth = table => Math.max(1, ...[...table.rows].map(row => row.cells.length));

    // rows: arrays of cell HTML; with a header, the first array is the header row.
    function tableBlock({ header = true, rows = null, caption = '' } = {}) {
        const blk = shell('table');
        blk.dataset.header = header ? '1' : '0';
        const matrix = rows && rows.length ? rows : [['', '', ''], ['', '', ''], ['', '', '']];
        const width = Math.max(1, ...matrix.map(row => row.length));
        blk.innerHTML = `${TABLE_BAR}<div class="table-wrap"><table class="blk-table"><thead></thead><tbody></tbody></table></div><div class="table-caption"></div>`;
        const table = tableOf(blk);
        matrix.forEach((cells, index) => {
            const head = header && index === 0;
            const tr = document.createElement('tr');
            for (let column = 0; column < width; column++) tr.append(tableCell(head ? 'th' : 'td', cells[column] || ''));
            (head ? table.tHead : table.tBodies[0]).append(tr);
        });
        if (!table.tBodies[0].rows.length) table.tBodies[0].append(tableRow('td', width));
        const captionEl = blk.querySelector('.table-caption');
        makeEditable(captionEl, 'caption');
        captionEl.setAttribute('data-ph', '표 설명 (선택)');
        captionEl.innerHTML = caption || '';
        syncTable(blk);
        return blk;
    }

    function syncTable(blk) {
        blk.querySelector('[data-act="table-header"]')?.setAttribute('aria-pressed', String(blk.dataset.header === '1'));
        const caption = blk.querySelector('.table-caption');
        blk.classList.toggle('has-caption', !!caption && !isBlank(caption));
    }

    // Stored tables load into the table block only when they fit its shape; anything else stays HTML.
    function tableFromElement(table, caption = '') {
        if ([...table.children].some(child => !['THEAD', 'TBODY', 'CAPTION'].includes(child.tagName))) return null;
        if (table.tBodies.length > 1 || table.querySelector('table')) return null;
        const head = table.tHead;
        if (head && head.rows.length !== 1) return null;
        const rows = [...table.rows];
        if (!rows.length) return null;
        const cellsFit = rows.every(row => [...row.children].every(cell => /^T[HD]$/.test(cell.tagName)
            && (Number(cell.getAttribute('rowspan') || 1) === 1) && (Number(cell.getAttribute('colspan') || 1) === 1)));
        if (!cellsFit) return null;
        const header = !!head || [...rows[0].cells].every(cell => cell.tagName === 'TH');
        if (rows.slice(header ? 1 : 0).some(row => [...row.cells].some(cell => cell.tagName === 'TH'))) return null;
        const captionEl = table.querySelector(':scope > caption');
        return tableBlock({ header, rows: rows.map(row => [...row.cells].map(cell => cell.innerHTML)), caption: caption || captionEl?.innerHTML || '' });
    }

    function cellHtml(cell) {
        const clone = cleanClone(cell);
        stripTrailingBreak(clone);
        return clone.innerHTML.trim();
    }

    function serializeTable(blk, draft) {
        const table = tableOf(blk);
        const headRow = blk.dataset.header === '1' ? table.tHead.rows[0] : null;
        const captionEl = blk.querySelector('.table-caption');
        let caption = '';
        if (captionEl && !isBlank(captionEl)) {
            const clone = cleanClone(captionEl);
            stripTrailingBreak(clone);
            caption = clone.innerHTML.trim();
        }
        if (!draft && !caption && [...table.querySelectorAll('th, td')].every(cell => isBlank(cell))) return '';
        const head = headRow ? `<thead><tr>${[...headRow.cells].map(cell => `<th>${cellHtml(cell)}</th>`).join('')}</tr></thead>` : '';
        const body = `<tbody>${[...table.tBodies[0].rows].map(row => `<tr>${[...row.cells].map(cell => `<td>${cellHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
        return `<figure class="post-table"><table>${head}${body}</table>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }

    /* ---------- link buttons ---------- */
    const BUTTON_LABEL = '자세히 보기';
    const BUTTON_EDITOR = `<div class="btn-editor">
        <label class="btn-field"><span class="sr-only">링크 주소</span><input type="text" class="btn-url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://… 또는 ?post=17"></label>
        <div class="btn-styles" role="group" aria-label="버튼 모양"><button type="button" data-act="btn-style" data-value="solid" aria-pressed="true">채움</button><button type="button" data-act="btn-style" data-value="ghost" aria-pressed="false">외곽</button></div>
        <label class="btn-newtab"><input type="checkbox" class="btn-newtab-input"><span>새 탭에서 열기</span></label>
        <button type="button" class="btn-remove" data-act="btn-remove">삭제</button>
        <p class="btn-hint" aria-live="polite"></p>
    </div>`;

    // Only web, mail and on-site addresses; anything else (javascript:, data:, //host) is refused.
    function normalizeUrl(raw) {
        const value = String(raw || '').trim();
        if (!value || /\s/.test(value)) return '';
        if (/^https?:\/\/[^/\s]+/i.test(value)) return value;
        if (/^mailto:[^\s]+@[^\s]+$/i.test(value)) return value;
        if (/^(\?|#|\.\.?\/|\/(?!\/))/.test(value)) return value;
        if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(value)) return 'https://' + value;
        return '';
    }

    const isExternal = href => /^https?:\/\//i.test(href || '');

    function buttonItem({ label = BUTTON_LABEL, href = '', style = 'solid', newTab = null } = {}) {
        const item = document.createElement('span');
        item.className = 'btn-item';
        item.dataset.style = style === 'ghost' ? 'ghost' : 'solid';
        item.dataset.href = href;
        const automatic = newTab === null;
        item.dataset.newtab = (automatic ? isExternal(normalizeUrl(href)) : newTab) ? '1' : '0';
        item.dataset.auto = automatic ? '1' : '0';
        const labelEl = document.createElement('span');
        labelEl.className = 'btn-label';
        makeEditable(labelEl, 'button');
        labelEl.setAttribute('data-ph', BUTTON_LABEL);
        labelEl.setAttribute('spellcheck', 'false');
        labelEl.textContent = label;
        item.append(labelEl);
        return item;
    }

    function buttonsBlock(items = [{}]) {
        const blk = shell('buttons');
        blk.innerHTML = `<div class="btn-row"><button type="button" class="btn-add" data-act="btn-add">+ 버튼</button></div>${BUTTON_EDITOR}`;
        const add = blk.querySelector('.btn-add');
        items.forEach(item => add.before(buttonItem(item)));
        blk.querySelector('.btn-item')?.classList.add('is-current');
        syncButtons(blk);
        return blk;
    }

    function buttonsFromAnchors(anchors) {
        return buttonsBlock(anchors.map(anchor => ({
            label: anchor.textContent.replace(/\s+/g, ' ').trim() || BUTTON_LABEL,
            href: anchor.getAttribute('href') || anchor.getAttribute('data-href') || '',
            style: anchor.getAttribute('data-style') === 'ghost' ? 'ghost' : 'solid',
            newTab: anchor.getAttribute('target') === '_blank'
        })));
    }

    function isButtonRow(el) {
        const children = [...el.children];
        return children.length > 0 && children.every(child => child.matches('a.post-button'))
            && [...el.childNodes].every(node => node.nodeType !== Node.TEXT_NODE || !node.textContent.trim());
    }

    function currentButton(blk) {
        return blk.querySelector('.btn-item.is-current') || blk.querySelector('.btn-item');
    }

    function setCurrentButton(blk, item) {
        if (!item) return;
        blk.querySelectorAll('.btn-item.is-current').forEach(other => { if (other !== item) other.classList.remove('is-current'); });
        item.classList.add('is-current');
        syncButtons(blk);
    }

    // The editing strip shows the current button; values are mirrored into attributes so undo keeps them.
    function syncButtons(blk) {
        const items = [...blk.querySelectorAll('.btn-item')];
        items.forEach(item => item.classList.toggle('is-invalid', !normalizeUrl(item.dataset.href)));
        const item = currentButton(blk);
        if (!item) return;
        item.classList.add('is-current');
        const raw = (item.dataset.href || '').trim();
        const href = normalizeUrl(raw);
        const input = blk.querySelector('.btn-url');
        if (document.activeElement !== input) input.value = item.dataset.href || '';
        input.setAttribute('value', item.dataset.href || '');
        input.setAttribute('aria-invalid', String(!!raw && !href));
        blk.querySelectorAll('[data-act="btn-style"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === item.dataset.style)));
        const box = blk.querySelector('.btn-newtab-input');
        box.checked = item.dataset.newtab === '1';
        box.toggleAttribute('checked', box.checked);
        blk.querySelector('.btn-hint').textContent = !raw
            ? '주소를 넣어야 버튼이 발행됩니다.'
            : !href ? 'http(s)://, mailto:, ?post=17, ./info.html 같은 주소만 쓸 수 있습니다.'
                : href !== raw ? `${href} 로 연결됩니다.` : '';
        blk.querySelector('[data-act="btn-remove"]').textContent = items.length > 1 ? '이 버튼 삭제' : '블록 삭제';
    }

    function serializeButtons(blk, draft) {
        const parts = [...blk.querySelectorAll('.btn-item')].map(item => {
            const raw = (item.dataset.href || '').trim();
            const href = normalizeUrl(raw);
            if (!href && !draft) return '';
            const label = item.querySelector('.btn-label').textContent.replace(/\s+/g, ' ').trim() || BUTTON_LABEL;
            const style = item.dataset.style === 'ghost' ? 'ghost' : 'solid';
            const newTab = item.dataset.newtab === '1';
            // A draft keeps an unfinished or refused address as data only, never as a live link.
            const target = href ? `href="${esc(href)}"` : `href="" data-href="${esc(raw)}"`;
            return `<a class="post-button" data-style="${style}" ${target}${newTab ? ' target="_blank" rel="noopener"' : ''}>${esc(label)}</a>`;
        }).filter(Boolean);
        return parts.length ? `<p class="post-button-row">${parts.join(' ')}</p>` : '';
    }

    function mediaBar() {
        return `<div class="media-bar" role="toolbar" aria-label="이미지 블록">
            <div class="media-layouts" role="group" aria-label="레이아웃">${LAYOUTS.map(layout => `<button type="button" data-layout-set="${layout}" aria-pressed="false">${LAYOUT_LABEL[layout]}</button>`).join('')}</div>
            <button type="button" class="media-bar-btn" data-act="add-images">이미지 추가</button>
            <button type="button" class="media-bar-btn" data-act="delete-block">블록 삭제</button>
        </div>`;
    }

    // cls: a string (even an empty one) is the picture's own class from stored HTML and is kept as
    // it was; null means a new picture, which takes the layout's class (big / mini / story-img).
    function mediaItem({ src = '', alt = '', cls = null, attrs = null, uploadId = '' } = {}) {
        const item = document.createElement('div');
        item.className = 'media-item';
        if (typeof cls === 'string') item.dataset.class = cls;
        if (attrs && attrs.length) item.dataset.attrs = JSON.stringify(attrs);
        item.innerHTML = `<img alt="" draggable="false"><span class="media-item-alt"></span><span class="media-item-progress" aria-hidden="true"></span>
            <div class="media-item-tools"><button type="button" data-act="alt">설명</button><button type="button" data-act="replace">바꾸기</button><button type="button" data-act="remove-image">삭제</button></div>`;
        const img = item.querySelector('img');
        if (src) img.setAttribute('src', src);
        img.setAttribute('alt', alt || '');
        item.querySelector('.media-item-alt').textContent = alt || '';
        if (uploadId) {
            item.classList.add('is-uploading');
            item.dataset.upload = uploadId;
        }
        return item;
    }

    function mediaBlock(layout = 'single', images = [], { caption = '', figureAttrs = null } = {}) {
        const blk = shell('media');
        blk.tabIndex = -1;
        blk.dataset.layout = LAYOUTS.includes(layout) ? layout : 'single';
        if (figureAttrs) blk.dataset.figure = JSON.stringify(figureAttrs);
        blk.innerHTML = `${mediaBar()}<div class="media-grid"></div>
            <button type="button" class="media-empty" data-act="pick"><span class="media-empty-title">이미지를 끌어다 놓거나 눌러서 고르세요</span><span class="media-empty-hint">여러 장도 한 번에 넣을 수 있습니다</span></button>
            <div class="media-caption"></div>`;
        const captionEl = blk.querySelector('.media-caption');
        makeEditable(captionEl, 'caption');
        captionEl.setAttribute('data-ph', '캡션 (선택)');
        captionEl.innerHTML = caption || '';
        const grid = blk.querySelector('.media-grid');
        images.forEach(image => grid.append(mediaItem(image)));
        syncMedia(blk);
        return blk;
    }

    function syncMedia(blk) {
        const items = blk.querySelectorAll('.media-item');
        blk.classList.toggle('is-empty-media', !items.length);
        blk.querySelectorAll('[data-layout-set]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layoutSet === blk.dataset.layout)));
        const caption = blk.querySelector('.media-caption');
        blk.classList.toggle('has-caption', !!caption && !isBlank(caption));
        blk.style.setProperty('--media-count', String(Math.max(1, items.length)));
    }

    /* ---------- reading stored HTML ---------- */
    function imageData(img) {
        return {
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
            cls: img.getAttribute('class') || '',
            attrs: attrsOf(img, ['src', 'alt', 'class', 'style', ...EDITOR_ATTRS])
        };
    }

    function onlyImages(el, allowed = 'IMG,BR') {
        const ok = allowed.split(',');
        return [...el.childNodes].every(node => (node.nodeType === Node.TEXT_NODE && !node.textContent.replace(/[\s\u200B\u00a0]/g, '')) || (node.nodeType === Node.ELEMENT_NODE && ok.includes(node.tagName)) || node.nodeType === Node.COMMENT_NODE);
    }

    function layoutFromDropzone(value) {
        if (value === 'grid-2' || value === 'grid-3' || value === 'story') return value;
        return 'single';
    }

    function blockFromElement(el) {
        const tag = el.tagName;
        if (el.matches('img.hidden-thumbnail')) return null;
        if (/^H[1-6]$/.test(tag)) return isBlank(el) ? null : textBlock('heading', el);
        switch (tag) {
            case 'P': {
                if (isButtonRow(el)) return buttonsFromAnchors([...el.children]);
                const images = [...el.querySelectorAll('img')].filter(img => !img.classList.contains('hidden-thumbnail'));
                if (images.length && onlyImages(el)) {
                    return mediaBlock(images.length > 1 ? 'story' : 'single', images.map(imageData));
                }
                if (isBlank(el)) return null;
                return textBlock('paragraph', el);
            }
            case 'BLOCKQUOTE': return textBlock('quote', el);
            case 'UL': return textBlock('list', el);
            case 'OL': return el.classList.contains('post-principles') ? richBlock('principles', el) : textBlock('list', el);
            case 'PRE': return codeBlock(el);
            case 'HR': return dividerBlock(el);
            case 'IMG': return el.getAttribute('src') ? mediaBlock('single', [imageData(el)]) : null;
            case 'SECTION': return el.classList.contains('post-split-section') ? richBlock('split', el) : htmlBlock(el.outerHTML);
            case 'FIGURE': return figureBlock(el);
            case 'TABLE': return tableFromElement(el) || htmlBlock(el.outerHTML);
            case 'DIV': return divBlock(el);
            default: return htmlBlock(el.outerHTML);
        }
    }

    function divBlock(el) {
        if (el.classList.contains('in-editor-dropzone')) return mediaBlock(layoutFromDropzone(el.dataset.layout));
        if (el.classList.contains('note-box')) return textBlock('note', el);
        if (el.classList.contains('image-grid') && onlyImages(el)) {
            const images = [...el.querySelectorAll('img')].map(imageData);
            if (!images.length) return null;
            return mediaBlock(el.classList.contains('image-grid-3') ? 'grid-3' : 'grid-2', images);
        }
        if (el.classList.contains('story-slider')) {
            const images = [...el.querySelectorAll('.story-images img, img.story-img')].map(imageData);
            return images.length ? mediaBlock('story', images) : null;
        }
        const hasBlocks = [...el.children].some(child => !INLINE_TAGS.has(child.tagName));
        if (!hasBlocks && !el.getAttribute('class')) return isBlank(el) ? null : textBlock('paragraph', el);
        return htmlBlock(el.outerHTML);
    }

    function figureBlock(el) {
        const children = [...el.children];
        const caption = children.find(child => child.tagName === 'FIGCAPTION');
        const rest = children.filter(child => child !== caption);
        const figureAttrs = attrsOf(el, EDITOR_ATTRS);
        if (rest.length === 1 && rest[0].tagName === 'TABLE') {
            const table = tableFromElement(rest[0], caption?.innerHTML || '');
            if (table) return table;
        }
        if (rest.length === 1 && rest[0].matches('.image-grid') && onlyImages(rest[0])) {
            return mediaBlock(rest[0].classList.contains('image-grid-3') ? 'grid-3' : 'grid-2', [...rest[0].querySelectorAll('img')].map(imageData), { caption: caption?.innerHTML || '', figureAttrs });
        }
        if (rest.length === 1 && rest[0].matches('.story-slider')) {
            return mediaBlock('story', [...rest[0].querySelectorAll('.story-images img, img.story-img')].map(imageData), { caption: caption?.innerHTML || '', figureAttrs });
        }
        if (rest.length && rest.every(child => child.tagName === 'IMG' || (child.tagName === 'P' && child.querySelector('img') && onlyImages(child)))) {
            const images = rest.flatMap(child => child.tagName === 'IMG' ? [child] : [...child.querySelectorAll('img')]).map(imageData);
            return mediaBlock('single', images, { caption: caption?.innerHTML || '', figureAttrs });
        }
        return htmlBlock(el.outerHTML);
    }

    function parse(html) {
        const doc = new DOMParser().parseFromString(`<!doctype html><body>${html || ''}</body>`, 'text/html');
        const out = [];
        let inline = [];
        let looseButtons = [];
        const flush = () => {
            if (!inline.length) return;
            const p = document.createElement('p');
            inline.forEach(node => p.append(document.importNode(node, true)));
            inline = [];
            if (!isBlank(p)) out.push(textBlock('paragraph', p));
        };
        // A lone <a class="post-button"> (or several side by side) is a button block too.
        const flushButtons = () => {
            if (!looseButtons.length) return;
            out.push(buttonsFromAnchors(looseButtons));
            looseButtons = [];
        };
        [...doc.body.childNodes].forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.matches('a.post-button')) {
                flush();
                looseButtons.push(node);
                return;
            }
            if (node.nodeType === Node.TEXT_NODE && looseButtons.length && !node.textContent.trim()) return;
            flushButtons();
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.trim() || inline.length) inline.push(node);
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (INLINE_TAGS.has(node.tagName) && !(node.tagName === 'BR' && !inline.length)) {
                inline.push(node);
                return;
            }
            flush();
            if (node.tagName === 'BR') return;
            const blk = blockFromElement(node);
            if (blk) out.push(blk);
        });
        flush();
        flushButtons();
        return out;
    }

    /* ---------- writing HTML ---------- */
    function cleanClone(el) {
        const clone = el.cloneNode(true);
        [clone, ...clone.querySelectorAll('*')].forEach(node => EDITOR_ATTRS.forEach(name => node.removeAttribute(name)));
        clone.querySelectorAll('.is-selected-block').forEach(node => node.classList.remove('is-selected-block'));
        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) walker.currentNode.textContent = walker.currentNode.textContent.replace(/[\u200B\uFEFF]/g, '');
        return clone;
    }

    function serializeText(blk) {
        const el = editableOf(blk);
        if (!el || isBlank(el)) return '';
        const clone = cleanClone(el);
        if (typeOf(blk) !== 'list') stripTrailingBreak(clone);
        clone.querySelectorAll('li').forEach(li => stripTrailingBreak(li));
        if (typeOf(blk) === 'list') [...clone.querySelectorAll('li')].forEach(li => { if (isBlank(li) && !li.querySelector('ul,ol')) li.remove(); });
        if (typeOf(blk) === 'list' && !clone.querySelector('li')) return '';
        return clone.outerHTML;
    }

    function serializeCode(blk) {
        const pre = editableOf(blk);
        const text = pre.textContent.replace(/\n$/, '');
        if (!text.trim()) return '';
        const preAttrs = attrsOf(pre, EDITOR_ATTRS);
        const codeAttrs = readJson(blk.dataset.codeAttrs, []);
        return `<pre${attrString(preAttrs)}><code${attrString(codeAttrs)}>${esc(text)}</code></pre>`;
    }

    function mediaImages(blk) {
        const layout = blk.dataset.layout || 'single';
        return [...blk.querySelectorAll('.media-item')].map(item => {
            const img = item.querySelector('img');
            const src = item.classList.contains('is-uploading') ? (item.dataset.prevSrc || '') : (img.getAttribute('src') || '');
            const cls = item.dataset.class !== undefined ? item.dataset.class : LAYOUT_CLASS[layout];
            return { src, alt: img.getAttribute('alt') || '', cls, attrs: readJson(item.dataset.attrs, []) };
        }).filter(image => image.src && !image.src.startsWith('blob:'));
    }

    function storyHtml(images) {
        const segments = images.map((_, index) => `<div class="story-segment${index === 0 ? ' active' : ''}"><div class="story-segment-fill"></div></div>`).join('');
        const pictures = images.map(image => `<img class="story-img" src="${esc(image.src)}" alt="${esc(image.alt)}">`).join('');
        return `<div class="story-slider"><div class="story-progress">${segments}</div><div class="story-images">${pictures}</div><div class="story-controls"><button class="story-btn story-prev">${STORY_PREV}</button><button class="story-btn story-zoom">${STORY_ZOOM}</button><button class="story-btn story-next">${STORY_NEXT}</button></div></div>`;
    }

    function serializeMedia(blk, draft) {
        const layout = blk.dataset.layout || 'single';
        const images = mediaImages(blk);
        if (!images.length) return draft ? `<div class="in-editor-dropzone" data-layout="${layout === 'single' ? 'big' : layout}"></div>` : '';
        const tag = image => `<img${image.cls ? ` class="${esc(image.cls)}"` : ''} src="${esc(image.src)}" alt="${esc(image.alt)}"${attrString(image.attrs)}>`;
        let inner;
        if (layout === 'story') inner = storyHtml(images);
        else if (layout === 'grid-2' || layout === 'grid-3') inner = `<div class="image-grid image-grid-${layout.slice(-1)}">${images.map(tag).join('')}</div>`;
        else inner = images.map(tag).join('\n');
        const captionEl = blk.querySelector('.media-caption');
        let caption = '';
        if (captionEl && !isBlank(captionEl)) {
            const clone = cleanClone(captionEl);
            stripTrailingBreak(clone);
            caption = clone.innerHTML.trim();
        }
        const figure = readJson(blk.dataset.figure, null);
        if (!caption && !figure) return inner;
        return `<figure${attrString(figure || [])}>${inner}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }

    function serializeBlock(blk, draft) {
        switch (typeOf(blk)) {
            case 'paragraph': case 'heading': case 'quote': case 'note': case 'list': return serializeText(blk);
            case 'code': return serializeCode(blk);
            case 'divider': return cleanClone(blk.querySelector('hr')).outerHTML;
            case 'media': return serializeMedia(blk, draft);
            case 'table': return serializeTable(blk, draft);
            case 'buttons': return serializeButtons(blk, draft);
            case 'split': case 'principles': {
                const el = editableOf(blk);
                return isBlank(el) ? '' : cleanClone(el).outerHTML;
            }
            case 'html': return blk.querySelector('.blk-html-view')?.innerHTML.trim() || '';
            default: return '';
        }
    }

    function getHtml({ draft = false } = {}) {
        return blocks().map(blk => serializeBlock(blk, draft)).filter(Boolean).join('\n');
    }

    /* ---------- document state ---------- */
    function refreshEmpty(blk) {
        if (!blk) return;
        const el = editableOf(blk);
        if (el && !['media', 'table', 'buttons'].includes(typeOf(blk))) blk.classList.toggle('is-empty', isBlank(el));
    }

    function refreshDocState() {
        if (!root) return;
        const all = blocks();
        const onlyEmpty = all.length === 1 && typeOf(all[0]) === 'paragraph' && all[0].classList.contains('is-empty');
        root.classList.toggle('is-doc-empty', onlyEmpty);
        all.forEach(blk => {
            if (typeOf(blk) !== 'paragraph') return;
            const el = editableOf(blk);
            el.setAttribute('data-ph', onlyEmpty ? (root.dataset.placeholder || PLACEHOLDER.paragraph) : PLACEHOLDER.paragraph);
        });
    }

    function refreshAll() {
        blocks().forEach(blk => {
            refreshEmpty(blk);
            if (typeOf(blk) === 'media') syncMedia(blk);
            if (typeOf(blk) === 'table') syncTable(blk);
            if (typeOf(blk) === 'buttons') syncButtons(blk);
        });
        refreshDocState();
    }

    function emitChange() {
        clearTimeout(changeTimer);
        changeTimer = setTimeout(() => {
            refreshDocState();
            options.onChange?.();
        }, 60);
    }

    function ensureTrailingParagraph() {
        const last = blocks().pop();
        if (!last || !['paragraph'].includes(typeOf(last))) root.append(paragraph());
    }

    /* ---------- history ---------- */
    const history = { undo: [], redo: [], burst: false, timer: null };

    function caretInfo() {
        const active = document.activeElement;
        if (!active || !root.contains(active)) return activeBlock ? { id: activeBlock.dataset.id } : null;
        const blk = active.closest('.blk');
        if (!blk) return null;
        const editable = active.closest('[data-editable]');
        return { id: blk.dataset.id, offset: editable ? caretOffset(editable) : null, caption: !!editable?.classList.contains('media-caption') };
    }

    function snapshot() {
        return { html: root.innerHTML, caret: caretInfo() };
    }

    function endBurst() {
        history.burst = false;
        clearTimeout(history.timer);
    }

    function checkpoint() {
        endBurst();
        const snap = snapshot();
        const top = history.undo[history.undo.length - 1];
        if (top && top.html === snap.html) return;
        history.undo.push(snap);
        if (history.undo.length > 150) history.undo.shift();
        history.redo.length = 0;
    }

    function restore(snap) {
        root.innerHTML = snap.html;
        root.querySelectorAll('.is-active, .is-dragging, .is-picked, .is-drop-target, .is-lifted').forEach(el => el.classList.remove('is-active', 'is-dragging', 'is-picked', 'is-drop-target', 'is-lifted'));
        activeBlock = null;
        reconcileUploads();
        refreshAll();
        const blk = snap.caret && root.querySelector(`.blk[data-id="${snap.caret.id}"]`);
        if (blk) {
            const editable = snap.caret.caption ? blk.querySelector('.media-caption') : editableOf(blk);
            if (editable && snap.caret.offset != null && typeOf(blk) !== 'media') setCaret(editable, snap.caret.offset);
            else if (editable && snap.caret.caption) setCaret(editable, snap.caret.offset ?? 'end');
            else selectBlock(blk);
        }
        hideSelectionBar();
        closeMenu();
        emitChange();
    }

    function undo() {
        endBurst();
        let previous = history.undo.pop();
        const current = snapshot();
        while (previous && previous.html === current.html) previous = history.undo.pop();
        if (!previous) return false;
        history.redo.push(current);
        restore(previous);
        return true;
    }

    function redo() {
        endBurst();
        const next = history.redo.pop();
        if (!next) return false;
        history.undo.push(snapshot());
        restore(next);
        return true;
    }

    /* ---------- block operations ---------- */
    function setActive(blk) {
        if (activeBlock === blk) return;
        activeBlock?.classList.remove('is-active');
        activeBlock?.querySelectorAll('.is-picked').forEach(item => item.classList.remove('is-picked'));
        activeBlock = blk && root.contains(blk) ? blk : null;
        activeBlock?.classList.add('is-active');
        if (activeBlock) lastActiveBlock = activeBlock;
        placeGutter();
    }

    // The block the dock tools act on: the one in use, or the one last used, or the end of the text.
    function currentBlock() {
        if (activeBlock && root.contains(activeBlock)) return activeBlock;
        if (lastActiveBlock && root.contains(lastActiveBlock)) return lastActiveBlock;
        return blocks().pop() || null;
    }

    function selectBlock(blk) {
        if (!blk) return;
        if (isTextual(blk) && typeOf(blk) !== 'divider') {
            setCaret(lastEditable(blk), 'end');
            return;
        }
        blk.focus({ preventScroll: true });
        setActive(blk);
        const rect = blk.getBoundingClientRect();
        const top = (options.topInset?.() || 0) + 16;
        if (rect.top < top || rect.top > window.innerHeight - 80) window.scrollBy({ top: rect.top - top - 40 });
    }

    // Leave text editing and hold the whole block, so the keyboard can move or delete it.
    function frameBlock(blk) {
        if (!blk) return;
        if (!blk.hasAttribute('tabindex')) blk.tabIndex = -1;
        window.getSelection()?.removeAllRanges();
        blk.focus({ preventScroll: true });
        setActive(blk);
    }

    function focusStartOf(blk) {
        if (!blk) return;
        if (isTextual(blk)) setCaret(editableOf(blk), 'start');
        else selectBlock(blk);
    }

    function focusEndOf(blk) {
        if (!blk) return;
        if (isTextual(blk)) setCaret(lastEditable(blk), 'end');
        else selectBlock(blk);
    }

    function insertAfter(ref, blk, { animate = true } = {}) {
        if (ref && ref.parentNode === root) ref.after(blk);
        else root.append(blk);
        if (animate) animateIn(blk);
        refreshEmpty(blk);
        return blk;
    }

    function placeNew(target, blk) {
        if (target && typeOf(target) === 'paragraph' && target.classList.contains('is-empty')) {
            target.replaceWith(blk);
            animateIn(blk);
        } else {
            insertAfter(target, blk);
        }
        return blk;
    }

    function removeBlock(blk, { focus = 'previous' } = {}) {
        if (!blk || blk.parentNode !== root) return;
        const previous = blk.previousElementSibling;
        const next = blk.nextElementSibling;
        if (activeBlock === blk) setActive(null);
        flip(() => blk.remove());
        if (!blocks().length) root.append(paragraph());
        if (focus === 'previous') (previous ? focusEndOf(previous) : focusStartOf(next || root.firstElementChild));
        else if (focus === 'next') (next ? focusStartOf(next) : focusEndOf(previous || root.firstElementChild));
        emitChange();
    }

    function moveBlock(blk, direction) {
        const sibling = direction < 0 ? blk.previousElementSibling : blk.nextElementSibling;
        if (!sibling) return;
        checkpoint();
        const editable = document.activeElement?.closest?.('[data-editable]');
        const offset = editable && blk.contains(editable) ? caretOffset(editable) : null;
        flip(() => (direction < 0 ? sibling.before(blk) : sibling.after(blk)));
        if (editable && blk.contains(editable)) setCaret(editable, offset);
        else selectBlock(blk);
        placeGutter();
        emitChange();
    }

    function duplicateBlock(blk) {
        checkpoint();
        const copy = blk.cloneNode(true);
        copy.dataset.id = uid();
        copy.classList.remove('is-active', 'is-dragging');
        copy.querySelectorAll('.media-item.is-uploading').forEach(item => item.remove());
        insertAfter(blk, copy);
        if (typeOf(copy) === 'media') syncMedia(copy);
        selectBlock(copy);
        emitChange();
    }

    function contentForConversion(blk) {
        const el = editableOf(blk);
        const type = typeOf(blk);
        if (type === 'code') return [esc(el.textContent).replace(/\n/g, '<br>')];
        if (type === 'list') return [...el.querySelectorAll(':scope > li')].map(li => li.innerHTML);
        return [el.innerHTML];
    }

    function convertBlock(blk, target, { level = 2, ordered = false, clear = false } = {}) {
        if (!blk || !root.contains(blk)) return null;
        checkpoint();
        const el = editableOf(blk);
        const hadFocus = el && el.contains(document.activeElement) || document.activeElement === el;
        const offset = hadFocus ? caretOffset(el) : 'end';
        const parts = clear ? [''] : contentForConversion(blk);
        let created = [];
        if (target === 'list') {
            created = [textBlock('list', { tag: ordered ? 'ol' : 'ul', html: parts.map(part => `<li>${part || '<br>'}</li>`).join('') })];
        } else if (target === 'code') {
            const holder = document.createElement('div');
            holder.innerHTML = parts.join('<br>').replace(/<br\s*\/?>/gi, '\n');
            created = [codeBlock({ text: holder.textContent })];
        } else if (target === 'heading') {
            created = [heading(level, parts.join('<br>'))];
        } else if (target === 'quote') {
            created = [textBlock('quote', { tag: 'blockquote', html: parts.join('<br>') })];
        } else if (target === 'note') {
            created = [textBlock('note', { tag: 'div', html: parts.join('<br>') })];
        } else {
            created = parts.map(part => paragraph(part));
        }
        blk.replaceWith(...created);
        if (activeBlock === blk) activeBlock = null;
        created.forEach(refreshEmpty);
        const focusTarget = editableOf(created[0]);
        setCaret(focusTarget, clear ? 'start' : offset);
        emitChange();
        return created[0];
    }

    function splitBlock(blk) {
        const el = editableOf(blk);
        const range = selectionRange();
        if (!el || !range) return;
        checkpoint();
        if (!range.collapsed) range.deleteContents();
        const atStart = caretOffset(el) === 0 && !isBlank(el);
        if (atStart) {
            const fresh = paragraph();
            blk.before(fresh);
            animateIn(fresh);
            setCaret(el, 'start');
            emitChange();
            return;
        }
        const tail = document.createRange();
        tail.setStart(range.startContainer, range.startOffset);
        tail.setEnd(el, el.childNodes.length);
        const fragment = tail.extractContents();
        const next = paragraph();
        const nextEl = editableOf(next);
        nextEl.innerHTML = '';
        nextEl.append(fragment);
        stripTrailingBreak(el);
        fixEmpty(el);
        if (isBlank(nextEl)) nextEl.innerHTML = '<br>';
        refreshEmpty(blk);
        insertAfter(blk, next, { animate: false });
        setCaret(nextEl, 'start');
        emitChange();
    }

    function mergeTarget(blk) {
        if (!blk) return null;
        if (MERGEABLE.has(typeOf(blk))) return editableOf(blk);
        if (typeOf(blk) === 'list') return editableOf(blk).querySelector(':scope > li:last-child');
        return null;
    }

    function mergeWithPrevious(blk) {
        const previous = blk.previousElementSibling;
        const el = editableOf(blk);
        if (!previous) return false;
        const target = mergeTarget(previous);
        if (!target) {
            if (isBlank(el)) {
                checkpoint();
                removeBlock(blk, { focus: 'previous' });
            } else {
                selectBlock(previous);
            }
            return true;
        }
        checkpoint();
        const offset = textLength(target);
        stripTrailingBreak(target);
        if (!isBlank(el)) {
            const range = document.createRange();
            range.selectNodeContents(el);
            const fragment = range.extractContents();
            target.append(fragment);
        }
        fixEmpty(target);
        if (activeBlock === blk) activeBlock = null;
        blk.remove();
        refreshEmpty(previous);
        setCaret(target, offset);
        emitChange();
        return true;
    }

    function mergeNext(blk) {
        const next = blk.nextElementSibling;
        if (!next) return false;
        const el = editableOf(blk);
        if (!MERGEABLE.has(typeOf(next))) {
            if (isBlank(el) && typeOf(blk) === 'paragraph') {
                checkpoint();
                removeBlock(blk, { focus: 'next' });
                return true;
            }
            selectBlock(next);
            return true;
        }
        checkpoint();
        const offset = textLength(el);
        stripTrailingBreak(el);
        const nextEl = editableOf(next);
        if (!isBlank(nextEl)) {
            const range = document.createRange();
            range.selectNodeContents(nextEl);
            el.append(range.extractContents());
        }
        fixEmpty(el);
        next.remove();
        refreshEmpty(blk);
        setCaret(el, offset);
        emitChange();
        return true;
    }

    /* ---------- lists ---------- */
    function currentListItem(listEl) {
        const range = selectionRange();
        let node = range?.startContainer;
        if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
        const li = node?.closest?.('li');
        return li && listEl.contains(li) ? li : null;
    }

    function exitList(blk, li) {
        checkpoint();
        const listEl = editableOf(blk);
        const nested = li.parentElement !== listEl;
        if (nested) {
            document.execCommand('outdent');
            emitChange();
            return;
        }
        const after = [];
        let sibling = li.nextElementSibling;
        while (sibling) { after.push(sibling); sibling = sibling.nextElementSibling; }
        li.remove();
        const fresh = paragraph();
        if (!listEl.querySelector('li')) blk.replaceWith(fresh);
        else insertAfter(blk, fresh, { animate: false });
        if (after.length) {
            const rest = textBlock('list', { tag: listEl.tagName.toLowerCase(), html: '' });
            const restEl = editableOf(rest);
            restEl.innerHTML = '';
            after.forEach(item => restEl.append(item));
            fresh.after(rest);
        }
        if (activeBlock === blk) activeBlock = null;
        setCaret(editableOf(fresh), 'start');
        emitChange();
    }

    function liftFirstItem(blk, li) {
        checkpoint();
        const listEl = editableOf(blk);
        const fresh = paragraph(li.innerHTML);
        li.remove();
        blk.before(fresh);
        if (!listEl.querySelector('li')) blk.remove();
        setCaret(editableOf(fresh), 'start');
        emitChange();
    }

    /* ---------- numbered principles ---------- */
    function principleItem() {
        const item = document.createElement('li');
        item.innerHTML = '<div class="principle-copy"><p class="principle-title"><strong>새 원칙의 제목</strong></p><p>원칙에 대한 설명을 입력하세요.</p></div>';
        return item;
    }

    function principleRun(blk, action) {
        const list = editableOf(blk);
        const range = selectionRange();
        let node = range?.startContainer;
        if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
        const current = node?.closest?.('.post-principles > li');
        const item = current && list.contains(current) ? current : null;
        checkpoint();
        if (action === 'add') {
            const fresh = principleItem();
            if (item) item.after(fresh); else list.append(fresh);
            setCaret(fresh.querySelector('.principle-title'), 'start');
        } else if (action === 'remove') {
            if (!item) return;
            if (list.children.length <= 1) { options.toast?.('번호 목록에는 최소 한 개의 항목이 필요합니다. 전체를 지우려면 블록을 삭제하세요.'); return; }
            const focus = item.nextElementSibling || item.previousElementSibling;
            item.remove();
            setCaret(focus?.querySelector('.principle-title') || list, 'start');
        } else if (item) {
            const sibling = action === 'up' ? item.previousElementSibling : item.nextElementSibling;
            if (!sibling) return;
            const offset = caretOffset(item);
            flip(() => (action === 'up' ? sibling.before(item) : sibling.after(item)), list);
            setCaret(item, offset);
        }
        emitChange();
    }

    /* ---------- inline formatting ---------- */
    function closestEditable(node) {
        if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
        const el = node?.closest?.('[data-editable]');
        return el && root.contains(el) ? el : null;
    }

    function closestClassSpan(range, cls) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        const span = node?.closest?.(`span.${cls}`);
        return span && closestEditable(span) ? span : null;
    }

    function unwrap(el) {
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
        parent.normalize();
    }

    function toggleClass(cls) {
        const range = selectionRange();
        if (!range || range.collapsed || !closestEditable(range.commonAncestorContainer)) return;
        checkpoint();
        const existing = closestClassSpan(range, cls);
        const selection = window.getSelection();
        if (existing) {
            const marker = document.createRange();
            marker.selectNodeContents(existing);
            const first = existing.firstChild;
            const last = existing.lastChild;
            unwrap(existing);
            if (first && last) {
                const fresh = document.createRange();
                fresh.setStartBefore(first);
                fresh.setEndAfter(last);
                selection.removeAllRanges();
                selection.addRange(fresh);
            }
        } else {
            const span = document.createElement('span');
            span.className = cls;
            span.append(range.extractContents());
            span.querySelectorAll(`span.${cls}`).forEach(unwrap);
            range.insertNode(span);
            const fresh = document.createRange();
            fresh.selectNodeContents(span);
            selection.removeAllRanges();
            selection.addRange(fresh);
        }
        emitChange();
        updateSelectionBar();
    }

    function clearFormatting() {
        const range = selectionRange();
        if (!range || !closestEditable(range.commonAncestorContainer)) return;
        checkpoint();
        document.execCommand('removeFormat', false, null);
        document.execCommand('unlink', false, null);
        const fresh = selectionRange();
        if (fresh) {
            let container = fresh.commonAncestorContainer;
            if (container.nodeType === Node.TEXT_NODE) container = container.parentElement;
            const editable = closestEditable(container);
            const spans = [...(editable || container).querySelectorAll('span')].filter(span => fresh.intersectsNode(span) && (INLINE_CLASSES.some(cls => span.classList.contains(cls)) || span.style.fontSize));
            spans.forEach(unwrap);
            const wrapper = container.closest('span');
            if (wrapper && editable && editable.contains(wrapper) && (INLINE_CLASSES.some(cls => wrapper.classList.contains(cls)) || wrapper.style.fontSize)) unwrap(wrapper);
        }
        emitChange();
        updateSelectionBar();
    }

    function runInline(command) {
        const range = selectionRange();
        if (!range || !closestEditable(range.commonAncestorContainer)) return;
        checkpoint();
        document.execCommand(command, false, null);
        emitChange();
        updateSelectionBar();
    }

    /* ---------- selection toolbar ---------- */
    function buildSelectionBar() {
        const bar = document.createElement('div');
        bar.className = 'sel-bar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', '글자 서식');
        bar.innerHTML = `<div class="sel-bar-main">
                <button type="button" data-cmd="bold" class="sel-glyph" aria-label="굵게" data-tip="굵게" data-key="Mod+B"><b>B</b></button>
                <button type="button" data-cmd="italic" class="sel-glyph" aria-label="기울임" data-tip="기울임" data-key="Mod+I"><i>I</i></button>
                <button type="button" data-cmd="underline" class="sel-glyph" aria-label="밑줄" data-tip="밑줄" data-key="Mod+U"><u>U</u></button>
                <button type="button" data-cmd="link" class="sel-glyph" aria-label="링크" data-tip="링크" data-key="Mod+K">${ICON.link}</button>
                <span class="sel-gap" aria-hidden="true"></span>
                <button type="button" data-cmd="high" data-tip="형광 강조">형광</button>
                <button type="button" data-cmd="lead-text" data-tip="리드 — 도입 문장을 크게">리드</button>
                <button type="button" data-cmd="muted-text" data-tip="보조 — 흐리게">보조</button>
                <button type="button" data-cmd="chip-blue" data-tip="칩 — 작은 꼬리표">칩</button>
                <span class="sel-gap" aria-hidden="true"></span>
                <button type="button" data-cmd="clear" class="sel-glyph" aria-label="서식 지우기" data-tip="서식 지우기">${ICON.clear}</button>
            </div>
            <form class="sel-bar-link" novalidate>
                <input type="text" inputmode="url" placeholder="링크 주소 (https://…)" aria-label="링크 주소" autocomplete="off" spellcheck="false">
                <button type="submit">적용</button>
                <button type="button" data-cmd="unlink">해제</button>
            </form>`;
        document.body.append(bar);
        bar.addEventListener('mousedown', event => {
            if (event.target.closest('button')) event.preventDefault();
        });
        bar.addEventListener('click', event => {
            const button = event.target.closest('button[data-cmd]');
            if (!button) return;
            const command = button.dataset.cmd;
            if (command === 'link') return openLinkInput();
            if (command === 'unlink') return applyLink('');
            if (command === 'clear') return clearFormatting();
            if (INLINE_CLASSES.includes(command)) return toggleClass(command);
            runInline(command);
        });
        bar.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            applyLink(bar.querySelector('input').value.trim());
        });
        bar.querySelector('input').addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeLinkInput(true);
            }
        });
        ui.selbar = bar;
    }

    function selectionContext() {
        const range = selectionRange();
        if (!range || range.collapsed) return null;
        const editable = closestEditable(range.commonAncestorContainer);
        if (!editable) return null;
        const blk = editable.closest('.blk');
        if (!blk || typeOf(blk) === 'code' || typeOf(blk) === 'buttons') return null;
        return { range, editable, blk };
    }

    let selectionFrame = 0;
    function scheduleSelectionBar() {
        cancelAnimationFrame(selectionFrame);
        selectionFrame = requestAnimationFrame(updateSelectionBar);
    }

    function updateSelectionBar() {
        const bar = ui.selbar;
        if (!bar || bar.classList.contains('is-linking')) return;
        const context = selectionContext();
        if (!context || dragState.active) return hideSelectionBar();
        const rect = context.range.getBoundingClientRect();
        if (!rect.width && !rect.height) return hideSelectionBar();
        bar.querySelectorAll('[data-cmd]').forEach(button => {
            const command = button.dataset.cmd;
            let on = false;
            if (['bold', 'italic', 'underline'].includes(command)) {
                try { on = document.queryCommandState(command); } catch (error) { on = false; }
            } else if (INLINE_CLASSES.includes(command)) {
                on = !!closestClassSpan(context.range, command);
            } else if (command === 'link') {
                let node = context.range.commonAncestorContainer;
                if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
                on = !!node?.closest?.('a');
            }
            button.classList.toggle('is-on', on);
            button.setAttribute('aria-pressed', String(on));
        });
        bar.classList.add('is-visible');
        positionFloating(bar, rect, { prefer: coarsePointer.matches ? 'below' : 'above' });
    }

    function hideSelectionBar() {
        if (!ui.selbar) return;
        ui.selbar.classList.remove('is-visible', 'is-linking');
    }

    let linkRange = null;
    function openLinkInput() {
        const context = selectionContext();
        if (!context) return;
        linkRange = context.range.cloneRange();
        let node = context.range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        const anchor = node?.closest?.('a');
        const bar = ui.selbar;
        bar.classList.add('is-linking');
        const input = bar.querySelector('input');
        input.value = anchor?.getAttribute('href') || '';
        bar.querySelector('[data-cmd="unlink"]').hidden = !anchor;
        bar.classList.add('is-visible');
        positionFloating(bar, context.range.getBoundingClientRect(), { prefer: coarsePointer.matches ? 'below' : 'above' });
        input.focus({ preventScroll: true });
        input.select();
    }

    function closeLinkInput(restoreSelection) {
        ui.selbar.classList.remove('is-linking');
        if (restoreSelection && linkRange) {
            const editable = closestEditable(linkRange.commonAncestorContainer);
            editable?.focus({ preventScroll: true });
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(linkRange);
        }
        linkRange = null;
        scheduleSelectionBar();
    }

    function applyLink(url) {
        if (!linkRange) {
            const context = selectionContext();
            if (!context) return;
            linkRange = context.range.cloneRange();
        }
        const editable = closestEditable(linkRange.commonAncestorContainer);
        if (!editable) return closeLinkInput(false);
        checkpoint();
        editable.focus({ preventScroll: true });
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(linkRange);
        if (url) {
            const href = /^(https?:|mailto:|tel:|\/|#|\.)/i.test(url) ? url : 'https://' + url;
            document.execCommand('createLink', false, href);
        } else {
            document.execCommand('unlink', false, null);
        }
        linkRange = selectionRange()?.cloneRange() || null;
        closeLinkInput(true);
        emitChange();
    }

    function positionFloating(el, rect, { prefer = 'below', gap = 10, align = 'center' } = {}) {
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        const topLimit = (options.topInset?.() || 0) + 8;
        const bottomLimit = window.innerHeight - (options.bottomInset?.() || 0) - 8;
        let top = prefer === 'above' ? rect.top - height - gap : rect.bottom + gap;
        if (prefer === 'above' && top < topLimit) top = rect.bottom + gap;
        if (prefer === 'below' && top + height > bottomLimit && rect.top - height - gap > topLimit) top = rect.top - height - gap;
        let left = align === 'start' ? rect.left : rect.left + rect.width / 2 - width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        el.style.left = `${Math.round(left)}px`;
        el.style.top = `${Math.round(top)}px`;
    }

    /* ---------- block menu: slash, plus, actions ---------- */
    const menu = { el: null, mode: null, items: [], filtered: [], index: 0, block: null, query: '' };

    function insertItems() {
        return [
            { group: '텍스트', id: 'p', glyph: '¶', label: '본문', keys: 'text paragraph 본문 텍스트 p', run: b => turnInto(b, 'paragraph') },
            { group: '텍스트', id: 'h1', glyph: 'H1', label: '제목 1', hint: '#', keys: 'heading h1 제목 섹션 title', run: b => turnInto(b, 'heading', { level: 1 }) },
            { group: '텍스트', id: 'h2', glyph: 'H2', label: '제목 2', hint: '##', keys: 'heading h2 제목 섹션 subtitle', run: b => turnInto(b, 'heading', { level: 2 }) },
            { group: '텍스트', id: 'h3', glyph: 'H3', label: '제목 3', hint: '###', keys: 'heading h3 소제목', run: b => turnInto(b, 'heading', { level: 3 }) },
            { group: '텍스트', id: 'ul', glyph: '•', label: '글머리 목록', hint: '-', keys: 'list bullet ul 목록 리스트', run: b => turnInto(b, 'list', { ordered: false }) },
            { group: '텍스트', id: 'ol', glyph: '1.', label: '번호 목록', hint: '1.', keys: 'list number ol 번호 목록', run: b => turnInto(b, 'list', { ordered: true }) },
            { group: '텍스트', id: 'quote', glyph: '“', label: '인용', hint: '>', keys: 'quote blockquote 인용', run: b => turnInto(b, 'quote') },
            { group: '텍스트', id: 'note', glyph: '✱', label: '노트', keys: 'note callout 노트 메모 강조', run: b => turnInto(b, 'note') },
            { group: '텍스트', id: 'code', glyph: '{ }', label: '코드', hint: '```', keys: 'code pre 코드', run: b => turnInto(b, 'code') },
            { group: '미디어', id: 'image', glyph: '▢', label: '이미지', keys: 'image photo img picture 이미지 사진', run: b => insertMedia(b, 'single') },
            { group: '미디어', id: 'grid-2', glyph: '▢▢', label: '이미지 2열', keys: 'grid 2 columns 그리드 2열 이미지', run: b => insertMedia(b, 'grid-2') },
            { group: '미디어', id: 'grid-3', glyph: '▢▢▢', label: '이미지 3열', keys: 'grid 3 columns 그리드 3열 이미지', run: b => insertMedia(b, 'grid-3') },
            { group: '미디어', id: 'story', glyph: '▭', label: '슬라이드', keys: 'story slider slide 스토리 슬라이드 넘기기', run: b => insertMedia(b, 'story') },
            { group: '구조', id: 'divider', glyph: '—', label: '구분선', hint: '---', keys: 'divider hr line rule 구분선 선', run: b => insertDivider(b) },
            { group: '구조', id: 'split', glyph: '▥', label: '2열 섹션', keys: 'split section 2열 섹션 column', run: b => insertSplit(b) },
            { group: '구조', id: 'principles', glyph: '01', label: '번호 원칙', keys: 'principles 원칙 번호 가치 values', run: b => insertPrinciples(b) },
            { group: '구조', id: 'table', glyph: '▦', label: '표', keys: 'table 표 grid sheet 테이블', run: b => insertTable(b) },
            { group: '구조', id: 'buttons', glyph: '→', label: '버튼', keys: 'button link cta 버튼 링크 바로가기', run: b => insertButtons(b) },
            { group: '구조', id: 'html', glyph: '</>', label: 'HTML', keys: 'html raw embed 원문 소스', run: b => insertHtmlBlock(b) }
        ];
    }

    function actionItems(blk) {
        const type = typeOf(blk);
        const items = [];
        if (MERGEABLE.has(type) || type === 'list' || type === 'code') {
            const turn = [
                ['paragraph', '¶', '본문', {}], ['heading', 'H1', '제목 1', { level: 1 }], ['heading', 'H2', '제목 2', { level: 2 }], ['heading', 'H3', '제목 3', { level: 3 }],
                ['list', '•', '글머리 목록', { ordered: false }], ['list', '1.', '번호 목록', { ordered: true }], ['quote', '“', '인용', {}], ['note', '✱', '노트', {}], ['code', '{ }', '코드', {}]
            ];
            const el = editableOf(blk);
            const currentLevel = type === 'heading' ? Number(el.tagName.slice(1)) : 0;
            const currentOrdered = type === 'list' && el.tagName === 'OL';
            turn.forEach(([target, glyph, label, opts]) => {
                const same = target === type && (target !== 'heading' || opts.level === currentLevel) && (target !== 'list' || opts.ordered === currentOrdered);
                items.push({ group: '바꾸기', glyph, label, current: same, run: b => { if (!same) convertBlock(b, target, opts); } });
            });
        }
        if (type === 'media') {
            LAYOUTS.forEach(layout => items.push({ group: '레이아웃', glyph: { single: '▢', 'grid-2': '▢▢', 'grid-3': '▢▢▢', story: '▭' }[layout], label: LAYOUT_LABEL[layout], current: blk.dataset.layout === layout, run: b => setLayout(b, layout) }));
            items.push({ group: '이미지', glyph: '+', label: '이미지 추가', run: b => pickFiles(b, 'add') });
        }
        if (type === 'html') items.push({ group: 'HTML', glyph: '</>', label: 'HTML 편집', run: b => editHtml(b) });
        if (type === 'table') {
            const header = blk.dataset.header === '1';
            items.push(
                { group: '표', glyph: '▤', label: header ? '머리 행 끄기' : '머리 행 켜기', run: b => tableRun(b, 'header') },
                { group: '표', glyph: '+', label: '행 추가', run: b => tableRun(b, 'row-add') },
                { group: '표', glyph: '+', label: '열 추가', run: b => tableRun(b, 'col-add') }
            );
        }
        if (type === 'buttons') items.push({ group: '버튼', glyph: '+', label: '버튼 추가', run: b => addButton(b) });
        items.push(
            { group: '블록', glyph: '↑', label: '위로 이동', hint: options.isMac ? '⌘⇧↑' : 'Ctrl Shift ↑', disabled: !blk.previousElementSibling, run: b => moveBlock(b, -1) },
            { group: '블록', glyph: '↓', label: '아래로 이동', hint: options.isMac ? '⌘⇧↓' : 'Ctrl Shift ↓', disabled: !blk.nextElementSibling, run: b => moveBlock(b, 1) },
            { group: '블록', glyph: '⧉', label: '복제', run: b => duplicateBlock(b) },
            { group: '블록', glyph: '×', label: '삭제', danger: true, run: b => { checkpoint(); removeBlock(b); } }
        );
        return items;
    }

    function buildMenu() {
        const el = document.createElement('div');
        el.className = 'blk-menu';
        el.setAttribute('role', 'listbox');
        el.setAttribute('aria-label', '블록');
        el.innerHTML = '<div class="blk-menu-scroll"></div><p class="blk-menu-empty">맞는 블록이 없습니다</p>';
        document.body.append(el);
        el.addEventListener('mousedown', event => event.preventDefault());
        el.addEventListener('click', event => {
            const button = event.target.closest('.blk-menu-item');
            if (!button || button.disabled) return;
            chooseMenuItem(Number(button.dataset.index));
        });
        el.addEventListener('pointermove', event => {
            const button = event.target.closest('.blk-menu-item');
            if (button && !button.disabled && Number(button.dataset.index) !== menu.index) {
                menu.index = Number(button.dataset.index);
                paintMenuIndex(false);
            }
        });
        menu.el = el;
    }

    function openMenu(mode, blk, anchorRect, query = '') {
        menu.mode = mode;
        menu.block = blk;
        menu.query = query;
        menu.items = mode === 'actions' ? actionItems(blk) : insertItems();
        renderMenu();
        menu.el.classList.add('is-open');
        menu.el.dataset.mode = mode;
        menu.anchor = anchorRect;
        positionFloating(menu.el, anchorRect, { prefer: 'below', gap: 6, align: 'start' });
        hideSelectionBar();
    }

    function renderMenu() {
        const query = menu.query.trim().toLowerCase();
        menu.filtered = menu.items.filter(item => !query || `${item.label} ${item.keys || ''} ${item.id || ''}`.toLowerCase().includes(query));
        const scroll = menu.el.querySelector('.blk-menu-scroll');
        let lastGroup = '';
        scroll.innerHTML = menu.filtered.map((item, index) => {
            const group = item.group !== lastGroup ? `<div class="blk-menu-group">${esc(item.group)}</div>` : '';
            lastGroup = item.group;
            return `${group}<button type="button" class="blk-menu-item${item.danger ? ' is-danger' : ''}${item.current ? ' is-current' : ''}" role="option" data-index="${index}"${item.disabled ? ' disabled' : ''}><span class="blk-menu-glyph">${esc(item.glyph)}</span><span class="blk-menu-label">${esc(item.label)}</span>${item.hint ? `<span class="blk-menu-hint">${esc(item.hint)}</span>` : ''}${item.current ? '<span class="blk-menu-hint">현재</span>' : ''}</button>`;
        }).join('');
        menu.el.classList.toggle('is-empty', !menu.filtered.length);
        menu.index = menu.filtered.findIndex(item => !item.disabled);
        paintMenuIndex(true);
    }

    function paintMenuIndex(scroll) {
        menu.el.querySelectorAll('.blk-menu-item').forEach(button => {
            const on = Number(button.dataset.index) === menu.index;
            button.classList.toggle('is-selected', on);
            button.setAttribute('aria-selected', String(on));
            if (on && scroll) button.scrollIntoView({ block: 'nearest' });
        });
    }

    function closeMenu() {
        if (!menu.el) return;
        menu.el.classList.remove('is-open');
        menu.mode = null;
        menu.block = null;
    }

    function chooseMenuItem(index) {
        const item = menu.filtered[index];
        const blk = menu.block;
        const mode = menu.mode;
        closeMenu();
        if (!item || !blk || !root.contains(blk)) return;
        if (mode === 'slash') {
            const el = editableOf(blk);
            checkpoint();
            el.innerHTML = '<br>';
            refreshEmpty(blk);
        }
        item.run(blk);
    }

    function menuKey(event) {
        if (!menu.mode) return false;
        const enabled = menu.filtered.map((item, index) => (item.disabled ? -1 : index)).filter(index => index >= 0);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!enabled.length) return true;
            const position = enabled.indexOf(menu.index);
            const next = event.key === 'ArrowDown' ? enabled[(position + 1) % enabled.length] : enabled[(position - 1 + enabled.length) % enabled.length];
            menu.index = next;
            paintMenuIndex(true);
            return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
            if (!menu.filtered.length) { closeMenu(); return false; }
            event.preventDefault();
            chooseMenuItem(menu.index);
            return true;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu();
            return true;
        }
        return false;
    }

    function turnInto(blk, target, opts = {}) {
        if (typeOf(blk) === 'paragraph' && blk.classList.contains('is-empty')) {
            return convertBlock(blk, target, { ...opts, clear: true });
        }
        checkpoint();
        let created;
        if (target === 'heading') created = heading(opts.level || 2);
        else if (target === 'list') created = textBlock('list', { tag: opts.ordered ? 'ol' : 'ul', html: '<li><br></li>' });
        else if (target === 'quote') created = textBlock('quote', { tag: 'blockquote', html: '' });
        else if (target === 'note') created = textBlock('note', { tag: 'div', html: '' });
        else if (target === 'code') created = codeBlock({ text: '' });
        else created = paragraph();
        insertAfter(blk, created);
        setCaret(editableOf(created), 'start');
        emitChange();
        return created;
    }

    function insertMedia(blk, layout) {
        checkpoint();
        const media = placeNew(blk, mediaBlock(layout));
        if (!media.nextElementSibling) insertAfter(media, paragraph(), { animate: false });
        selectBlock(media);
        emitChange();
        pickFiles(media, 'add');
        return media;
    }

    function insertDivider(blk) {
        checkpoint();
        const divider = placeNew(blk, dividerBlock());
        let next = divider.nextElementSibling;
        if (!next || !isTextual(next)) next = insertAfter(divider, paragraph(), { animate: false });
        focusStartOf(next);
        emitChange();
    }

    function insertStructure(blk, html, focusSelector) {
        checkpoint();
        const holder = document.createElement('div');
        holder.innerHTML = html.trim();
        const created = blockFromElement(holder.firstElementChild);
        placeNew(blk, created);
        if (!created.nextElementSibling) insertAfter(created, paragraph(), { animate: false });
        const target = editableOf(created).querySelector(focusSelector) || editableOf(created);
        setCaret(target, 'start');
        emitChange();
        return created;
    }

    function insertSplit(blk) {
        return insertStructure(blk, '<section class="post-split-section"><h2>섹션 제목</h2><div class="post-split-content"><p><strong>이 섹션의 핵심 문장을 입력하세요.</strong></p><p>오른쪽 본문 내용을 작성하세요.</p></div></section>', 'h2');
    }

    function insertPrinciples(blk) {
        return insertStructure(blk, '<ol class="post-principles"><li><div class="principle-copy"><p class="principle-title"><strong>첫 번째 원칙의 제목</strong></p><p>원칙에 대한 설명을 입력하세요.</p></div></li><li><div class="principle-copy"><p class="principle-title"><strong>두 번째 원칙의 제목</strong></p><p>원칙에 대한 설명을 입력하세요.</p></div></li></ol>', '.principle-title');
    }

    function selectContents(el) {
        el.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        revealCaret();
    }

    function insertTable(blk) {
        checkpoint();
        const table = placeNew(blk, tableBlock());
        if (!table.nextElementSibling) insertAfter(table, paragraph(), { animate: false });
        setCaret(editableOf(table), 'start');
        emitChange();
        return table;
    }

    function insertButtons(blk) {
        checkpoint();
        const buttons = placeNew(blk, buttonsBlock());
        if (!buttons.nextElementSibling) insertAfter(buttons, paragraph(), { animate: false });
        setActive(buttons);
        selectContents(buttons.querySelector('.btn-label'));
        emitChange();
        return buttons;
    }

    /* table editing */
    let lastTableCell = null;

    function activeCell(blk) {
        const active = document.activeElement;
        if (active && blk.contains(active) && active.matches('th, td')) return active;
        return lastTableCell && blk.contains(lastTableCell) ? lastTableCell : null;
    }

    function tableRun(blk, action) {
        const table = tableOf(blk);
        const head = table.tHead;
        const body = table.tBodies[0];
        const cell = activeCell(blk);
        const row = cell?.parentElement || null;
        const width = tableWidth(table);
        const column = cell ? cell.cellIndex : width - 1;
        if (action === 'row-remove') {
            if (!row) return options.toast?.('지울 행의 칸을 먼저 누르세요.');
            if (row.parentElement === body && body.rows.length <= 1) return options.toast?.('표에는 본문 행이 하나 이상 있어야 합니다.');
        }
        if (action === 'col-remove') {
            if (!cell) return options.toast?.('지울 열의 칸을 먼저 누르세요.');
            if (width <= 1) return options.toast?.('표에는 열이 하나 이상 있어야 합니다.');
        }
        checkpoint();
        let focus = null;
        if (action === 'header') {
            if (blk.dataset.header === '1') {
                const headRow = head.rows[0];
                if (headRow) {
                    const tr = document.createElement('tr');
                    [...headRow.cells].forEach(old => tr.append(tableCell('td', old.innerHTML)));
                    headRow.remove();
                    body.prepend(tr);
                    if (row === headRow) focus = tr.cells[column];
                }
                blk.dataset.header = '0';
            } else {
                const first = body.rows[0];
                const tr = document.createElement('tr');
                [...first.cells].forEach(old => tr.append(tableCell('th', old.innerHTML)));
                first.remove();
                head.append(tr);
                if (!body.rows.length) body.append(tableRow('td', width));
                if (row === first) focus = tr.cells[column];
                blk.dataset.header = '1';
            }
        } else if (action === 'row-add' || action === 'row-add-end') {
            const tr = tableRow('td', width);
            if (action === 'row-add-end' || !row) body.append(tr);
            else if (row.parentElement === head) body.prepend(tr);
            else row.after(tr);
            focus = tr.cells[action === 'row-add-end' ? 0 : Math.min(column, width - 1)];
        } else if (action === 'row-remove') {
            const columnIndex = Math.min(column, width - 1);
            if (row.parentElement === head) {
                row.remove();
                blk.dataset.header = '0';
                focus = body.rows[0]?.cells[columnIndex];
            } else {
                const neighbour = row.nextElementSibling || row.previousElementSibling || head.rows[0];
                row.remove();
                focus = neighbour?.cells[Math.min(columnIndex, neighbour.cells.length - 1)];
            }
        } else if (action === 'col-add') {
            [...table.rows].forEach(tr => {
                const fresh = tableCell(tr.parentElement === head ? 'th' : 'td');
                const reference = tr.cells[column];
                if (reference) reference.after(fresh); else tr.append(fresh);
                if (tr === row) focus = fresh;
            });
            if (!focus) focus = (body.rows[0] || head.rows[0])?.cells[column + 1] || null;
        } else if (action === 'col-remove') {
            [...table.rows].forEach(tr => tr.cells[column]?.remove());
            focus = row.cells[Math.min(column, row.cells.length - 1)];
        }
        syncTable(blk);
        if (focus) setCaret(focus, 'end');
        emitChange();
    }

    function tableNeighbour(cell, rowStep) {
        const rows = [...cell.closest('table').rows];
        const target = rows[rows.indexOf(cell.parentElement) + rowStep];
        return target ? target.cells[Math.min(cell.cellIndex, target.cells.length - 1)] || null : null;
    }

    /* button editing */
    function addButton(blk) {
        checkpoint();
        const hasSolid = [...blk.querySelectorAll('.btn-item')].some(item => item.dataset.style === 'solid');
        const item = buttonItem({ style: hasSolid ? 'ghost' : 'solid' });
        blk.querySelector('.btn-add').before(item);
        animateIn(item);
        setCurrentButton(blk, item);
        selectContents(item.querySelector('.btn-label'));
        emitChange();
    }

    function setButtonStyle(blk, style) {
        const item = currentButton(blk);
        if (!item || item.dataset.style === style) return;
        checkpoint();
        item.dataset.style = style === 'ghost' ? 'ghost' : 'solid';
        syncButtons(blk);
        emitChange();
    }

    function removeButton(blk) {
        const items = [...blk.querySelectorAll('.btn-item')];
        checkpoint();
        if (items.length <= 1) { removeBlock(blk); return; }
        const item = currentButton(blk);
        const next = item.previousElementSibling?.classList.contains('btn-item') ? item.previousElementSibling : item.nextElementSibling;
        item.remove();
        setCurrentButton(blk, next?.classList.contains('btn-item') ? next : blk.querySelector('.btn-item'));
        setCaret(currentButton(blk).querySelector('.btn-label'), 'end');
        emitChange();
    }

    function insertHtmlBlock(blk) {
        checkpoint();
        const created = placeNew(blk, htmlBlock(''));
        if (!created.nextElementSibling) insertAfter(created, paragraph(), { animate: false });
        editHtml(created);
        emitChange();
    }

    function editHtml(blk) {
        if (blk.querySelector('.blk-html-source')) return;
        const view = blk.querySelector('.blk-html-view');
        const editor = document.createElement('div');
        editor.className = 'blk-html-edit';
        editor.innerHTML = '<textarea class="blk-html-source" spellcheck="false" aria-label="HTML 원문"></textarea><div class="blk-html-actions"><button type="button" data-act="html-cancel">취소</button><button type="button" class="is-primary" data-act="html-apply">적용</button></div>';
        editor.querySelector('textarea').value = view.innerHTML.trim();
        blk.append(editor);
        blk.classList.add('is-editing-html');
        const area = editor.querySelector('textarea');
        area.style.height = Math.min(480, Math.max(140, area.scrollHeight + 4)) + 'px';
        area.focus();
    }

    function finishHtml(blk, apply) {
        const editor = blk.querySelector('.blk-html-edit');
        if (!editor) return;
        if (apply) {
            const value = editor.querySelector('textarea').value;
            editor.remove();
            blk.classList.remove('is-editing-html');
            checkpoint();
            const parsed = parse(value);
            const plainParts = parsed.every(part => typeOf(part) !== 'html');
            if (!value.trim()) {
                removeBlock(blk);
            } else if (plainParts && parsed.length) {
                blk.replaceWith(...parsed);
                parsed.forEach(animateIn);
                focusEndOf(parsed[parsed.length - 1]);
            } else {
                blk.querySelector('.blk-html-view').innerHTML = value;
                selectBlock(blk);
            }
            emitChange();
        } else {
            editor.remove();
            blk.classList.remove('is-editing-html');
            if (isBlank(blk.querySelector('.blk-html-view')) && !blk.querySelector('.blk-html-view').innerHTML.trim()) removeBlock(blk);
            else selectBlock(blk);
        }
    }

    /* ---------- media: files, uploads, layout ---------- */
    const uploads = new Map();
    const uploadQueue = [];
    let uploadsRunning = 0;
    let uploadSeq = 0;
    const UPLOAD_CONCURRENCY = 3;

    function pendingUploads() {
        return [...uploads.values()].filter(entry => entry.status === 'pending').length;
    }

    function queueUpload(item, file) {
        const id = `u${Date.now().toString(36)}${(uploadSeq++).toString(36)}`;
        item.dataset.upload = id;
        item.classList.add('is-uploading');
        uploads.set(id, { status: 'pending' });
        uploadQueue.push({ id, file });
        options.onUploads?.(pendingUploads());
        pumpUploads();
    }

    async function pumpUploads() {
        while (uploadsRunning < UPLOAD_CONCURRENCY && uploadQueue.length) {
            const job = uploadQueue.shift();
            uploadsRunning++;
            runUpload(job).finally(() => {
                uploadsRunning--;
                pumpUploads();
            });
        }
    }

    async function runUpload({ id, file }) {
        let url = null;
        try { url = await options.upload?.(file); } catch (error) { url = null; }
        // Fetch the uploaded picture before swapping it in, so the preview never blinks. decode() is
        // not used: it waits indefinitely while the tab is in the background.
        if (url) await preload(url);
        uploads.set(id, url ? { status: 'done', url } : { status: 'failed' });
        applyUpload(id);
        options.onUploads?.(pendingUploads());
        emitChange();
    }

    function applyUpload(id) {
        const result = uploads.get(id);
        root.querySelectorAll(`.media-item[data-upload="${id}"]`).forEach(item => {
            const blk = item.closest('.blk');
            const img = item.querySelector('img');
            const preview = img.getAttribute('src');
            if (result.status === 'done') {
                img.setAttribute('src', result.url);
                item.classList.remove('is-uploading');
                delete item.dataset.upload;
                delete item.dataset.prevSrc;
            } else if (result.status === 'failed') {
                if (item.dataset.prevSrc) {
                    img.setAttribute('src', item.dataset.prevSrc);
                    item.classList.remove('is-uploading');
                    delete item.dataset.upload;
                    delete item.dataset.prevSrc;
                } else {
                    item.remove();
                }
                options.toast?.('이미지를 올리지 못했습니다. 다시 시도해 주세요.');
            }
            if (blk) syncMedia(blk);
            if (preview && preview.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(preview), 120000);
        });
    }

    function reconcileUploads() {
        root.querySelectorAll('.media-item[data-upload]').forEach(item => {
            const result = uploads.get(item.dataset.upload);
            if (!result) { item.remove(); return; }
            if (result.status !== 'pending') applyUpload(item.dataset.upload);
        });
        root.querySelectorAll('.blk[data-type="media"]').forEach(syncMedia);
    }

    function addFilesToBlock(blk, files) {
        const images = [...files].filter(isImageFile);
        if (!images.length) { options.toast?.('이미지 파일만 넣을 수 있습니다.'); return; }
        checkpoint();
        const grid = blk.querySelector('.media-grid');
        const created = images.map(file => {
            const item = mediaItem({ src: URL.createObjectURL(file) });
            grid.append(item);
            animateIn(item);
            return [item, file];
        });
        syncMedia(blk);
        created.forEach(([item, file]) => queueUpload(item, file));
        emitChange();
    }

    function insertFilesAt(reference, files, { separate = false, after = true } = {}) {
        const images = [...files].filter(isImageFile);
        if (!images.length) { options.toast?.('이미지 파일만 넣을 수 있습니다.'); return []; }
        checkpoint();
        const groups = separate ? images.map(file => [file]) : [images];
        let anchor = reference;
        const created = [];
        groups.forEach(group => {
            const blk = mediaBlock('single');
            if (anchor && anchor.parentNode === root) {
                if (after || created.length) anchor.after(blk); else anchor.before(blk);
            } else root.append(blk);
            if (!created.length && anchor && typeOf(anchor) === 'paragraph' && anchor.classList.contains('is-empty') && anchor !== blocks().pop()) anchor.remove();
            const grid = blk.querySelector('.media-grid');
            group.forEach(file => grid.append(mediaItem({ src: URL.createObjectURL(file) })));
            syncMedia(blk);
            animateIn(blk);
            group.forEach((file, index) => queueUpload(grid.children[index], file));
            created.push(blk);
            anchor = blk;
        });
        const last = created[created.length - 1];
        if (!last.nextElementSibling) insertAfter(last, paragraph(), { animate: false });
        setActive(last);
        emitChange();
        return created;
    }

    function insertFiles(files, { separate = false } = {}) {
        const reference = activeBlock && root.contains(activeBlock) ? activeBlock : lastContentBlock();
        return insertFilesAt(reference, files, { separate });
    }

    function lastContentBlock() {
        const all = blocks();
        for (let index = all.length - 1; index >= 0; index--) {
            if (!(typeOf(all[index]) === 'paragraph' && all[index].classList.contains('is-empty'))) return all[index];
        }
        return null;
    }

    function setLayout(blk, layout) {
        if (!LAYOUTS.includes(layout) || blk.dataset.layout === layout) return;
        checkpoint();
        const grid = blk.querySelector('.media-grid');
        flip(() => {
            blk.dataset.layout = layout;
            blk.querySelectorAll('.media-item').forEach(item => delete item.dataset.class);
            syncMedia(blk);
        }, grid);
        emitChange();
    }

    const filePicker = { input: null, target: null, mode: null, item: null };

    function buildFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.hidden = true;
        input.addEventListener('change', () => {
            const files = [...input.files];
            input.value = '';
            const { target, mode, item } = filePicker;
            filePicker.target = filePicker.item = null;
            if (!files.length || !target || !root.contains(target)) return;
            if (mode === 'replace' && item) replaceImage(item, files[0]);
            else addFilesToBlock(target, files);
        });
        document.body.append(input);
        filePicker.input = input;
    }

    function pickFiles(blk, mode = 'add', item = null) {
        filePicker.target = blk;
        filePicker.mode = mode;
        filePicker.item = item;
        filePicker.input.multiple = mode !== 'replace';
        filePicker.input.click();
    }

    function replaceImage(item, file) {
        if (!isImageFile(file)) return options.toast?.('이미지 파일만 넣을 수 있습니다.');
        checkpoint();
        const img = item.querySelector('img');
        item.dataset.prevSrc = img.getAttribute('src') || '';
        img.setAttribute('src', URL.createObjectURL(file));
        queueUpload(item, file);
        emitChange();
    }

    function removeImage(item) {
        const blk = item.closest('.blk');
        checkpoint();
        flip(() => item.remove(), blk.querySelector('.media-grid'));
        syncMedia(blk);
        emitChange();
    }

    /* ---------- alt text popover ---------- */
    function buildAltPopover() {
        const pop = document.createElement('form');
        pop.className = 'alt-pop';
        pop.noValidate = true;
        pop.innerHTML = '<label class="alt-pop-label" for="blk-alt-input">이미지 설명 (alt)</label><input id="blk-alt-input" type="text" autocomplete="off" placeholder="무엇이 담긴 사진인가요?"><p class="alt-pop-note">갤러리 글에서는 사진 아래 작은 설명으로도 보입니다.</p><div class="alt-pop-actions"><button type="button" data-alt="cancel">취소</button><button type="submit" class="is-primary">저장</button></div>';
        document.body.append(pop);
        pop.addEventListener('submit', event => {
            event.preventDefault();
            const item = ui.altItem;
            if (item && root.contains(item)) {
                checkpoint();
                const value = pop.querySelector('input').value.trim();
                item.querySelector('img').setAttribute('alt', value);
                item.querySelector('.media-item-alt').textContent = value;
                emitChange();
            }
            closeAltPopover(true);
        });
        pop.querySelector('[data-alt="cancel"]').addEventListener('click', () => closeAltPopover(true));
        pop.querySelector('input').addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); closeAltPopover(true); }
        });
        ui.altPop = pop;
    }

    function openAltPopover(item) {
        ui.altItem = item;
        const pop = ui.altPop;
        pop.querySelector('input').value = item.querySelector('img').getAttribute('alt') || '';
        pop.classList.add('is-open');
        const rect = item.getBoundingClientRect();
        const anchorY = Math.min(rect.bottom, window.innerHeight - 40);
        positionFloating(pop, { top: anchorY - 24, bottom: anchorY - 24, left: rect.left, width: rect.width, height: 0 }, { prefer: 'below', gap: 0 });
        pop.querySelector('input').focus({ preventScroll: true });
    }

    function closeAltPopover(refocus) {
        const item = ui.altItem;
        ui.altPop.classList.remove('is-open');
        ui.altItem = null;
        if (refocus && item && root.contains(item)) selectBlock(item.closest('.blk'));
    }

    /* ---------- gutter & drag ---------- */
    function buildGutter() {
        const gutter = document.createElement('div');
        gutter.className = 'blk-gutter';
        gutter.innerHTML = `<button type="button" class="blk-gutter-btn" data-g="add" aria-label="아래에 블록 추가" data-tip="블록 추가" data-key="/">${ICON.plus}</button><button type="button" class="blk-gutter-btn blk-handle" data-g="handle" aria-label="블록 메뉴 · 끌어서 옮기기" data-tip="눌러서 메뉴 · 끌어서 이동">${ICON.grip}</button>`;
        docEl.append(gutter);
        const line = document.createElement('div');
        line.className = 'blk-drop-line';
        docEl.append(line);
        ui.gutter = gutter;
        ui.dropLine = line;
        gutter.addEventListener('mousedown', event => event.preventDefault());
        gutter.querySelector('[data-g="add"]').addEventListener('click', () => {
            const blk = ui.gutterBlock;
            if (!blk || !root.contains(blk)) return;
            if (typeOf(blk) === 'paragraph' && blk.classList.contains('is-empty')) setCaret(editableOf(blk), 'start');
            openMenu('insert', blk, gutterAnchor());
        });
        gutter.querySelector('[data-g="handle"]').addEventListener('pointerdown', startBlockDrag);
        gutter.querySelector('[data-g="handle"]').addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const blk = ui.gutterBlock;
                if (blk) openMenu('actions', blk, gutterAnchor());
            }
        });
    }

    function placeGutter() {
        const gutter = ui.gutter;
        if (!gutter) return;
        const blk = (hoverBlock && root.contains(hoverBlock) ? hoverBlock : null) || (activeBlock && root.contains(activeBlock) ? activeBlock : null);
        if (!blk || dragState.active) {
            if (!dragState.active) gutter.classList.remove('is-visible');
            return;
        }
        ui.gutterBlock = blk;
        const docRect = docEl.getBoundingClientRect();
        const rect = blk.getBoundingClientRect();
        let offset = 2;
        const el = isTextual(blk) ? editableOf(blk) : null;
        if (el && typeOf(blk) !== 'principles') {
            const { lineHeight, padTop } = lineInfo(el);
            offset = (el.getBoundingClientRect().top - rect.top) + padTop + (Math.min(lineHeight, 64) - 28) / 2;
        }
        const y = Math.round(rect.top - docRect.top + offset);
        // Glide between neighbouring blocks; jump when it reappears or the distance is long.
        const jump = !gutter.classList.contains('is-visible') || Math.abs(y - (ui.gutterY ?? y)) > 160;
        if (jump) {
            gutter.classList.add('is-jump');
            cancelAnimationFrame(ui.gutterFrame);
            ui.gutterFrame = requestAnimationFrame(() => requestAnimationFrame(() => gutter.classList.remove('is-jump')));
        }
        ui.gutterY = y;
        gutter.style.transform = `translate3d(0, ${y}px, 0)`;
        gutter.classList.add('is-visible');
    }

    // Where the gutter is going (not where it is mid-glide), for anchoring its menus.
    function gutterAnchor() {
        const rect = ui.gutter.getBoundingClientRect();
        const top = docEl.getBoundingClientRect().top + (ui.gutterY || 0);
        return { left: rect.left, right: rect.right, width: rect.width, top, bottom: top + 28, height: 28 };
    }

    const dragState = { active: false };

    function dropTargetAt(clientY, exclude) {
        const list = blocks().filter(blk => blk !== exclude);
        for (const blk of list) {
            const rect = blk.getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) return { ref: blk };
        }
        return { ref: null };
    }

    function showDropLine(target, exclude) {
        const line = ui.dropLine;
        const docRect = docEl.getBoundingClientRect();
        let y;
        if (target.ref) {
            const rect = target.ref.getBoundingClientRect();
            const previous = target.ref.previousElementSibling === exclude ? exclude?.previousElementSibling : target.ref.previousElementSibling;
            const previousBottom = previous ? previous.getBoundingClientRect().bottom : rect.top - 16;
            y = (previousBottom + rect.top) / 2;
        } else {
            const last = blocks().filter(blk => blk !== exclude).pop();
            y = last ? last.getBoundingClientRect().bottom + 12 : docRect.top;
        }
        const rootRect = root.getBoundingClientRect();
        line.style.transform = `translate3d(${Math.round(rootRect.left - docRect.left)}px, ${Math.round(y - docRect.top)}px, 0)`;
        line.style.width = `${Math.round(rootRect.width)}px`;
        line.classList.add('is-visible');
    }

    function hideDropLine() {
        ui.dropLine?.classList.remove('is-visible');
    }

    let scrollLoop = 0;
    function autoScroll(clientY, onScroll) {
        cancelAnimationFrame(scrollLoop);
        const top = (options.topInset?.() || 0) + 70;
        const bottom = window.innerHeight - (options.bottomInset?.() || 0) - 70;
        let speed = 0;
        if (clientY < top) speed = -Math.min(18, (top - clientY) / 3);
        else if (clientY > bottom) speed = Math.min(18, (clientY - bottom) / 3);
        if (!speed) return;
        const step = () => {
            window.scrollBy(0, speed);
            onScroll?.();
            scrollLoop = requestAnimationFrame(step);
        };
        scrollLoop = requestAnimationFrame(step);
    }

    function startBlockDrag(event) {
        if (event.button !== 0) return;
        const blk = ui.gutterBlock;
        if (!blk || !root.contains(blk)) return;
        event.preventDefault();
        const startY = event.clientY;
        let target = null;
        let lastY = startY;
        let moved = false;
        const update = () => {
            target = dropTargetAt(lastY, blk);
            showDropLine(target, blk);
        };
        const onMove = moveEvent => {
            lastY = moveEvent.clientY;
            if (!moved && Math.abs(lastY - startY) < 5) return;
            if (!moved) {
                moved = true;
                dragState.active = true;
                blk.classList.add('is-dragging');
                document.body.classList.add('is-block-dragging');
                closeMenu();
                hideSelectionBar();
            }
            update();
            autoScroll(lastY, update);
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            cancelAnimationFrame(scrollLoop);
            hideDropLine();
            if (!moved) {
                openMenu('actions', blk, gutterAnchor());
                return;
            }
            dragState.active = false;
            blk.classList.remove('is-dragging');
            document.body.classList.remove('is-block-dragging');
            const reference = target?.ref || null;
            const unchanged = reference === blk.nextElementSibling || (!reference && blk === blocks().pop());
            if (!unchanged) {
                checkpoint();
                flip(() => (reference ? reference.before(blk) : root.append(blk)));
                ensureTrailingParagraph();
                emitChange();
            }
            setActive(blk);
            placeGutter();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    function startItemDrag(event, item) {
        const blk = item.closest('.blk');
        const grid = blk.querySelector('.media-grid');
        const startX = event.clientX;
        const startY = event.clientY;
        let moved = false;
        const onMove = moveEvent => {
            if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return;
            if (!moved) {
                moved = true;
                checkpoint();
                item.classList.add('is-lifted');
                dragState.active = true;
            }
            moveEvent.preventDefault();
            const items = [...grid.children];
            let best = null;
            let bestDistance = Infinity;
            items.forEach(other => {
                const rect = other.getBoundingClientRect();
                const distance = Math.hypot(moveEvent.clientX - (rect.left + rect.width / 2), moveEvent.clientY - (rect.top + rect.height / 2));
                if (distance < bestDistance) { bestDistance = distance; best = other; }
            });
            if (best && best !== item) {
                const rect = best.getBoundingClientRect();
                const vertical = blk.dataset.layout === 'single';
                const before = vertical ? moveEvent.clientY < rect.top + rect.height / 2 : moveEvent.clientX < rect.left + rect.width / 2;
                const reference = before ? best : best.nextElementSibling;
                if (reference !== item && reference !== item.nextElementSibling) flip(() => grid.insertBefore(item, reference), grid);
            }
            autoScroll(moveEvent.clientY);
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            cancelAnimationFrame(scrollLoop);
            dragState.active = false;
            if (moved) {
                item.classList.remove('is-lifted');
                emitChange();
            } else {
                blk.querySelectorAll('.is-picked').forEach(other => { if (other !== item) other.classList.remove('is-picked'); });
                item.classList.toggle('is-picked');
                selectBlock(blk);
            }
        };
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    /* ---------- events ---------- */
    function onKeyDown(event) {
        if (event.isComposing || event.keyCode === 229) return;
        if (menu.mode && menuKey(event)) return;
        const mod = event.metaKey || event.ctrlKey;
        const key = event.key;
        const lower = key.length === 1 ? key.toLowerCase() : key;
        const target = event.target;
        if (target.closest('.blk-html-edit')) {
            if (key === 'Escape') { event.preventDefault(); finishHtml(target.closest('.blk'), false); }
            if (mod && key === 'Enter') { event.preventDefault(); event.stopPropagation(); finishHtml(target.closest('.blk'), true); }
            return;
        }
        if (mod && !event.altKey && lower === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
        if (mod && !event.altKey && lower === 'y') { event.preventDefault(); redo(); return; }
        if (target.matches('.btn-url, .btn-newtab-input')) {
            const owner = target.closest('.blk');
            if (key === 'Enter' && target.matches('.btn-url')) {
                // Enter in the address: done with this button, carry on writing below it.
                event.preventDefault();
                let next = owner.nextElementSibling;
                if (!next) { checkpoint(); next = insertAfter(owner, paragraph()); emitChange(); }
                focusStartOf(next);
            } else if (key === 'Escape') {
                event.preventDefault();
                frameBlock(owner);
            }
            return;
        }
        const blk = target.closest('.blk');
        if (!blk || !root.contains(blk)) return;
        if (mod && event.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) { event.preventDefault(); moveBlock(blk, key === 'ArrowUp' ? -1 : 1); return; }
        ui.gutter?.classList.add('is-typing');

        const editable = target.closest('[data-editable]');
        if (!editable) return blockKey(event, blk);

        if (mod && !event.shiftKey && !event.altKey && ['b', 'i', 'u', 'k'].includes(lower)) {
            event.preventDefault();
            // A button label is plain text; its link lives in the address field.
            if (typeOf(blk) === 'buttons') return;
            if (lower === 'k') openLinkInput();
            else runInline({ b: 'bold', i: 'italic', u: 'underline' }[lower]);
            return;
        }
        if (mod && event.altKey && /^[0-3]$/.test(key) && (MERGEABLE.has(typeOf(blk)) || typeOf(blk) === 'list')) {
            event.preventDefault();
            convertBlock(blk, key === '0' ? 'paragraph' : 'heading', { level: Number(key) });
            return;
        }
        if (key === 'Escape') {
            event.preventDefault();
            hideSelectionBar();
            frameBlock(blk);
            return;
        }

        const type = typeOf(blk);
        if (type === 'table') return tableKey(event, blk, editable);
        if (type === 'buttons') return buttonKey(event, blk, editable);
        if (editable.classList.contains('media-caption')) return captionKey(event, blk, editable);
        if (type === 'code') return codeKey(event, blk, editable);
        if (type === 'list') { if (listKey(event, blk, editable)) return; }
        if (type === 'split' || type === 'principles') {
            if (type === 'principles' && event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) { event.preventDefault(); principleRun(blk, key === 'ArrowUp' ? 'up' : 'down'); return; }
            return navigationKey(event, blk, editable);
        }
        if (MERGEABLE.has(type)) {
            if (key === 'Enter' && !event.shiftKey && !mod) { event.preventDefault(); splitBlock(blk); return; }
            if (key === 'Backspace' && !mod && selectionRange()?.collapsed && caretOffset(editable) === 0) {
                event.preventDefault();
                if (type !== 'paragraph') convertBlock(blk, 'paragraph');
                else mergeWithPrevious(blk);
                return;
            }
            if (key === 'Delete' && selectionRange()?.collapsed && caretOffset(editable) >= textLength(editable)) {
                event.preventDefault();
                mergeNext(blk);
                return;
            }
        }
        navigationKey(event, blk, editable);
    }

    function navigationKey(event, blk, editable) {
        const key = event.key;
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
        const range = selectionRange();
        if (!range || !range.collapsed) return;
        if (key === 'ArrowUp' && blk.previousElementSibling && onFirstLine(editable)) { event.preventDefault(); focusEndOf(blk.previousElementSibling); }
        else if (key === 'ArrowDown' && blk.nextElementSibling && onLastLine(editable)) { event.preventDefault(); focusStartOf(blk.nextElementSibling); }
        else if (key === 'ArrowLeft' && blk.previousElementSibling && caretOffset(editable) === 0) { event.preventDefault(); focusEndOf(blk.previousElementSibling); }
        else if (key === 'ArrowRight' && blk.nextElementSibling && caretOffset(editable) >= textLength(editable)) { event.preventDefault(); focusStartOf(blk.nextElementSibling); }
    }

    function blockKey(event, blk) {
        const key = event.key;
        if (event.target.closest('button, input, textarea')) return;
        if (key === 'Backspace' || key === 'Delete') { event.preventDefault(); checkpoint(); removeBlock(blk, { focus: key === 'Delete' ? 'next' : 'previous' }); }
        else if (key === 'Enter') {
            event.preventDefault();
            if (typeOf(blk) === 'html') return editHtml(blk);
            if (isTextual(blk)) return setCaret(editableOf(blk), 'end');
            checkpoint();
            const fresh = insertAfter(blk, paragraph());
            setCaret(editableOf(fresh), 'start');
            emitChange();
        } else if (key === 'ArrowUp' || key === 'ArrowLeft') { if (blk.previousElementSibling) { event.preventDefault(); focusEndOf(blk.previousElementSibling); } }
        else if (key === 'ArrowDown' || key === 'ArrowRight') { if (blk.nextElementSibling) { event.preventDefault(); focusStartOf(blk.nextElementSibling); } }
        else if (key === 'Escape') { blk.blur(); setActive(null); }
    }

    function captionKey(event, blk, caption) {
        const key = event.key;
        if (key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            checkpoint();
            let next = blk.nextElementSibling;
            if (!next || !(typeOf(next) === 'paragraph' && next.classList.contains('is-empty'))) next = insertAfter(blk, paragraph());
            setCaret(editableOf(next), 'start');
            emitChange();
        } else if (key === 'Backspace' && isBlank(caption)) {
            event.preventDefault();
            caption.blur();
            selectBlock(blk);
        } else if (key === 'ArrowDown' && blk.nextElementSibling && onLastLine(caption)) {
            event.preventDefault();
            focusStartOf(blk.nextElementSibling);
        } else if (key === 'ArrowUp' && onFirstLine(caption)) {
            event.preventDefault();
            if (blk.previousElementSibling) focusEndOf(blk.previousElementSibling);
        }
    }

    // Cells: Tab / Shift+Tab walk the cells (Tab on the last cell adds a row), Enter goes to the cell
    // below (adding a row at the bottom), Shift+Enter breaks the line inside a cell.
    function tableKey(event, blk, cell) {
        const key = event.key;
        const mod = event.metaKey || event.ctrlKey;
        if (cell.classList.contains('table-caption')) {
            if (key === 'ArrowUp' && !event.shiftKey && onFirstLine(cell)) { event.preventDefault(); setCaret(lastEditable(blk), 'end'); return; }
            return captionKey(event, blk, cell);
        }
        const cells = [...tableOf(blk).querySelectorAll('th, td')];
        const index = cells.indexOf(cell);
        if (key === 'Tab' && !mod) {
            event.preventDefault();
            if (event.shiftKey) { if (index > 0) setCaret(cells[index - 1], 'end'); }
            else if (index < cells.length - 1) setCaret(cells[index + 1], 'end');
            else { lastTableCell = cell; tableRun(blk, 'row-add-end'); }
            return;
        }
        if (key === 'Enter' && !event.shiftKey && !mod) {
            event.preventDefault();
            const below = tableNeighbour(cell, 1);
            if (below) setCaret(below, 'end');
            else { lastTableCell = cell; tableRun(blk, 'row-add'); }
            return;
        }
        if (event.shiftKey || event.altKey || mod) return;
        const range = selectionRange();
        if (!range || !range.collapsed) return;
        if (key === 'ArrowUp' && onFirstLine(cell)) {
            event.preventDefault();
            const above = tableNeighbour(cell, -1);
            if (above) setCaret(above, 'end');
            else if (blk.previousElementSibling) focusEndOf(blk.previousElementSibling);
        } else if (key === 'ArrowDown' && onLastLine(cell)) {
            event.preventDefault();
            const below = tableNeighbour(cell, 1);
            if (below) setCaret(below, 'start');
            else if (blk.nextElementSibling) focusStartOf(blk.nextElementSibling);
            else setCaret(blk.querySelector('.table-caption'), 'start');
        } else if (key === 'ArrowLeft' && caretOffset(cell) === 0 && index > 0) {
            event.preventDefault();
            setCaret(cells[index - 1], 'end');
        } else if (key === 'ArrowRight' && caretOffset(cell) >= textLength(cell) && index < cells.length - 1) {
            event.preventDefault();
            setCaret(cells[index + 1], 'start');
        }
    }

    // Labels: Enter jumps to the address field; left/right walk between buttons in the row.
    function buttonKey(event, blk, label) {
        const key = event.key;
        if (key === 'Enter') {
            event.preventDefault();
            setCurrentButton(blk, label.closest('.btn-item'));
            const input = blk.querySelector('.btn-url');
            input.focus({ preventScroll: true });
            input.select();
            return;
        }
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
        const labels = [...blk.querySelectorAll('.btn-label')];
        const index = labels.indexOf(label);
        if (key === 'ArrowLeft' && caretOffset(label) === 0 && index > 0) { event.preventDefault(); setCaret(labels[index - 1], 'end'); return; }
        if (key === 'ArrowRight' && caretOffset(label) >= textLength(label) && index < labels.length - 1) { event.preventDefault(); setCaret(labels[index + 1], 'start'); return; }
        navigationKey(event, blk, label);
    }

    function codeKey(event, blk, pre) {
        const key = event.key;
        if (key === 'Enter' && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            document.execCommand('insertText', false, '\n');
            const length = pre.textContent.length;
            if (caretOffset(pre) === length) {
                pre.append(document.createTextNode('\n'));
                setCaret(pre, length);
            }
            return;
        }
        if (key === 'Tab') {
            event.preventDefault();
            document.execCommand('insertText', false, '    ');
            return;
        }
        if (key === 'Backspace' && isBlank(pre) && !pre.textContent.length) {
            event.preventDefault();
            convertBlock(blk, 'paragraph');
            return;
        }
        if (key === 'ArrowDown' && !blk.nextElementSibling && onLastLine(pre)) {
            event.preventDefault();
            checkpoint();
            const fresh = insertAfter(blk, paragraph());
            setCaret(editableOf(fresh), 'start');
            emitChange();
            return;
        }
        navigationKey(event, blk, pre);
    }

    function listKey(event, blk, listEl) {
        const key = event.key;
        const li = currentListItem(listEl);
        if (!li) return false;
        if (key === 'Enter' && !event.shiftKey && isBlank(li) && !li.querySelector('ul,ol')) { event.preventDefault(); exitList(blk, li); return true; }
        if (key === 'Tab') {
            event.preventDefault();
            checkpoint();
            document.execCommand(event.shiftKey ? 'outdent' : 'indent');
            emitChange();
            return true;
        }
        if (key === 'Backspace' && selectionRange()?.collapsed && caretOffset(li) === 0 && li === listEl.firstElementChild && caretOffset(listEl) === 0) {
            event.preventDefault();
            liftFirstItem(blk, li);
            return true;
        }
        return false;
    }

    function onBeforeInput(event) {
        if (event.inputType === 'historyUndo') { event.preventDefault(); undo(); return; }
        if (event.inputType === 'historyRedo') { event.preventDefault(); redo(); return; }
        if (!history.burst) {
            checkpoint();
            history.burst = true;
        }
        clearTimeout(history.timer);
        history.timer = setTimeout(endBurst, 900);
    }

    const SHORTCUTS = [
        [/^#\s$/, blk => convertBlock(blk, 'heading', { level: 1, clear: true })],
        [/^##\s$/, blk => convertBlock(blk, 'heading', { level: 2, clear: true })],
        [/^###\s$/, blk => convertBlock(blk, 'heading', { level: 3, clear: true })],
        [/^[-*•]\s$/, blk => convertBlock(blk, 'list', { ordered: false, clear: true })],
        [/^1[.)]\s$/, blk => convertBlock(blk, 'list', { ordered: true, clear: true })],
        [/^>\s$/, blk => convertBlock(blk, 'quote', { clear: true })],
        [/^```$/, blk => convertBlock(blk, 'code', { clear: true })],
        [/^---$/, blk => { const el = editableOf(blk); el.innerHTML = '<br>'; refreshEmpty(blk); insertDivider(blk); }]
    ];

    function onInput(event) {
        const target = event.target;
        if (target.matches?.('.btn-url, .btn-newtab-input')) {
            const owner = target.closest('.blk');
            const item = currentButton(owner);
            if (!item) return;
            if (target.matches('.btn-url')) {
                item.dataset.href = target.value;
                // Until the writer decides, outside links open in a new tab and site links do not.
                if (item.dataset.auto === '1') item.dataset.newtab = isExternal(normalizeUrl(target.value)) ? '1' : '0';
            } else {
                checkpoint();
                item.dataset.newtab = target.checked ? '1' : '0';
                item.dataset.auto = '0';
            }
            syncButtons(owner);
            emitChange();
            return;
        }
        const blk = target.closest?.('.blk');
        const editable = target.closest?.('[data-editable]');
        if (blk && root.contains(blk)) {
            refreshEmpty(blk);
            if (typeOf(blk) === 'media') syncMedia(blk);
            if (typeOf(blk) === 'table') syncTable(blk);
            if (typeOf(blk) === 'paragraph' && editable && !event.isComposing) {
                const text = editable.textContent.replace(/\u00a0/g, ' ');
                const rule = SHORTCUTS.find(([pattern]) => pattern.test(text));
                if (rule && caretOffset(editable) === text.length) {
                    rule[1](blk);
                    return;
                }
            }
            if (typeOf(blk) === 'paragraph' && editable) {
                const text = editable.textContent.replace(/\u00a0/g, ' ');
                if (/^\/[^\s/]{0,24}$/.test(text)) {
                    const rect = editable.getBoundingClientRect();
                    const lineRect = { top: rect.top, bottom: rect.top + lineInfo(editable).lineHeight, left: rect.left, width: 0, height: lineInfo(editable).lineHeight };
                    if (menu.mode === 'slash' && menu.block === blk) {
                        menu.query = text.slice(1);
                        renderMenu();
                    } else openMenu('slash', blk, lineRect, text.slice(1));
                } else if (menu.mode === 'slash') closeMenu();
            }
        }
        emitChange();
    }

    function sanitizePasted(html) {
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        const box = doc.body.firstElementChild;
        if (!box) return '';
        const forbidden = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'svg', 'SVG']);
        const allowedClass = /^(post-split-section|post-split-content|post-principles|principle-copy|principle-title|post-table|post-button-row|post-button|high|lead-text|muted-text|chip-blue|quote-box|note-box|caption|line|image-grid|image-grid-[23]|big|mini|story-[a-z0-9-]+)$/;
        [...box.querySelectorAll('*')].forEach(el => {
            if (forbidden.has(el.tagName)) { el.remove(); return; }
            [...el.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();
                const keep = ['href', 'src', 'alt', 'title', 'target', 'rel', 'colspan', 'rowspan', 'class', 'data-style'].includes(name);
                if (!keep || name.startsWith('on')) el.removeAttribute(attr.name);
            });
            if (el.hasAttribute('href') && /^\s*javascript:/i.test(el.getAttribute('href'))) el.removeAttribute('href');
            if (el.hasAttribute('class')) {
                const classes = [...el.classList].filter(name => allowedClass.test(name));
                if (classes.length) el.className = classes.join(' '); else el.removeAttribute('class');
            }
            if (el.tagName === 'A' && el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
        });
        // Word processors wrap everything in spans and divs; drop the wrappers that carry nothing.
        [...box.querySelectorAll('span:not([class]), font')].forEach(unwrap);
        return box.innerHTML;
    }

    function onPaste(event) {
        const editable = event.target.closest?.('[data-editable]');
        if (!editable || !root.contains(editable)) return;
        const blk = editable.closest('.blk');
        const data = event.clipboardData;
        if (!data) return;
        const files = [...(data.files || [])].filter(isImageFile);
        if (files.length) {
            event.preventDefault();
            insertFilesAt(blk, files, { separate: options.getPostType?.() === 'gallery' });
            return;
        }
        const text = data.getData('text/plain');
        const html = data.getData('text/html');
        event.preventDefault();
        checkpoint();
        if (typeOf(blk) === 'code' || typeOf(blk) === 'buttons' || editable.matches('.media-caption, .table-caption')) {
            document.execCommand('insertText', false, typeOf(blk) === 'code' ? text : text.replace(/\s*\n+\s*/g, ' '));
            emitChange();
            return;
        }
        let parsed = [];
        if (html) parsed = parse(sanitizePasted(html));
        else if (text && /\n/.test(text.trim())) {
            parsed = text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).map(chunk => paragraph(esc(chunk).replace(/\n/g, '<br>')));
        }
        const singleInline = parsed.length === 1 && typeOf(parsed[0]) === 'paragraph' && !editableOf(parsed[0]).getAttribute('class');
        if (!parsed.length || singleInline || !MERGEABLE.has(typeOf(blk))) {
            if (singleInline) document.execCommand('insertHTML', false, editableOf(parsed[0]).innerHTML);
            else if (html && parsed.length && typeOf(blk) !== 'list' && typeOf(blk) !== 'split' && typeOf(blk) !== 'principles') document.execCommand('insertText', false, text);
            else if (html && (typeOf(blk) === 'split' || typeOf(blk) === 'principles' || typeOf(blk) === 'list')) document.execCommand('insertHTML', false, sanitizePasted(html));
            else document.execCommand('insertText', false, text);
            refreshEmpty(blk);
            emitChange();
            return;
        }
        // Several blocks: split where the caret is and set the pasted blocks between the halves.
        const range = selectionRange();
        if (range && !range.collapsed) range.deleteContents();
        let tailBlock = null;
        if (range) {
            const tail = document.createRange();
            tail.setStart(range.startContainer, range.startOffset);
            tail.setEnd(editable, editable.childNodes.length);
            const fragment = tail.extractContents();
            const holder = document.createElement('div');
            holder.append(fragment);
            if (!isBlank(holder)) tailBlock = paragraph(holder.innerHTML);
        }
        let anchor = blk;
        parsed.forEach(part => { anchor.after(part); anchor = part; animateIn(part); });
        if (tailBlock) anchor.after(tailBlock);
        if (isBlank(editable)) blk.remove(); else refreshEmpty(blk);
        focusEndOf(anchor);
        emitChange();
    }

    function hasFiles(event) {
        return [...(event.dataTransfer?.types || [])].includes('Files');
    }

    let fileDropTarget = null;
    function onDragOver(event) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        const media = event.target.closest?.('.blk[data-type="media"]');
        root.querySelectorAll('.is-drop-target').forEach(el => { if (el !== media) el.classList.remove('is-drop-target'); });
        if (media && root.contains(media)) {
            media.classList.add('is-drop-target');
            hideDropLine();
            fileDropTarget = { into: media };
        } else {
            const target = dropTargetAt(event.clientY, null);
            showDropLine(target, null);
            fileDropTarget = target;
        }
    }

    function clearFileDrop() {
        root.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
        hideDropLine();
        fileDropTarget = null;
    }

    function onDrop(event) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        const target = fileDropTarget || dropTargetAt(event.clientY, null);
        clearFileDrop();
        const files = [...event.dataTransfer.files];
        if (target.into) return addFilesToBlock(target.into, files);
        const separate = options.getPostType?.() === 'gallery';
        if (target.ref) insertFilesAt(target.ref, files, { separate, after: false });
        else insertFilesAt(blocks().pop(), files, { separate });
    }

    function onClick(event) {
        const target = event.target;
        const blk = target.closest('.blk');
        if (!blk || !root.contains(blk)) {
            if (target === root) {
                const last = blocks().pop();
                const rect = last?.getBoundingClientRect();
                if (last && rect && event.clientY > rect.bottom) {
                    if (typeOf(last) === 'paragraph' && last.classList.contains('is-empty')) setCaret(editableOf(last), 'start');
                    else { checkpoint(); const fresh = insertAfter(last, paragraph()); setCaret(editableOf(fresh), 'start'); emitChange(); }
                }
            }
            return;
        }
        const button = target.closest('button');
        if (button) {
            const act = button.dataset.act;
            const item = button.closest('.media-item');
            if (button.dataset.layoutSet) { setLayout(blk, button.dataset.layoutSet); return; }
            switch (act) {
                case 'pick': case 'add-images': pickFiles(blk, 'add'); return;
                case 'delete-block': checkpoint(); removeBlock(blk); return;
                case 'alt': openAltPopover(item); return;
                case 'replace': pickFiles(blk, 'replace', item); return;
                case 'remove-image': removeImage(item); return;
                case 'principle-add': principleRun(blk, 'add'); return;
                case 'principle-remove': principleRun(blk, 'remove'); return;
                case 'principle-up': principleRun(blk, 'up'); return;
                case 'principle-down': principleRun(blk, 'down'); return;
                case 'html-apply': finishHtml(blk, true); return;
                case 'html-cancel': finishHtml(blk, false); return;
                case 'table-header': tableRun(blk, 'header'); return;
                case 'table-row-add': tableRun(blk, 'row-add'); return;
                case 'table-row-remove': tableRun(blk, 'row-remove'); return;
                case 'table-col-add': tableRun(blk, 'col-add'); return;
                case 'table-col-remove': tableRun(blk, 'col-remove'); return;
                case 'btn-add': addButton(blk); return;
                case 'btn-style': setButtonStyle(blk, button.dataset.value); return;
                case 'btn-remove': removeButton(blk); return;
                default: return;
            }
        }
        const buttonEl = target.closest('.btn-item');
        if (buttonEl && !target.closest('.btn-label')) {
            setCurrentButton(blk, buttonEl);
            setCaret(buttonEl.querySelector('.btn-label'), 'end');
            return;
        }
        if (!target.closest('[data-editable], textarea, input, label, .btn-editor, .table-wrap')) selectBlock(blk);
    }

    function onPointerDown(event) {
        const item = event.target.closest('.media-item');
        if (item && !event.target.closest('button') && event.button === 0 && !item.classList.contains('is-uploading')) {
            event.preventDefault();
            startItemDrag(event, item);
        }
        const bar = event.target.closest('.media-bar, .blk-bar, .media-item-tools, .btn-editor, .btn-row');
        if (bar && event.target.closest('button')) event.preventDefault();
    }

    function onFocusIn(event) {
        const blk = event.target.closest?.('.blk');
        if (blk && root.contains(blk)) setActive(blk);
        const cell = event.target.closest?.('th[data-editable], td[data-editable]');
        if (cell && root.contains(cell)) lastTableCell = cell;
        const item = event.target.closest?.('.btn-item');
        if (item && blk && root.contains(item)) setCurrentButton(blk, item);
        if (event.target.closest?.('[data-editable]')) ui.gutter?.classList.remove('is-typing');
    }

    function onFocusOut() {
        setTimeout(() => {
            const active = document.activeElement;
            if (active && (root.contains(active) || ui.altPop?.contains(active) || ui.selbar?.contains(active))) return;
            if (menu.mode) return;
            setActive(null);
            if (!ui.selbar?.classList.contains('is-linking')) hideSelectionBar();
        }, 0);
    }

    function onPointerMove(event) {
        if (dragState.active || coarsePointer.matches) return;
        ui.gutter?.classList.remove('is-typing');
        if (event.target.closest?.('.blk-gutter')) return;
        const blk = event.target.closest?.('.blk');
        if (blk && root.contains(blk)) {
            if (hoverBlock !== blk) { hoverBlock = blk; placeGutter(); }
            return;
        }
        // In the gutter lane to the left of the column, keep the block under the pointer's height.
        const rootRect = root.getBoundingClientRect();
        if (event.clientX < rootRect.left && event.clientX > rootRect.left - 80) {
            const found = blocks().find(candidate => {
                const rect = candidate.getBoundingClientRect();
                return event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8;
            });
            if (found && found !== hoverBlock) { hoverBlock = found; placeGutter(); }
        }
    }

    function onPointerLeave() {
        if (dragState.active) return;
        hoverBlock = null;
        placeGutter();
    }

    function bindEvents() {
        document.execCommand('defaultParagraphSeparator', false, 'p');
        try { document.execCommand('styleWithCSS', false, false); } catch (error) { /* older engines */ }
        root.addEventListener('keydown', onKeyDown);
        root.addEventListener('beforeinput', onBeforeInput);
        root.addEventListener('input', onInput);
        root.addEventListener('paste', onPaste);
        root.addEventListener('click', onClick);
        root.addEventListener('pointerdown', onPointerDown);
        root.addEventListener('focusin', onFocusIn);
        root.addEventListener('focusout', onFocusOut);
        docEl.addEventListener('pointermove', onPointerMove);
        docEl.addEventListener('pointerleave', onPointerLeave);
        docEl.addEventListener('dragover', onDragOver);
        docEl.addEventListener('dragleave', event => { if (!docEl.contains(event.relatedTarget)) clearFileDrop(); });
        docEl.addEventListener('drop', onDrop);
        document.addEventListener('selectionchange', scheduleSelectionBar);
        // Menus opened from the gutter or the dock answer the keyboard even when the text is not focused.
        document.addEventListener('keydown', event => {
            if (menu.mode && menu.mode !== 'slash' && !root.contains(event.target)) menuKey(event);
        });
        window.addEventListener('resize', () => { placeGutter(); scheduleSelectionBar(); closeMenu(); }, { passive: true });
        window.addEventListener('scroll', () => {
            if (ui.selbar?.classList.contains('is-visible')) scheduleSelectionBar();
            if (menu.mode && menu.mode !== 'slash') closeMenu();
            if (ui.altPop?.classList.contains('is-open')) closeAltPopover(false);
        }, { passive: true });
        document.addEventListener('pointerdown', event => {
            if (menu.mode && !menu.el.contains(event.target) && !ui.gutter.contains(event.target)) closeMenu();
            if (ui.altPop?.classList.contains('is-open') && !ui.altPop.contains(event.target)) closeAltPopover(false);
            if (ui.selbar?.classList.contains('is-linking') && !ui.selbar.contains(event.target)) closeLinkInput(false);
        });
        if ('ResizeObserver' in window) new ResizeObserver(() => placeGutter()).observe(root);
    }

    /* ---------- public API ---------- */
    function load(html) {
        root.innerHTML = '';
        activeBlock = null;
        hoverBlock = null;
        parse(html).forEach(blk => root.append(blk));
        if (!blocks().length) root.append(paragraph());
        ensureTrailingParagraph();
        refreshAll();
        history.undo.length = 0;
        history.redo.length = 0;
        endBurst();
        placeGutter();
    }

    function replaceAll(html) {
        checkpoint();
        root.innerHTML = '';
        activeBlock = null;
        parse(html).forEach(blk => root.append(blk));
        if (!blocks().length) root.append(paragraph());
        ensureTrailingParagraph();
        refreshAll();
        blocks().forEach(animateIn);
        emitChange();
    }

    function isEmpty() {
        return !getHtml().trim() && !root.querySelector('.media-item');
    }

    function stats() {
        let text = '';
        blocks().forEach(blk => {
            const type = typeOf(blk);
            if (type === 'media') text += ' ' + (blk.querySelector('.media-caption')?.textContent || '');
            else if (type === 'html') text += ' ' + (blk.querySelector('.blk-html-view')?.textContent || '');
            else if (type === 'table') text += ' ' + (tableOf(blk)?.textContent || '') + ' ' + (blk.querySelector('.table-caption')?.textContent || '');
            else if (type === 'buttons') text += ' ' + [...blk.querySelectorAll('.btn-label')].map(label => label.textContent).join(' ');
            else if (editableOf(blk)) text += ' ' + editableOf(blk).textContent;
        });
        const characters = text.replace(/[\s\u200B\u00a0]/g, '').length;
        const images = root.querySelectorAll('.media-item, .blk-html-view img').length;
        return { characters, minutes: characters ? Math.max(1, Math.ceil(characters / 500)) : 0, images, blocks: blocks().length };
    }

    function emptyMediaCount() {
        return root.querySelectorAll('.blk[data-type="media"].is-empty-media').length;
    }

    function focusFirst() {
        const first = blocks()[0];
        if (first) focusStartOf(first);
    }

    function setPlaceholder(text) {
        root.dataset.placeholder = text;
        refreshDocState();
    }

    function mount(rootElement, config = {}) {
        root = rootElement;
        options = config;
        docEl = root.closest('.studio-document') || root.parentElement;
        root.classList.add('block-editor');
        root.removeAttribute('contenteditable');
        buildGutter();
        buildSelectionBar();
        buildMenu();
        buildAltPopover();
        buildFilePicker();
        bindEvents();
        load('');
        return api;
    }

    const api = {
        mount,
        load,
        replaceAll,
        getHtml: () => getHtml({ draft: false }),
        getDraftHtml: () => getHtml({ draft: true }),
        isEmpty,
        stats,
        pendingUploads,
        emptyMediaCount,
        invalidButtonCount: () => root.querySelectorAll('.blk[data-type="buttons"] .btn-item.is-invalid').length,
        insertFiles,
        focusFirst,
        setPlaceholder,
        undo,
        redo,
        openInsertMenu: rect => { const blk = currentBlock(); if (blk) openMenu('insert', blk, rect); },
        openBlockMenu: rect => { const blk = currentBlock(); if (blk) openMenu('actions', blk, rect); },
        closeFloating: () => { closeMenu(); hideSelectionBar(); if (ui.altPop?.classList.contains('is-open')) closeAltPopover(false); }
    };

    window.SwblogBlockEditor = api;
}());
