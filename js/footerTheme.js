(function () {
    const tone = { name: 'monochrome', color: '#191919', ink: '#f5f5f3' };

    document.documentElement.style.setProperty('--footer-accent', tone.color);
    document.documentElement.style.setProperty('--footer-accent-ink', tone.ink);
    document.querySelectorAll('[data-random-footer]').forEach((footer) => {
        footer.dataset.footerTone = tone.name;
        const wordmark = footer.querySelector('.footer-wordmark');
        if (wordmark) wordmark.textContent = 'KIMSUNGWOO';
        const top = document.createElement('button');
        top.type = 'button'; top.className = 'footer-top-button'; top.textContent = '↑';
        top.setAttribute('aria-label', '맨 위로 이동');
        top.addEventListener('click', () => {
            const scroller = matchMedia('(max-width:1180px)').matches && !footer.closest('.post-panel')
                ? window : (footer.closest('.post-panel,.index-panel') || window);
            scroller.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        });
        footer.querySelector('.footer-bottom')?.append(top);
        footer.querySelectorAll('a[href="./index.html"]').forEach(link => {
            if (!document.getElementById('post-panel-viewer')) return;
            link.addEventListener('click', event => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                if (document.getElementById('post-panel-viewer').classList.contains('active-state')) window.returnToPostList();
                else top.click();
            });
        });
    });
    document.querySelectorAll('.post-continuation-label').forEach(label => label.textContent = '다음으로 읽을 글');
})();
