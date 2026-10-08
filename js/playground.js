/* Playground (playground.html): every post as a picture on a dark field that runs on forever in
   both directions, seen through a soft lens. Tiles near the middle of the screen are larger and
   pushed apart, tiles towards the edges shrink, so the field reads as a glass slid over a sheet
   of pictures. Drag, flick, wheel or use the arrow keys to move it; it always comes to rest with
   one post in the middle, and that post's number, kind, title, hashtags and date rise into the
   caption (a picture pointed at with a mouse takes the caption while it is pointed at). A click
   opens a post in the index's reader; on a touch screen the first tap brings a post to the
   middle and a tap on the middle one opens it. Filters (kind and hashtag) send the field out and
   ripple the remaining posts back in from the middle.

   How it stays smooth: tiles are built once and only ever moved with transform and opacity,
   from one requestAnimationFrame loop that stops as soon as nothing moves. Nothing is measured
   inside the loop (sizes come from a ResizeObserver), pictures are decoded before they are shown,
   and tiles outside the screen are hidden rather than drawn.

   With reduced motion the page opens on the list (the same posts as plain rows); the field can
   still be picked, and then moves without glides, ripples or rolling captions. */
(() => {
    'use strict';
    const root = document.getElementById('playground');
    if (!root) return;

    const EXPO = 'cubic-bezier(.19,1,.22,1)';

    // Tile shape, as shares of the tile width.
    const RATIO = 1.2;              // height ÷ width: the site's card shape
    const GUTTER = 0.5;             // the space between tiles

    // The lens. A tile's scale falls from SCALE_MID in the middle of the screen to SCALE_EDGE far
    // out, as a Gaussian of its distance from the middle (measured in half-screens, so the lens
    // takes the screen's shape). Positions are magnified by the same amount at every point (a
    // tile's distance from the middle is the integral of the scale along the way), so tiles and
    // the gaps between them grow and shrink together and the field looks seen through glass,
    // without a rim or a seam.
    const SCALE_MID = 1.6, SCALE_EDGE = 0.42, SPREAD = 0.62;

    // The camera reaches its target by exponential glides; these are their time constants in ms.
    // An exponential glide is the site's expo-out curve without a set end (τ 210 ms reads like an
    // expo-out of about 1.4 s). A flick is thrown as far as its glide carries it (speed × τ), so
    // the field leaves the finger at the finger's own speed.
    const TAU = { drag: 34, flick: 330, wheel: 140, key: 210, settle: 220 };
    const PULL_BACK = 0.065;        // how far the field draws back while it travels fast
    const ZOOM_TAU = 280;
    const IN_TIME = 1150, IN_SPREAD = 560, OUT_TIME = 320;   // filter ripple, ms
    const SLOP = { mouse: 4, pen: 6, touch: 8 };              // px before a press becomes a drag
    const DECODE_WAIT = 3200;       // longest wait for the pictures before the field opens anyway

    const stage = root.querySelector('.pg-stage');
    const fieldEl = root.querySelector('.pg-field');
    const filtersEl = root.querySelector('.pg-filters');
    const typeChips = root.querySelector('.pg-chips-type');
    const tagChips = root.querySelector('.pg-chips-tag');
    const captionEl = root.querySelector('.pg-caption');
    const listEl = root.querySelector('.pg-list');
    const statusEl = root.querySelector('.pg-status');
    const liveEl = document.getElementById('pg-live');
    const viewButtons = [...root.querySelectorAll('.pg-views button')];
    const lines = Object.fromEntries([...captionEl.querySelectorAll('[data-line]')].map(el => [el.dataset.line, el]));

    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const still = () => motion.matches;

    const wrap = (v, period) => v - period * Math.round(v / period);   // into [-period/2, period/2]
    const mod = (v, n) => ((v % n) + n) % n;
    const expoOut = p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
    const smooth = p => p * p * (3 - 2 * p);

    // The error function for x ≥ 0 (Abramowitz and Stegun 7.1.26, good to 1.5e-7), the integral
    // of the lens's Gaussian.
    function erf(x) {
        const t = 1 / (1 + 0.3275911 * x);
        return 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    }
    const LENS_AREA = (SCALE_MID - SCALE_EDGE) * SPREAD * Math.sqrt(Math.PI) / 2;
    // How much farther from the middle a point at distance r is drawn (r in half-screens).
    const reachOf = r => (r < 1e-4 ? SCALE_MID : (SCALE_EDGE * r + LENS_AREA * erf(r / SPREAD)) / r);
    const scaleOf = r2 => SCALE_EDGE + (SCALE_MID - SCALE_EDGE) * Math.exp(-r2 / (SPREAD * SPREAD));
    // The distance on the field that the lens draws at screen distance d (the lens's inverse).
    function unlens(d) {
        let lo = 0, hi = 8;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (mid * reachOf(mid) < d) lo = mid; else hi = mid;
        }
        return lo;
    }

    let posts = [];                 // every post, newest first
    let shown = [];                 // the posts that pass the filter
    const filter = { type: 'all', tag: null };
    let view = 'field';
    const ready = new Set();        // pictures decoded and safe to show
    const broken = new Set();       // pictures that failed: their posts get type tiles
    const decoding = new Map();     // src → promise that settles once the picture is decoded

    // Screen and tile sizes, written by measure() (from the ResizeObserver), never read from the DOM.
    const box = { w: 0, h: 0, ax: 1, ay: 1, tw: 0, th: 0, cw: 0, ch: 0, lw: 0, lh: 0 };
    // The camera: the point of the field in the middle of the screen (x, y), where it is heading
    // (tx, ty) and how quickly (tau). snapped says the target is a resting place on a tile;
    // aimX keeps the column being travelled, so stepping up or down the staggered rows weaves
    // around it rather than drifting sideways. hold lets a filter change draw the field back.
    const cam = { x: 0, y: 0, tx: 0, ty: 0, tau: TAU.flick, speed: 0, zoom: 1, hold: 1, aimX: 0, snapped: true };
    let field = null;               // the current arrangement (see arrange)
    let tiles = [];                 // tiles on the field
    const spare = new Map();        // post id → tile elements not in use, kept with their pictures
    const tileOf = new WeakMap();   // tile element → its tile

    let centre = null;              // the post in the middle (or about to be)
    let hover = null, hoverEl = null;
    let captionPost = null;

    // ---- Sizes ---------------------------------------------------------------------------
    function measure(width, height) {
        box.w = width; box.h = height;
        // The lens's half-axes: the half-screen, kept from getting much narrower than it is tall
        // (or flatter than it is wide), so a phone's sides and a laptop's top and foot don't
        // squeeze their tiles to nothing.
        box.ax = Math.max(width / 2, height * 0.375);
        box.ay = Math.max(height / 2, width * 0.375);
        // The tile follows the screen's area: the middle one is about a sixth of a laptop's width
        // and nearly half a phone's.
        box.tw = Math.round(Math.min(200, Math.max(108, Math.sqrt(width * height) * 0.13)));
        box.th = Math.round(box.tw * RATIO);
        box.cw = box.tw * (1 + GUTTER);
        box.ch = box.th + box.tw * GUTTER;
        // Tiles are laid out at their largest and only ever scaled down, so the middle stays sharp.
        box.lw = Math.ceil(box.tw * SCALE_MID);
        box.lh = Math.ceil(box.th * SCALE_MID);
        root.style.setProperty('--pg-lw', box.lw + 'px');
        root.style.setProperty('--pg-lh', box.lh + 'px');
    }

    // ---- Arrangement ---------------------------------------------------------------------
    // The posts are set in one block of staggered rows (odd rows shifted half a tile, like
    // bricks), the newest in the middle of the block and older ones further out. The block is
    // repeated until the field is wider and taller than anything the screen can show, and the
    // camera wraps around that repeat, so the field never ends and never shows a tile twice at once.
    // A handful of posts (a narrow filter) would tile the field like wallpaper, so a block always
    // has at least MIN_CELLS places and a small set is spread evenly over them, leaving dark
    // between; the camera only ever rests on a place with a post.
    const MIN_CELLS = 8;
    function arrange(list) {
        const { cw, ch, w, h } = box;
        const n = list.length, places = Math.max(n, MIN_CELLS);
        let C = 1, R = 2, best = Infinity;
        for (let rows = 2; rows <= places + 1; rows += 2) {     // rows stay even so the bricks tile
            const cols = Math.max(1, Math.ceil(places / rows));
            const waste = (cols * rows - places) / places;
            const shape = Math.abs(Math.log((cols * cw) / (rows * ch) / (w / h)));
            if (waste * 1.5 + shape < best) { best = waste * 1.5 + shape; C = cols; R = rows; }
            if (cols === 1) break;
        }
        const cells = [];
        for (let r = 0; r < R; r++) {
            for (let c = 0; c < C; c++) cells.push({ c, r, x: c * cw + (r & 1) * cw / 2, y: r * ch, post: null });
        }
        const bw = C * cw, bh = R * ch;
        const mx = (C - 1) * cw / 2 + cw / 4, my = (R - 1) * ch / 2;
        const reach = cell => ((cell.x - mx) / w) ** 2 + ((cell.y - my) / h) ** 2;
        const order = [...cells].sort((a, b) => reach(a) - reach(b));
        if (n >= MIN_CELLS) {
            // Newest nearest the middle; the few spare places take the newest posts again.
            order.forEach((cell, i) => { cell.post = list[i % n]; });
        } else {
            // Newest in the middle, then each post at the place furthest from those already set
            // (measured on the screen's proportions and around the repeat, so the spacing looks
            // even and holds across blocks too).
            const apart = (a, b) => (wrap(a.x - b.x, bw) / w) ** 2 + (wrap(a.y - b.y, bh) / h) ** 2;
            const taken = [order[0]];
            while (taken.length < n) {
                let pick = null, room = -1;
                for (const cell of order) {
                    if (taken.includes(cell)) continue;
                    const gap = Math.min(...taken.map(other => apart(cell, other)));
                    if (gap > room + 1e-6) { room = gap; pick = cell; }
                }
                taken.push(pick);
            }
            taken.forEach((cell, i) => { cell.post = list[i]; });
        }
        // How far out on the field the screen can reach: furthest at its corners, with room for a
        // tile, pulled back as far as the field ever draws back, seen backwards through the lens.
        const cx = w / 2 / box.ax, cy = h / 2 / box.ay, corner = Math.hypot(cx, cy);
        const far = unlens(corner * 1.1 / (1 - PULL_BACK)) / corner;
        const rx = Math.max(1, Math.ceil((2 * far * cx * box.ax + cw) / bw));
        const ry = Math.max(1, Math.ceil((2 * far * cy * box.ay + ch) / bh));
        return { C, R, cells, home: order[0], bw, bh, rx, ry, pw: bw * rx, ph: bh * ry };
    }

    const postAt = (c, r) => field.cells[mod(r, field.R) * field.C + mod(c, field.C)].post;

    // The resting place nearest a point: the middle of a tile with a post, optionally one that
    // `accept` allows (the arrow keys ask for one in their direction). Of two equally near, the
    // upper and then the left one wins, which makes vertical travel weave evenly around aimX.
    function nearest(x, y, accept) {
        const { cw, ch } = box;
        const r0 = Math.round(y / ch), c0 = Math.round(x / cw);
        let best = null;
        for (let r = r0 - 3; r <= r0 + 3; r++) {
            for (let c = c0 - 3; c <= c0 + 3; c++) {
                const cx = c * cw + (r & 1) * cw / 2, cy = r * ch;
                const post = postAt(c, r);
                if (!post || (accept && !accept(cx, cy))) continue;
                const d = (cx - x) ** 2 + (cy - y) ** 2;
                if (!best || d < best.d - 1e-6) best = { c, r, x: cx, y: cy, d, post };
            }
        }
        return best;
    }

    // ---- Tiles ---------------------------------------------------------------------------
    function face(post) {
        const card = document.createElement('span');
        card.className = 'pg-face';
        const num = document.createElement('span');
        num.className = 'pg-face-num';
        num.textContent = post.number;
        const title = document.createElement('span');
        title.className = 'pg-face-title';
        title.textContent = post.title || '';
        card.append(num, title);
        return card;
    }

    function build(post) {
        const el = document.createElement('a');
        el.className = 'pg-tile';
        el.href = post.url;
        el.tabIndex = -1;                   // the stage takes the keys; the list is there for reading
        el.draggable = false;
        el.setAttribute('aria-hidden', 'true');
        if (post.image && !broken.has(post.image)) {
            const img = new Image();
            img.alt = '';
            img.draggable = false;
            img.decoding = 'async';
            img.src = post.image;
            img.addEventListener('error', () => { broken.add(post.image); img.replaceWith(face(post)); }, { once: true });
            el.append(img);
        } else {
            el.append(face(post));
        }
        fieldEl.append(el);
        return el;
    }

    const take = post => spare.get(post.id)?.pop() || build(post);

    function park(tile) {
        tile.el.style.visibility = 'hidden';
        tile.el.classList.remove('is-hover');
        if (!spare.has(tile.post.id)) spare.set(tile.post.id, []);
        spare.get(tile.post.id).push(tile.el);
    }

    // Puts the shown posts on the field with the newest in the middle. With ripple, tiles arrive
    // from the middle outwards; a tile whose picture is not decoded yet waits for it.
    function lay(ripple) {
        swapAt = 0;
        cam.hold = 1;
        tiles.forEach(park);
        tiles = [];
        setHover(null);
        if (!shown.length || !box.w) { field = null; showCaption(null); return; }
        field = arrange(shown);
        cam.x = cam.tx = cam.aimX = field.home.x;
        cam.y = cam.ty = field.home.y;
        cam.snapped = true; cam.speed = 0;
        centre = null;
        const now = performance.now();
        const animate = ripple && !still();
        for (let j = 0; j < field.ry; j++) {
            for (let i = 0; i < field.rx; i++) {
                for (const cell of field.cells) {
                    const post = cell.post;
                    if (!post) continue;
                    const tile = { el: take(post), post, x: cell.x + i * field.bw, y: cell.y + j * field.bh, on: false, opacity: -1, mode: null, t0: 0 };
                    if (animate) {
                        const dx = wrap(tile.x - cam.x, field.pw) / (box.w / 2);
                        const dy = wrap(tile.y - cam.y, field.ph) / (box.h / 2);
                        tile.mode = 'in';
                        tile.t0 = now + IN_SPREAD * Math.min(1, Math.hypot(dx, dy) / 1.3);
                    }
                    const src = post.image;
                    if (src && !ready.has(src) && !broken.has(src)) {
                        // Hold the tile back until its picture is decoded, then let it fade in.
                        tile.mode = 'in'; tile.t0 = Infinity;
                        decode(src).then(() => {
                            if (tile.t0 !== Infinity) return;
                            tile.t0 = performance.now();
                            if (still()) tile.mode = null;
                            wake();
                        });
                    }
                    tileOf.set(tile.el, tile);
                    tiles.push(tile);
                }
            }
        }
        wake();
    }

    // ---- The loop ------------------------------------------------------------------------
    let raf = 0, last = 0;
    let swapAt = 0;                 // when a filter change lays the new set (0: none waiting)
    function wake() {
        if (raf || document.hidden || view !== 'field' || !field) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }
    function sleep() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
    }

    function frame(now) {
        raf = 0;
        if (document.hidden) return;
        const dt = Math.min(48, Math.max(1, now - last));
        last = now;
        if (swapAt && now >= swapAt) lay(true);
        const moving = step(dt);
        const fading = render(now) || swapAt > 0;
        follow();
        if (!moving && !fading) rest();
        else if (!raf) raf = requestAnimationFrame(frame);   // lay() may have asked already
    }

    document.addEventListener('visibilitychange', () => document.hidden ? sleep() : wake());

    // Moves the camera towards its target and eases the draw-back. Returns false once at rest.
    function step(dt) {
        const ox = cam.x, oy = cam.y;
        if (still()) {
            cam.x = cam.tx; cam.y = cam.ty;
        } else {
            const f = 1 - Math.exp(-dt / cam.tau);
            cam.x += (cam.tx - cam.x) * f;
            cam.y += (cam.ty - cam.y) * f;
        }
        const v = Math.hypot(cam.x - ox, cam.y - oy) / dt;          // px per ms
        cam.speed += (v - cam.speed) * (1 - Math.exp(-dt / 90));
        const goal = Math.min(cam.hold, still() ? 1 : 1 - PULL_BACK * smooth(Math.min(1, cam.speed / 2.2)));
        cam.zoom = still() ? goal : cam.zoom + (goal - cam.zoom) * (1 - Math.exp(-dt / ZOOM_TAU));
        // Within a sixth of a pixel the last step can't be seen, so the glide ends there rather
        // than creeping on.
        const resting = Math.abs(cam.tx - cam.x) < 0.16 && Math.abs(cam.ty - cam.y) < 0.16
            && Math.abs(goal - cam.zoom) < 0.001;
        if (resting) { cam.x = cam.tx; cam.y = cam.ty; cam.speed = 0; cam.zoom = Math.min(cam.hold, 1); }
        return !resting;
    }

    // Writes every tile's place, size and opacity for this frame. Returns true while a tile is
    // still arriving or leaving.
    function render(now) {
        const { w, h, ax, ay, tw, th, lw, lh } = box;
        const hw = w / 2, hh = h / 2;
        const z = cam.zoom;
        let fading = false;
        for (const tile of tiles) {
            let alpha = 1, grow = 1;
            if (tile.mode === 'in') {
                const p = (now - tile.t0) / IN_TIME;
                if (p >= 1) tile.mode = null;
                else {
                    if (tile.t0 !== Infinity) fading = true;
                    const q = Math.max(0, p);
                    alpha = Math.min(1, q * 2.4);
                    grow = 0.8 + 0.2 * expoOut(q);
                }
            } else if (tile.mode === 'out') {
                const q = Math.min(1, Math.max(0, (now - tile.t0) / OUT_TIME));
                if (q < 1) fading = true;
                alpha = 1 - smooth(q);
                grow = 1 - 0.12 * q;
            }
            const dx = wrap(tile.x - cam.x, field.pw), dy = wrap(tile.y - cam.y, field.ph);
            const nx = dx / ax, ny = dy / ay, r2 = nx * nx + ny * ny;
            const reach = reachOf(Math.sqrt(r2)) * z;
            const s = scaleOf(r2) * z * grow;
            const px = hw + dx * reach, py = hh + dy * reach;
            const seen = alpha > 0.003 && Math.abs(px - hw) < hw + tw * s / 2 && Math.abs(py - hh) < hh + th * s / 2;
            const style = tile.el.style;
            if (!seen) {
                if (tile.on) { style.visibility = 'hidden'; tile.on = false; }
                continue;
            }
            if (!tile.on) { style.visibility = 'visible'; tile.on = true; }
            style.transform = `translate(${(px - lw / 2).toFixed(2)}px,${(py - lh / 2).toFixed(2)}px) scale(${(s / SCALE_MID).toFixed(4)})`;
            if (Math.abs(alpha - tile.opacity) > 0.004 || (alpha === 1 && tile.opacity !== 1)) {
                style.opacity = alpha === 1 ? '' : alpha.toFixed(3);
                tile.opacity = alpha;
            }
        }
        return fading;
    }

    // Keeps the caption on the post in the middle. While the camera heads for a resting place the
    // caption already names the post it will stop on; while dragged it waits for slow movement,
    // so a fast pass over many posts doesn't flick through their names.
    function follow() {
        if (!field) return;
        const cell = cam.snapped ? nearest(cam.tx, cam.ty) : (cam.speed < 0.3 ? nearest(cam.x, cam.y) : null);
        if (cell) {
            const post = cell.post;
            if (post !== centre) {
                centre = post;
                if (document.activeElement === stage) liveEl.textContent = describe(post);
            }
        }
        showCaption(hover || centre);
    }

    // At rest: keep the camera's numbers small, and find what the mouse is over now that the
    // field has stopped moving under it.
    function rest() {
        if (!field) return;
        const sx = Math.floor(cam.x / field.pw) * field.pw, sy = Math.floor(cam.y / field.ph) * field.ph;
        if ((sx || sy) && press.id === null) {          // a held drag still counts from where it began
            cam.x -= sx; cam.tx -= sx; cam.aimX -= sx;
            cam.y -= sy; cam.ty -= sy;
        }
        if (mouse.inside && !mouse.keyed && press.id === null) {
            const el = document.elementFromPoint(mouse.x, mouse.y)?.closest?.('.pg-tile');
            setHover(el ? tileOf.get(el) : null);
        }
    }

    // ---- Moving the camera ---------------------------------------------------------------
    // Sends the camera to the resting place nearest (x, y). aim says the move went sideways,
    // so the column being travelled changes; otherwise the row is chosen around aimX. accepts
    // are tried in turn (the arrow keys' preferences) before any place at all.
    function settleAt(x, y, aim, tau, accepts = []) {
        const px = aim ? x : cam.aimX;
        let cell = null;
        for (const accept of accepts) if ((cell = nearest(px, y, accept))) break;
        cell = cell || nearest(px, y);
        if (!cell) return;
        cam.tx = cell.x; cam.ty = cell.y;
        if (aim) cam.aimX = cell.x;
        cam.tau = tau; cam.snapped = true;
        wake();
    }

    function bring(tile) {
        settleAt(cam.x + wrap(tile.x - cam.x, field.pw), cam.y + wrap(tile.y - cam.y, field.ph), true, TAU.key);
    }

    // Pointer: a press becomes a drag once it has moved a few pixels; until then a click or tap
    // still reaches the tile's link. The grabbed point follows the finger (corrected for the lens
    // where it was grabbed), and letting go throws the field on at the finger's speed.
    const press = { id: null, type: 'mouse', x: 0, y: 0, tx: 0, ty: 0, gain: 1, dragging: false, trail: [] };
    // keyed: the last move came from the keys, so the caption stays on the middle post even if
    // the mouse happens to rest over another picture.
    const mouse = { x: 0, y: 0, inside: false, keyed: false };
    let swallowClick = false;

    stage.addEventListener('pointerdown', event => {
        if (view !== 'field' || !field || press.id !== null) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        swallowClick = false;
        press.id = event.pointerId;
        press.type = event.pointerType;
        press.x = event.clientX; press.y = event.clientY;
        // Catch the field where it is, so a glide stops under the finger.
        cam.tx = cam.x; cam.ty = cam.y; cam.snapped = false;
        const nx = (event.clientX - box.w / 2) / box.ax, ny = (event.clientY - box.h / 2) / box.ay;
        press.gain = 1 / (reachOf(unlens(Math.hypot(nx, ny) / cam.zoom)) * cam.zoom);
        press.tx = cam.tx; press.ty = cam.ty;
        press.trail = [{ t: event.timeStamp, x: cam.tx, y: cam.ty }];
        if (event.pointerType === 'mouse') event.preventDefault();   // no text selection or picture drag
        stage.focus({ preventScroll: true });
    });

    window.addEventListener('pointermove', event => {
        if (event.pointerType === 'mouse') {
            mouse.x = event.clientX; mouse.y = event.clientY; mouse.keyed = false;
            mouse.inside = event.target instanceof Node && stage.contains(event.target);
        }
        if (event.pointerId !== press.id) return;
        let dx = event.clientX - press.x, dy = event.clientY - press.y;
        if (!press.dragging) {
            if (Math.hypot(dx, dy) < (SLOP[press.type] || 6)) return;
            // Start from here, so the field doesn't jump by the slop.
            press.dragging = true;
            press.x = event.clientX; press.y = event.clientY;
            dx = dy = 0;
            try { stage.setPointerCapture(event.pointerId); } catch (error) { /* already released */ }
            root.classList.add('is-dragging');
            setHover(null);
        }
        cam.tx = press.tx - dx * press.gain;
        cam.ty = press.ty - dy * press.gain;
        cam.tau = TAU.drag;
        cam.snapped = false;
        const t = event.timeStamp;
        press.trail.push({ t, x: cam.tx, y: cam.ty });
        while (press.trail.length > 2 && t - press.trail[0].t > 120) press.trail.shift();
        wake();
    }, { passive: true });

    // The finger's speed over its last ~100ms, or nothing if it stopped before letting go.
    function throwSpeed(now) {
        const trail = press.trail, end = trail[trail.length - 1];
        if (!end || now - end.t > 80) return { x: 0, y: 0 };
        let start = end;
        for (let i = trail.length - 1; i >= 0 && end.t - trail[i].t <= 100; i--) start = trail[i];
        const span = end.t - start.t;
        if (span < 12) return { x: 0, y: 0 };
        return { x: (end.x - start.x) / span, y: (end.y - start.y) / span };
    }

    function lift(event) {
        if (event.pointerId !== press.id) return;
        const dragged = press.dragging;
        press.id = null;
        press.dragging = false;
        root.classList.remove('is-dragging');
        if (!field) return;
        if (dragged) {
            swallowClick = true;            // the click after a drag is not a click
            const v = event.type === 'pointerup' ? throwSpeed(event.timeStamp) : { x: 0, y: 0 };
            let gx = v.x * TAU.flick, gy = v.y * TAU.flick;
            const far = Math.max(box.w, box.h) * 2.5, len = Math.hypot(gx, gy);
            if (len > far) { gx *= far / len; gy *= far / len; }
            settleAt(cam.x + gx, cam.y + gy, true, TAU.flick);
        } else if (!cam.snapped) {
            settleAt(cam.x, cam.y, true, TAU.flick);
        }
    }
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift);
    stage.addEventListener('pointerleave', event => {
        if (event.pointerType !== 'mouse') return;
        mouse.inside = false;
        if (!press.dragging) setHover(null);
    });

    stage.addEventListener('click', event => {
        if (swallowClick) {
            swallowClick = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const el = event.target.closest?.('.pg-tile');
        const tile = el && tileOf.get(el);
        if (!tile) return;
        // On touch a tile is first brought to the middle, where its caption can be read.
        if (press.type !== 'mouse' && tile.post !== centre) {
            event.preventDefault();
            bring(tile);
        }
    }, true);

    // Hover (mouse only): the picture under the pointer zooms a little and takes the caption.
    stage.addEventListener('pointerover', event => {
        if (event.pointerType !== 'mouse' || press.dragging) return;
        const el = event.target.closest?.('.pg-tile');
        setHover(el ? tileOf.get(el) : null);
    });
    function setHover(tile) {
        const el = tile?.el || null;
        if (el === hoverEl) return;
        hoverEl?.classList.remove('is-hover');
        el?.classList.add('is-hover');
        hoverEl = el;
        hover = tile ? tile.post : null;
        showCaption(hover || centre);
    }

    // Wheel and trackpad: the field slides with the wheel, and shortly after the wheel stops it
    // settles on the next tile in the direction it was going (so one notch of a mouse wheel is
    // one step, and a trackpad pan comes to rest on a picture).
    let wheelTimer = 0;
    const wheelRun = { x: 0, y: 0 };
    window.addEventListener('wheel', event => {
        if (view !== 'field' || !field || event.ctrlKey) return;
        if (event.target instanceof Node && filtersEl.contains(event.target) && filtersEl.scrollWidth > filtersEl.clientWidth) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.h : 1;
        let dx = event.deltaX * unit, dy = event.deltaY * unit;
        if (event.shiftKey && !dx) { dx = dy; dy = 0; }
        const gain = 1 / SCALE_MID;                         // one to one in the middle of the lens
        if (cam.snapped) { wheelRun.x = 0; wheelRun.y = 0; }
        cam.tx += dx * gain; cam.ty += dy * gain;
        wheelRun.x += dx * gain; wheelRun.y += dy * gain;
        cam.tau = TAU.wheel;
        cam.snapped = false;
        setHover(null);
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(endWheel, 150);
        wake();
    }, { passive: false });

    function endWheel() {
        if (press.id !== null || !field || cam.snapped) return;
        const lean = (run, cell) => Math.sign(run) * Math.min(Math.abs(run), cell * 0.4);
        const sideways = Math.abs(wheelRun.x) > 2;
        settleAt(cam.tx + lean(wheelRun.x, box.cw), cam.ty + lean(wheelRun.y, box.ch), sideways, TAU.settle);
    }

    // Keys: arrows step one tile, Home returns to the newest post, Enter opens the middle one.
    // They work on the focused field, or anywhere when nothing else has focus.
    document.addEventListener('keydown', event => {
        if (view !== 'field' || !field || event.altKey || event.ctrlKey || event.metaKey) return;
        const active = document.activeElement;
        if (active && active !== stage && active !== document.body) return;
        const { cw, ch } = box;
        const { tx, ty } = cam;
        if (event.key.startsWith('Arrow') || event.key === 'Home') { mouse.keyed = true; setHover(null); }
        // Each arrow takes the next post that way: in the same row if there is one, else the nearest.
        switch (event.key) {
            case 'ArrowLeft': settleAt(tx - cw, ty, true, TAU.key, [(x, y) => x < tx - 1 && Math.abs(y - ty) < 1, x => x < tx - 1]); break;
            case 'ArrowRight': settleAt(tx + cw, ty, true, TAU.key, [(x, y) => x > tx + 1 && Math.abs(y - ty) < 1, x => x > tx + 1]); break;
            case 'ArrowUp': settleAt(tx, ty - ch, false, TAU.key, [(x, y) => y < ty - 1]); break;
            case 'ArrowDown': settleAt(tx, ty + ch, false, TAU.key, [(x, y) => y > ty + 1]); break;
            case 'Home': {
                const home = field.home;
                settleAt(cam.x + wrap(home.x - cam.x, field.pw), cam.y + wrap(home.y - cam.y, field.ph), true, TAU.flick);
                break;
            }
            case 'Enter':
                if (centre) location.href = centre.url;
                break;
            default: return;
        }
        event.preventDefault();
    });

    // ---- Caption -------------------------------------------------------------------------
    const kindOf = post => (post.type === 'gallery' ? 'Gallery' : 'Blog');
    const describe = post => [post.number + '. ' + post.title, post.tagLabel, post.date].filter(Boolean).join(', ');

    // Words leave upwards out of their mask and the new ones rise in from below. A line that
    // changes again mid-roll sends its words out from wherever they had got to.
    // `fill`, when given, builds the line's contents (the hashtag pills); `text` then only names it.
    function roll(mask, text, delay, fill) {
        const current = mask.lastElementChild;
        if (current && !current.dataset.leaving && current.dataset.key === text) return;
        // When names change quickly (a pointer sweeping across the field), words that have all
        // but left are dropped, so no more than two lines are ever on their way out.
        const leaving = mask.querySelectorAll('[data-leaving]');
        for (let i = 0; i < leaving.length - 1; i++) leaving[i].remove();
        for (const old of [...mask.children]) {
            if (old.dataset.leaving) continue;
            old.dataset.leaving = '1';
            const from = old.at ? old.at() : 0;
            old.motion?.cancel();
            if (still()) { old.remove(); continue; }
            const out = old.animate([{ transform: `translateY(${from}%)` }, { transform: 'translateY(-110%)' }], { duration: 700, easing: EXPO, fill: 'forwards' });
            out.onfinish = () => old.remove();
        }
        const span = document.createElement('span');
        span.dataset.key = text;
        if (fill) fill(span);
        else span.textContent = text;
        mask.append(span);
        if (still()) return;
        const enter = span.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], { duration: 950, delay, easing: EXPO, fill: 'backwards' });
        span.motion = enter;
        span.at = () => (enter.playState === 'finished' ? 0 : 110 * (1 - (enter.effect.getComputedTiming().progress || 0)));
    }

    function showCaption(post) {
        if (post === captionPost) return;
        captionPost = post;
        captionEl.classList.toggle('is-on', !!post);
        if (!post) return;
        const total = String(posts.length).padStart(2, '0');
        roll(lines.number, `${post.number} / ${total}`, 0);
        roll(lines.type, kindOf(post), 30);
        roll(lines.title, post.title || '', 50);
        // Hashtags as pills (css/tags.css), then the date and reading time.
        const rest = [post.date, post.minutes + ' min read'].filter(Boolean).join('   ·   ');
        roll(lines.tags, [post.tagLabel, rest].join('|'), 90, span => {
            if (post.tags.length) span.append(window.SwblogTags.pills(post.tags));
            span.append(Object.assign(document.createElement('span'), { className: 'pg-cap-rest', textContent: rest }));
        });
    }

    // ---- Filters -------------------------------------------------------------------------
    const KINDS = [['all', 'All'], ['blog', 'Blog'], ['gallery', 'Gallery']];
    const matchesType = (post, type) => type === 'all' || post.type === type;
    const matchesTag = (post, tag) => !tag || post.tags.includes(tag);

    function chip(kind, value, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pg-chip';
        button.dataset.kind = kind;
        button.dataset.value = value;
        button.dataset.label = label;
        const name = document.createElement('span');
        name.textContent = label;
        const count = document.createElement('span');
        count.className = 'pg-chip-count';
        count.setAttribute('aria-hidden', 'true');
        button.append(name, count);
        return button;
    }

    function buildChips() {
        typeChips.replaceChildren(...KINDS.map(([value, label]) => chip('type', value, label)));
        tagChips.replaceChildren(...window.SwblogTags.TAGS.map(tag => chip('tag', tag, tag)));
        updateChips();
    }

    // Each count says how many posts that chip would show with the other filter as it is; a
    // chip that would show nothing is switched off.
    function updateChips() {
        for (const button of [...typeChips.children, ...tagChips.children]) {
            const { kind, value, label } = button.dataset;
            const isType = kind === 'type';
            const count = posts.filter(post => (isType
                ? matchesType(post, value) && matchesTag(post, filter.tag)
                : matchesTag(post, value) && matchesType(post, filter.type))).length;
            const pressed = isType ? filter.type === value : filter.tag === value;
            button.lastElementChild.textContent = String(count);
            button.setAttribute('aria-pressed', String(pressed));
            button.setAttribute('aria-label', `${label}, ${count}개`);
            button.disabled = !count && !pressed;
        }
    }

    filtersEl.addEventListener('click', event => {
        const button = event.target.closest('.pg-chip');
        if (!button || button.disabled) return;
        const { kind, value } = button.dataset;
        if (kind === 'type') filter.type = value;
        else filter.tag = filter.tag === value ? null : value;
        refilter();
    });

    function refilter() {
        const next = posts.filter(post => matchesType(post, filter.type) && matchesTag(post, filter.tag));
        updateChips();
        writeUrl();
        const same = next.length === shown.length && next.every((post, i) => post === shown[i]);
        shown = next;
        if (same) return;
        if (view === 'list') { showList(true); return; }
        if (!field || still()) { lay(false); return; }
        // The field draws back a little while its tiles shrink away, then the loop lays the new
        // set, which ripples in.
        const now = performance.now();
        for (const tile of tiles) {
            if (tile.mode === 'out') continue;
            tile.mode = 'out';
            tile.t0 = now;
        }
        cam.hold = 0.95;
        swapAt = now + OUT_TIME;
        setHover(null);
        wake();
    }

    // ---- The list ------------------------------------------------------------------------
    function row(post) {
        const li = document.createElement('li');
        li.className = 'pg-row';
        li.dataset.id = String(post.id);
        const link = document.createElement('a');
        link.href = post.url;
        const cell = (className, text, tag = 'span') => {
            const el = document.createElement(tag);
            el.className = className;
            el.textContent = text;
            return el;
        };
        const thumb = cell('pg-row-thumb', '');
        if (post.image) {
            const img = new Image();
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = post.image;
            img.addEventListener('error', () => img.remove(), { once: true });
            thumb.append(img);
        }
        thumb.setAttribute('aria-hidden', 'true');
        // The hashtags as pills (css/tags.css).
        const tagsCell = cell('pg-row-tags', '');
        tagsCell.append(window.SwblogTags.pills(post.tags));
        link.append(
            cell('pg-row-num', post.number),
            thumb,
            cell('pg-row-title', post.title || ''),
            tagsCell,
            cell('pg-row-type', kindOf(post)),
            cell('pg-row-date', post.date, 'time')
        );
        li.append(link);
        return li;
    }

    function showList(animate) {
        const ids = new Set(shown.map(post => String(post.id)));
        let order = 0;
        for (const li of listEl.children) {
            const on = ids.has(li.dataset.id);
            li.hidden = !on;
            if (!on || !animate || still() || order > 24) continue;
            li.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
                { duration: 900, delay: order * 30, easing: EXPO, fill: 'backwards' });
            order += 1;
        }
    }

    // ---- Views ---------------------------------------------------------------------------
    const defaultView = () => (still() ? 'list' : 'field');

    function setView(next, animate) {
        view = next;
        root.dataset.view = next;
        document.documentElement.classList.toggle('pg-locked', next === 'field');
        viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === next)));
        writeUrl();
        if (next === 'list') {
            sleep();
            setHover(null);
            window.scrollTo(0, 0);
            showList(animate);
            return;
        }
        measure(window.innerWidth, window.innerHeight);
        if (animate && !still()) { cam.zoom = 1 - PULL_BACK; cam.hold = 1; }   // the lens draws in as the tiles arrive
        lay(animate);
    }

    viewButtons.forEach(button => button.addEventListener('click', () => {
        if (button.dataset.view !== view && posts.length) setView(button.dataset.view, true);
    }));

    // ---- The address keeps the filter and view, so a link or a return lands on the same field.
    function readUrl() {
        const query = new URLSearchParams(location.search);
        const type = query.get('type');
        if (type === 'blog' || type === 'gallery') filter.type = type;
        const tag = query.get('tag');
        if (window.SwblogTags?.TAGS.includes(tag)) filter.tag = tag;
        const asked = query.get('view');
        view = asked === 'list' || asked === 'field' ? asked : defaultView();
    }
    function writeUrl() {
        const query = new URLSearchParams();
        if (filter.type !== 'all') query.set('type', filter.type);
        if (filter.tag) query.set('tag', filter.tag);
        if (view !== defaultView()) query.set('view', view);
        const search = query.toString();
        history.replaceState(history.state, '', search ? '?' + search : location.pathname);
    }

    // ---- Resizing: the same post stays in the middle -------------------------------------
    new ResizeObserver(entries => {
        const { width, height } = entries[entries.length - 1].contentRect;
        if (!width || !height || (Math.abs(width - box.w) < 0.5 && Math.abs(height - box.h) < 0.5)) return;
        measure(width, height);
        if (!field || view !== 'field') return;
        const keep = centre;
        lay(false);
        const cell = keep && field?.cells.find(c => c.post === keep);
        if (cell) {
            cam.x = cam.tx = cam.aimX = cell.x;
            cam.y = cam.ty = cell.y;
        }
    }).observe(stage);

    // ---- Start ---------------------------------------------------------------------------
    function status(text, retry) {
        statusEl.replaceChildren();
        statusEl.classList.toggle('is-on', !!text);
        if (!text) return;
        const line = document.createElement('p');
        line.textContent = text;
        statusEl.append(line);
        if (retry) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Retry';
            button.addEventListener('click', start, { once: true });
            statusEl.append(button);
        }
    }

    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Settles once a picture is decoded. A browser may hold decode() back while the page can't be
    // seen, so a picture that has loaded counts as ready a little later anyway.
    function decode(src) {
        if (!decoding.has(src)) {
            const img = new Image();
            img.decoding = 'async';
            img.src = src;
            const loaded = new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            });
            decoding.set(src, Promise.race([img.decode(), loaded.then(() => pause(1500))])
                .then(() => (img.naturalWidth ? ready : broken).add(src), () => broken.add(src)));
        }
        return decoding.get(src);
    }

    // The opening ripple is worth seeing: a page opened in a background tab waits until it is shown.
    const seen = () => (!document.hidden ? Promise.resolve() : new Promise(resolve => {
        document.addEventListener('visibilitychange', function shown() {
            if (document.hidden) return;
            document.removeEventListener('visibilitychange', shown);
            resolve();
        });
    }));

    async function start() {
        status('불러오는 중');
        try {
            if (!window.supabase || !window.SwblogData) throw new Error('The posts library did not load.');
            posts = await window.SwblogData.fetchPosts();
        } catch (error) {
            console.warn('[playground] posts could not be read', error);
            status('글을 불러오지 못했어요.', true);
            return;
        }
        if (!posts.length) { status('아직 글이 없어요.'); return; }
        // Decode the pictures first, so none of them is decoded mid-ripple.
        const pictures = Promise.all(posts.filter(post => post.image).map(post => decode(post.image)));
        await seen();
        await Promise.race([pictures, pause(DECODE_WAIT)]);
        // Coming from another page, the field ripples in once it has mostly been uncovered.
        await window.SwblogArrival;
        status('');
        listEl.replaceChildren(...posts.map(row));
        buildChips();
        shown = posts.filter(post => matchesType(post, filter.type) && matchesTag(post, filter.tag));
        if (!shown.length) { filter.type = 'all'; filter.tag = null; shown = posts.slice(); updateChips(); }
        setView(view, true);
    }

    readUrl();
    root.dataset.view = view;
    document.documentElement.classList.toggle('pg-locked', view === 'field');
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    start();

    // For checking from the console: the camera, the sizes, and the per-frame work (frame can be
    // called by hand to drive the loop where requestAnimationFrame is paused, as in a hidden tab).
    window.SwblogPlayground = { cam, box, get tiles() { return tiles; }, get field() { return field; }, frame, step, render, follow };
})();
