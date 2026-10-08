/* The reader preview: preview.html in an iframe, fed the post being written. */
(function () {
    const dialog = document.getElementById('publication-preview-dialog');
    const frame = document.getElementById('publication-preview-frame');
    let returnFocus;
    let sampleMode = false;

    function currentPost() {
        return {
            title: document.getElementById('post-title').value,
            category: document.getElementById('post-category').value,
            content: typeof getCleanEditorHtml === 'function' ? getCleanEditorHtml() : '',
            type: typeof getPostType === 'function' ? getPostType() : 'blog'
        };
    }

    function sendPreview() {
        if (sampleMode || !dialog.open || frame.contentWindow?.location.origin !== location.origin) return;
        frame.contentWindow.postMessage({ type: 'swblog-preview', post: currentPost() }, location.origin);
    }

    window.openPublicationPreview = ({ sample = false } = {}) => {
        const wasSample = sampleMode;
        sampleMode = sample;
        returnFocus = document.activeElement;
        if (typeof editor !== 'undefined') editor.closeFloating?.();
        dialog.showModal();
        if (frame.getAttribute('src') === 'about:blank' || sampleMode !== wasSample) frame.src = './preview.html?embed=1';
        else sendPreview();
    };

    window.addEventListener('message', event => {
        if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'swblog-preview-ready') sendPreview();
    });
    dialog.querySelector('.preview-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => returnFocus?.focus?.({ preventScroll: true }));
    dialog.querySelectorAll('[data-preview-size]').forEach(button => button.addEventListener('click', () => {
        dialog.dataset.size = button.dataset.previewSize;
        dialog.querySelectorAll('[data-preview-size]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    }));
})();
