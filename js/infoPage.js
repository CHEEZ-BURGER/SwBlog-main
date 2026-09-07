(function () {
    'use strict';

    const menu = document.getElementById('site-menu');
    const menuButton = document.querySelector('.btn-body');
    const overlay = document.getElementById('page-transition');
    const scrim = document.getElementById('menu-index-scrim');

    function syncScrim(open) {
        if (!scrim || !menu) return;
        scrim.style.width = '100vw';
        scrim.classList.toggle('active', Boolean(open));
    }

    function setMenu(open) {
        menu?.classList.toggle('active', open);
        menu?.toggleAttribute('inert', !open);
        menu?.setAttribute('aria-hidden', String(!open));
        document.body.classList.toggle('menu-open', open);
        document.querySelector('.up-bar')?.classList.toggle('active', open);
        document.querySelector('.down-bar')?.classList.toggle('active', open);
        menuButton?.setAttribute('aria-expanded', String(open));
        menuButton?.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
        syncScrim(open);
    }

    function navigateWithTransition(url) {
        if (!overlay) {
            window.location.href = url;
            return;
        }
        setMenu(false);
        overlay.classList.add('is-resetting');
        overlay.classList.remove('is-covering', 'is-revealing', 'is-entering');
        void overlay.offsetWidth;
        overlay.classList.remove('is-resetting');
        overlay.classList.add('is-entering');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('is-navigating');
        window.setTimeout(() => { window.location.href = url; }, 820);
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.add('loaded');
        document.querySelectorAll('.current-year').forEach((element) => {
            element.textContent = String(new Date().getFullYear());
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay?.classList.add('is-revealing');
                overlay?.setAttribute('aria-hidden', 'true');
                window.setTimeout(() => overlay?.classList.remove('is-covering'), 900);
            });
        });

        menuButton?.addEventListener('click', () => setMenu(!menu?.classList.contains('active')));

        document.querySelectorAll('a[data-page-transition]').forEach((link) => {
            link.addEventListener('click', (event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigateWithTransition(link.href);
            });
        });

        document.querySelectorAll('[data-menu-anchor], .info-scroll-cue').forEach((link) => {
            link.addEventListener('click', (event) => {
                const target = document.querySelector(link.getAttribute('href'));
                if (!target) return;
                event.preventDefault();
                setMenu(false);
                window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 240);
            });
        });

        window.addEventListener('resize', () => syncScrim(menu?.classList.contains('active')), { passive: true });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && menu?.classList.contains('active')) setMenu(false);
        if (event.key !== 'Tab' || !menu?.classList.contains('active')) return;
        const focusable = [...menu.querySelectorAll('a[href], button:not([disabled])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
})();
