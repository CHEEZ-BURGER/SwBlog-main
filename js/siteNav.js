/* The top of the pages beside the index (css/site.css .site-nav): the arrow button and its menu,
   as on the index, and the bar that tucks away while the reader scrolls down, so nothing runs
   under the logo, and comes back on the way up on a plain surface the colour of what lies beneath
   it: the page, or a section that marks itself with data-nav-surface="soft" (#f5f5f7). At the
   top of the page it is bare. */
(() => {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;

    // ----- The menu -----
    const menu = document.getElementById('site-menu');
    const button = nav.querySelector('.site-menu-hit');
    const scrim = document.querySelector('.site-menu-scrim');
    const isOpen = () => document.body.classList.contains('menu-open');

    function setMenu(open, { focus = false } = {}) {
        if (!menu || !button || open === isOpen()) return;
        document.body.classList.toggle('menu-open', open);
        menu.classList.toggle('is-open', open);
        menu.toggleAttribute('inert', !open);
        menu.setAttribute('aria-hidden', String(!open));
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
        if (open) nav.classList.remove('is-tucked');
        if (focus) (open ? menu.querySelector('a') : button)?.focus({ preventScroll: true });
    }

    button?.addEventListener('click', event => setMenu(!isOpen(), { focus: event.detail === 0 }));
    scrim?.addEventListener('click', () => setMenu(false));
    document.addEventListener('keydown', event => {
        if (!isOpen()) return;
        if (event.key === 'Escape') { setMenu(false, { focus: true }); return; }
        if (event.key !== 'Tab') return;
        // Keep the keyboard between the arrow button and the menu while it is open.
        const stops = [button, ...menu.querySelectorAll('a[href]')];
        const at = stops.indexOf(document.activeElement);
        const next = at === -1 ? 0 : (at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
        event.preventDefault();
        stops[next].focus();
    });
    // Back to this page from memory: the menu that led away is shut.
    window.addEventListener('pageshow', event => { if (event.persisted) setMenu(false); });

    // ----- The bar -----
    const TOP = 8;       // still "at the top" up to here
    const TUCK = 120;    // never tucks before the page has moved this far
    const NOISE = 6;     // ignore scroll changes smaller than this

    let last = Math.max(0, window.scrollY);
    let queued = false;

    function surfaceUnder() {
        const y = nav.offsetHeight / 2;
        const hit = document.elementsFromPoint(window.innerWidth / 2, y).find(el => !nav.contains(el));
        const marked = hit && hit.closest('[data-nav-surface]');
        return marked ? marked.dataset.navSurface : '';
    }

    function update() {
        queued = false;
        const y = Math.max(0, window.scrollY);
        const away = y > TOP;
        const surface = away ? surfaceUnder() : '';
        nav.classList.toggle('is-scrolled', away);
        if (!away) {
            nav.classList.remove('is-tucked');
            last = y;
        } else if (Math.abs(y - last) > NOISE) {
            const down = y > last;
            // Keep it out while the menu is open or a control in it has the keyboard focus.
            nav.classList.toggle('is-tucked', down && y > TUCK && !isOpen() && !nav.contains(document.activeElement));
            last = y;
        }
        if (nav.dataset.surface !== surface) nav.dataset.surface = surface;
    }

    function queue() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
    }

    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    nav.addEventListener('focusin', () => nav.classList.remove('is-tucked'));
    update();
})();
