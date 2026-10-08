/* The page-to-page transition (css/pageTransition.css) needs what the stylesheet cannot know:
   whether a move goes back through history (it then runs the other way round), and whether the
   page was left from its open menu (the menu is then carried across and shut on arrival). The
   browser asks the page being left ('pageswap') and the page arriving ('pagereveal'); the page
   being left writes a note for the next one in sessionStorage. This file is loaded as a plain
   script in the head, so it reads the note and is listening before the arriving page's first
   frame.

   window.SwblogArrival resolves when the arriving page has mostly been uncovered (at once when
   there is no transition), so a page can hold its entrance until it can be seen. */
(() => {
    'use strict';
    const DURATION = 1100;
    const NOTE = 'swblog-move';
    const root = document.documentElement;
    const isBack = (fromIndex, toIndex, type) => type === 'traverse' && toIndex < fromIndex;
    const menuOpen = () => document.body?.classList.contains('menu-open') || false;

    // The note from the page just left, if this arrival is that move: read here for a page that
    // loads, and again on 'pageshow' for one brought back from memory (whose head does not run).
    function readNote() {
        let note = null;
        try {
            note = JSON.parse(sessionStorage.getItem(NOTE) || 'null');
            sessionStorage.removeItem(NOTE);
        } catch (_) { /* storage may be unavailable */ }
        if (!note || Date.now() - note.at > 5000) return;
        root.classList.add('pt-arrived');
        if (note.menu) root.classList.add('menu-carry');
    }
    readNote();

    let arrive;
    window.SwblogArrival = new Promise(resolve => { arrive = resolve; });

    // The carried menu shuts (and the arrow turns back) once the page is in.
    const settle = () => root.classList.remove('menu-carry');

    window.addEventListener('pageswap', event => {
        const transition = event.viewTransition, activation = event.activation;
        if (!transition || !activation) return;
        const current = window.navigation?.currentEntry;
        if (isBack(current?.index ?? -1, activation.entry?.index ?? -1, activation.navigationType)) transition.types?.add('back');
        const carry = menuOpen();
        root.classList.toggle('pt-carry-out', carry);
        try { sessionStorage.setItem(NOTE, JSON.stringify({ at: Date.now(), menu: carry })); } catch (_) { /* ignore */ }
    });

    window.addEventListener('pagereveal', event => {
        const transition = event.viewTransition;
        const activation = window.navigation?.activation;
        if (!transition) { settle(); arrive(); return; }
        if (activation && isBack(activation.from?.index ?? -1, activation.entry?.index ?? -1, activation.navigationType)) transition.types?.add('back');
        transition.ready.then(() => window.setTimeout(arrive, DURATION * .55), arrive);
        transition.finished.finally(settle);
    });

    // No transition is coming (an older browser): arrive at once. Otherwise a late safety net.
    if (!('onpagereveal' in window)) { settle(); arrive(); }
    else window.addEventListener('load', () => window.setTimeout(() => { settle(); arrive(); }, DURATION + 400), { once: true });

    // Back to a page kept in memory: nothing it named for the move it made stays named.
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        root.classList.remove('pt-carry-out');
        readNote();
    });
})();
