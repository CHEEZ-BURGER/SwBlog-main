(function () {
    'use strict';

    const BLOCK_HTML_START = /^<(?:address|article|aside|blockquote|details|dialog|div|dl|fieldset|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|table|ul)\b/i;
    const LEADING_HIDDEN_THUMBNAIL = /^<img\b(?=[^>]*\bclass=(?:"[^"]*\bhidden-thumbnail\b[^"]*"|'[^']*\bhidden-thumbnail\b[^']*'))[^>]*>\s*/i;

    function getContentProbe(content) {
        let probe = String(content || '').replace(/^\uFEFF/, '').trimStart();

        // Newer posts can prepend a hidden HTML thumbnail even when the body is
        // legacy Markdown. Ignore that metadata before deciding how to parse it.
        probe = probe.replace(LEADING_HIDDEN_THUMBNAIL, '').trimStart();
        probe = probe.replace(/^(?:<!--[\s\S]*?-->\s*)+/, '').trimStart();

        return probe;
    }

    function isStoredHtml(content) {
        const probe = getContentProbe(content);
        return /^<!doctype\s+html\b/i.test(probe)
            || /^<html\b/i.test(probe)
            || BLOCK_HTML_START.test(probe);
    }

    function toRenderableHtml(content, markdownParser) {
        const rawContent = String(content || '');
        if (isStoredHtml(rawContent)) return rawContent;

        const parser = markdownParser || window.marked;
        return parser && typeof parser.parse === 'function'
            ? parser.parse(rawContent)
            : rawContent;
    }

    // Code blocks. The old editor saved a block as <pre><p>javascript</p><p>line</p>…</pre>: the
    // first paragraph names the language and each further paragraph is one line. Newer posts
    // and Markdown give <pre><code class="language-x">. Both become one shape:
    // <pre data-lang><span class="code-head">LANG · Copy</span><code class="language-x">text</code></pre>,
    // with comments set apart so the code reads quieter. Safe to run twice.
    const CODE_LANGS = {
        javascript: 'JavaScript', js: 'JavaScript', jsx: 'JSX', typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TSX',
        html: 'HTML', xml: 'XML', css: 'CSS', scss: 'SCSS', json: 'JSON', python: 'Python', py: 'Python',
        bash: 'Bash', shell: 'Shell', sh: 'Shell', zsh: 'Shell', sql: 'SQL', java: 'Java', kotlin: 'Kotlin',
        swift: 'Swift', c: 'C', cpp: 'C++', 'c++': 'C++', csharp: 'C#', cs: 'C#', go: 'Go', rust: 'Rust',
        glsl: 'GLSL', yaml: 'YAML', yml: 'YAML', markdown: 'Markdown', md: 'Markdown', text: 'Text', plaintext: 'Text'
    };
    const HASH_COMMENT_LANGS = new Set(['python', 'py', 'bash', 'shell', 'sh', 'zsh', 'yaml', 'yml']);

    function legacyCodeText(pre) {
        const lines = [];
        pre.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.trim()) lines.push(...node.textContent.split('\n'));
                return;
            }
            if (!(node instanceof Element)) return;
            if (node.tagName === 'BR') { lines.push(''); return; }
            // A paragraph holding only <br> is an empty line; <br> inside text breaks the line.
            const parts = [''];
            node.childNodes.forEach(function walk(child) {
                if (child.nodeType === Node.TEXT_NODE) parts[parts.length - 1] += child.textContent;
                else if (child.tagName === 'BR') parts.push('');
                else child.childNodes.forEach(walk);
            });
            if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
            lines.push(...parts);
        });
        return lines.map(line => line.replace(/ /g, ' ').replace(/​/g, '')).join('\n');
    }

    function markComments(code, lang) {
        if (code.children.length || code.dataset.marked) return;
        const text = code.textContent;
        const hash = HASH_COMMENT_LANGS.has(lang);
        const css = lang === 'css' || lang === 'scss';
        const markup = lang === 'html' || lang === 'xml';
        // Comments only, and only where they cannot be part of a string or an address:
        // a line comment must start the line or follow a space or a semicolon.
        const pattern = markup ? /<!--[\s\S]*?-->/g
            : hash ? /(^|[ \t;])(#[^\n]*)/gm
            : css ? /\/\*[\s\S]*?\*\//g
            : /\/\*[\s\S]*?\*\/|(^|[ \t;{}])(\/\/[^\n]*)/gm;
        const fragment = document.createDocumentFragment();
        let last = 0, match, found = false;
        while ((match = pattern.exec(text))) {
            const lead = match[2] !== undefined ? match[1].length : 0;
            const start = match.index + lead;
            const comment = match[2] !== undefined ? match[2] : match[0];
            if (start > last) fragment.append(text.slice(last, start));
            const span = document.createElement('span');
            span.className = 'code-comment';
            span.textContent = comment;
            fragment.append(span);
            last = start + comment.length;
            found = true;
        }
        if (!found) return;
        if (last < text.length) fragment.append(text.slice(last));
        code.replaceChildren(fragment);
        code.dataset.marked = '1';
    }

    function normalizeCodeBlocks(root) {
        if (!(root instanceof Element)) return;
        root.querySelectorAll('pre').forEach(pre => {
            if (pre.querySelector(':scope > .code-head')) return;
            let code = pre.querySelector(':scope > code');
            let lang = (code?.className.match(/(?:^|\s)language-([\w+#-]+)/) || [])[1]?.toLowerCase() || '';
            if (!code) {
                let text = legacyCodeText(pre);
                const firstLine = text.split('\n', 1)[0].trim().toLowerCase();
                if (!lang && CODE_LANGS[firstLine] && text.includes('\n')) {
                    lang = firstLine;
                    text = text.slice(text.indexOf('\n') + 1);
                }
                code = document.createElement('code');
                code.textContent = text.replace(/^\n+|\s+$/g, '');
                pre.replaceChildren(code);
            } else {
                // Whatever else sat beside the code (stray breaks, a label) goes.
                [...pre.childNodes].forEach(node => { if (node !== code) node.remove(); });
                if (!code.children.length) code.textContent = code.textContent.replace(/^\n+|\s+$/g, '');
            }
            if (lang) code.classList.add('language-' + lang);
            pre.dataset.lang = lang || 'code';
            pre.removeAttribute('style');
            pre.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
            markComments(code, lang);

            const head = document.createElement('span');
            head.className = 'code-head';
            const label = document.createElement('span');
            label.className = 'code-lang';
            label.textContent = CODE_LANGS[lang] || (lang ? lang.toUpperCase() : 'Code');
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'code-copy';
            copy.textContent = 'Copy';
            copy.setAttribute('aria-label', '코드 복사');
            head.append(label, copy);
            pre.prepend(head);
        });
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
            document.body.append(area);
            area.select();
            let done = false;
            try { done = document.execCommand('copy'); } catch { done = false; }
            area.remove();
            return done;
        }
    }

    document.addEventListener('click', async event => {
        const button = event.target instanceof Element && event.target.closest('pre > .code-head > .code-copy');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const code = button.closest('pre').querySelector(':scope > code');
        const done = code && await copyText(code.textContent);
        button.textContent = done ? 'Copied' : 'Failed';
        button.classList.toggle('is-done', Boolean(done));
        clearTimeout(button._reset);
        button._reset = setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('is-done'); }, 1600);
    });

    // The old editor spaced things with empty paragraphs (<p><br></p>). Next to a heading, a
    // picture or a code block they doubled the pause the reading rhythm already gives, so they are
    // marked here and css/reading.css lets them through only between paragraphs, as a short rest.
    function markSpacers(root) {
        if (!(root instanceof Element)) return;
        root.querySelectorAll('p').forEach(p => {
            if (p.closest('pre, td, th, figcaption')) return;
            if (p.querySelector('img, video, iframe, svg, picture, input, button')) return;
            if (p.textContent.replace(/[\s ​]/g, '') === '') p.classList.add('post-spacer');
        });
    }

    function enhanceEditorialLayout(root, { title = '' } = {}) {
        normalizeCodeBlocks(root);
        markSpacers(root);
        if (!(root instanceof Element) || root.querySelector(':scope > .post-editorial-section, :scope > .post-editorial-intro')) return;

        const sourceNodes = [];
        const fragment = document.createDocumentFragment();
        let introNodes = [];
        let currentSection = null;
        let currentCopy = null;

        const isWhitespace = node => node.nodeType === Node.TEXT_NODE && !node.textContent.trim();
        const isHeading = node => node instanceof Element && /^(H1|H2)$/.test(node.tagName);
        const isStandaloneBlock = node => node instanceof Element && node.matches(
            '.post-split-section, .image-grid, .story-slider, .img-zoom-wrapper, figure, img, pre, table, hr'
        );

        function collectSourceNode(node) {
            const malformedHeadingWrapper = isHeading(node) && (
                node.textContent.trim().length > 140
                || node.querySelector('p, div, section, article, ul, ol, blockquote, figure, img, table')
            );
            if (malformedHeadingWrapper) {
                Array.from(node.childNodes).forEach(collectSourceNode);
                return;
            }
            sourceNodes.push(node);
        }

        Array.from(root.childNodes).forEach(collectSourceNode);
        const firstContent = sourceNodes.find(node => node instanceof Element && !node.matches('.hidden-thumbnail'));
        if (firstContent?.tagName === 'H1' && title.trim() && firstContent.textContent.trim() === title.trim()) {
            firstContent.hidden = true;
            firstContent.dataset.publicationTitle = 'duplicate';
        }

        function flushIntro() {
            if (!introNodes.length) return;
            const section = document.createElement('section');
            section.className = 'post-editorial-intro';
            const inner = document.createElement('div');
            inner.className = 'post-editorial-intro-inner';
            introNodes.forEach(node => inner.appendChild(node));
            section.appendChild(inner);
            fragment.appendChild(section);
            introNodes = [];
        }

        function flushSection() {
            if (!currentSection) return;
            if (currentCopy && !currentCopy.childNodes.length) currentCopy.remove();
            fragment.appendChild(currentSection);
            currentSection = null;
            currentCopy = null;
        }

        sourceNodes.forEach(node => {
            if (isWhitespace(node)) return;
            if (node instanceof Element && node.dataset.publicationTitle) {
                fragment.appendChild(node);
                return;
            }
            if (node instanceof Element && node.classList.contains('hidden-thumbnail')) {
                flushIntro();
                flushSection();
                fragment.appendChild(node);
                return;
            }
            if (isHeading(node)) {
                flushIntro();
                flushSection();
                currentSection = document.createElement('section');
                currentSection.className = 'post-editorial-section';
                const heading = document.createElement('div');
                heading.className = 'post-editorial-heading';
                currentCopy = document.createElement('div');
                currentCopy.className = 'post-editorial-copy';
                heading.appendChild(node);
                currentSection.append(heading, currentCopy);
                return;
            }
            if (isStandaloneBlock(node)) {
                flushIntro();
                flushSection();
                fragment.appendChild(node);
                return;
            }
            if (currentCopy) currentCopy.appendChild(node);
            else introNodes.push(node);
        });

        flushIntro();
        flushSection();
        root.replaceChildren(fragment);
        let sectionNumber = 0;
        root.querySelectorAll('.post-editorial-heading, .post-split-section > h2').forEach((heading) => {
            if (heading.classList.contains('post-editorial-heading') && !heading.parentElement.querySelector('.post-editorial-copy')) return;
            sectionNumber++;
            if (!/^\d+[.)]/.test(heading.textContent.trim())) heading.dataset.sectionNumber = String(sectionNumber).padStart(2, '0');
        });
        root.dataset.editorialLayout = 'ready';
    }

    window.PostContent = {
        isStoredHtml,
        toRenderableHtml,
        normalizeCodeBlocks,
        enhanceEditorialLayout
    };
}());
