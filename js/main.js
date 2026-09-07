(function () {
  'use strict';

  if (window.__SWBLOG_MAIN_JS_LOADED__) return;
  window.__SWBLOG_MAIN_JS_LOADED__ = true;

  function btn_1() {
    const up_1 = document.querySelector('.up-bar');
    const down_1 = document.querySelector('.down-bar');
    const headerHidden = document.querySelector('.header-hidden');
    const isOpen = headerHidden && !headerHidden.classList.contains('active');

    if (up_1) up_1.classList.toggle('active');
    if (down_1) down_1.classList.toggle('active');
    if (headerHidden) headerHidden.classList.toggle('active');
    document.body.classList.toggle('menu-open', isOpen);

    const scrim = document.getElementById('menu-index-scrim');
    if (scrim && headerHidden) {
      scrim.style.width = '100vw';
      scrim.classList.toggle('active', Boolean(isOpen));
    }

    if (headerHidden) {
      headerHidden.toggleAttribute('inert', !isOpen);
      headerHidden.setAttribute('aria-hidden', String(!isOpen));
    }

    const trigger = document.querySelector('.btn-body');
    if (trigger) {
      trigger.setAttribute('aria-expanded', String(Boolean(isOpen)));
      trigger.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
    }
  }

  window.btn_1 = btn_1;

  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

  function nudgeLandingRail(attempt = 0) {
    if (!document.body.classList.contains('landing-state')) return;
    const rail = document.getElementById('post-panel-placeholder');
    const scene = rail?.placeholderScene || window.globalPlaceholderScene;
    if (scene?.cards?.length && typeof scene.nudge === 'function') {
      scene.nudge();
      return;
    }
    if (attempt < 18) window.setTimeout(() => nudgeLandingRail(attempt + 1), 120);
  }

  async function runIndexIntro() {
    const root = document.documentElement;
    const scene = document.getElementById('index-intro-scene');
    if (!root.classList.contains('intro-pending') || !scene) return;

    const hi = scene.querySelector('[data-intro-word="hi"]');
    const name = scene.querySelector('[data-intro-word="name"]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.body.classList.add('intro-active');

    const visited = sessionStorage.getItem('swblog-intro-seen');
    if (!reducedMotion && !visited && !new URLSearchParams(location.search).has('post')) {
      name?.classList.add('is-visible');
      await wait(400);
      scene.classList.add('is-revealing');
      await wait(500);
    }
    sessionStorage.setItem('swblog-intro-seen', '1');

    root.classList.remove('intro-pending');
    document.body.classList.remove('intro-active');
    scene.remove();
    window.dispatchEvent(new CustomEvent('index-intro-complete'));

  }

  function installPageTransitions() {
    const overlay = document.getElementById('page-transition');
    if (!overlay) return;

    document.querySelectorAll('a[data-page-transition]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const destination = link.href;
        if (!destination) return;
        event.preventDefault();

        const menu = document.querySelector('.header-hidden');
        if (menu?.classList.contains('active')) btn_1();
        overlay.setAttribute('aria-hidden', 'false');
        overlay.classList.add('is-entering');
        document.body.classList.add('is-navigating');

        window.setTimeout(() => {
          window.location.href = destination;
        }, 820);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    installPageTransitions();
    runIndexIntro();

    window.addEventListener('resize', () => {
      const menu = document.querySelector('.header-hidden');
      const scrim = document.getElementById('menu-index-scrim');
      if (!menu?.classList.contains('active') || !scrim) return;
      scrim.style.width = '100vw';
      scrim.classList.add('active');
    }, { passive: true });
    const keyboardButtons = document.querySelectorAll('[role="button"][tabindex="0"]');
    keyboardButtons.forEach((button) => {
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        button.click();
      });
    });

    document.addEventListener('keydown', (event) => {
      const fullscreen = document.getElementById('fullscreen-viewer');
      const postViewer = document.getElementById('post-panel-viewer');
      const menu = document.querySelector('.header-hidden');

      if (event.key === 'Tab') {
        const activeDialog = menu?.classList.contains('active')
          ? menu
          : (fullscreen?.classList.contains('visible')
            ? fullscreen
            : (postViewer?.classList.contains('active-state') && window.matchMedia('(max-width: 1180px)').matches ? postViewer : null));
        if (!activeDialog) return;
        const focusable = [...activeDialog.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
          .filter((element) => !element.hasAttribute('disabled'));
        if (activeDialog === postViewer) {
          const closeButton = document.querySelector('.panel-close-btn:not([hidden])');
          if (closeButton) focusable.unshift(closeButton);
        }
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
        return;
      }

      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.body.classList.contains('contents-open') || document.body.classList.contains('archive-pinned')) return;

      if (menu && menu.classList.contains('active')) {
        btn_1();
      } else if (fullscreen && fullscreen.classList.contains('visible') && window.closeFullscreen) {
        window.closeFullscreen();
      } else if (postViewer && postViewer.classList.contains('active-state') && window.closePanelPost) {
        window.closePanelPost();
      }
    });
  });
})();
