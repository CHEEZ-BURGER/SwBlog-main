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

    function enhanceEditorialLayout(root, { title = '' } = {}) {
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
        enhanceEditorialLayout
    };
}());
