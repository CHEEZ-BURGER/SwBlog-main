const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const publication = fs.readFileSync('js/publication2026.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

// Exercise the actual preview's smoothing, not a copy of its formula.
const previewCode = publication.slice(publication.indexOf('    const pointer='), publication.indexOf('    function select('));
function previewAt(hz) {
    const frames = new Map(); let next = 0;
    const context = { previewRAF: 0, document: { hidden: false }, mobile: { matches: false }, reduced: { matches: false },
        innerWidth: 1440, innerHeight: 900, previewImage: {}, preview: { style: {}, offsetWidth: 200, offsetHeight: 120, classList: { add() {}, remove() {} } },
        requestAnimationFrame: callback => { frames.set(++next, callback); return next; }, cancelAnimationFrame: id => frames.delete(id) };
    vm.createContext(context);vm.runInContext(previewCode + ';globalThis.state=pointer;globalThis.show=showPreview;', context);
    context.show('picture.png', { clientX: 200, clientY: 200 });
    context.state.tx = 900;context.state.ty = 600;
    for (let n = 0; n <= hz / 5; n++) {
        const callbacks = [...frames.values()];frames.clear();callbacks.forEach(callback => callback(n * 1000 / hz));
    }
    return context.state;
}
const slowPreview = previewAt(60), fastPreview = previewAt(120);
assert.ok(Math.abs(slowPreview.x - fastPreview.x) < .001);
assert.ok(Math.abs(slowPreview.y - fastPreview.y) < .001);

// The original spin's 60Hz distance is retained at high refresh rates, including damping.
const spinCode = index.slice(index.indexOf('            let currentRot = 0;'), index.indexOf('            dot.addSpin ='));
function spinAt(hz) {
    const frames = new Map();let next = 0;
    const context = { dot: { style: {} }, document: { hidden: false },
        requestAnimationFrame: callback => { frames.set(++next, callback);return next; }, cancelAnimationFrame: id => frames.delete(id) };
    vm.createContext(context);vm.runInContext(spinCode + ';isHovered=true;rotateDot(0);globalThis.spin=rotateDot;globalThis.angle=()=>currentRot;', context);
    for (let n = 1; n <= hz; n++) {
        const callbacks = [...frames.values()];frames.clear();callbacks.forEach(callback => callback(n * 1000 / hz));
    }
    return context.angle();
}
assert.ok(Math.abs(spinAt(60) - spinAt(120)) < .001);

// All positions across the whole observer batch must be read before the first style write.
const revealCode = publication.slice(publication.indexOf('    function revealLines('), publication.indexOf('    function setupLines('));
const events = [], delays = [];
function block(tops) {
    return { classList: { add: name => events.push(`class:${name}`) }, querySelectorAll: () => tops.map(top => ({
        getBoundingClientRect: () => { events.push('read');return { top }; }, firstElementChild: { style: new Proxy({}, {
            set(target, name, value) { events.push('write');delays.push(value);target[name] = value;return true; }
        }) }
    })) };
}
const context = {};vm.createContext(context);vm.runInContext(revealCode + ';globalThis.reveal=revealLines;', context);
context.reveal([block([10, 10, 30, 30, 50]), block([70, 70, 90])]);
assert.deepEqual(events.slice(0, 8), Array(8).fill('read'));
assert.deepEqual(delays, ['0ms', '0ms', '70ms', '70ms', '140ms', '0ms', '0ms', '70ms']);
assert.equal(events.filter(e => e === 'class:rl-in').length, 2);
console.log('PASS: 60/120Hz preview and spin timing; batched geometry reads; unchanged line order and delays.');

// Rendering in slices preserves the tree and must stop as soon as a new post supersedes it.
const appendCode = index.slice(index.indexOf('    async function appendPreparedArticle('), index.indexOf('    async function loadPanelPost('));
class TestNode {
    constructor(name, children = []) { this.name = name;this.childNodes = children;this.dataset = {}; }
    append(node) { this.childNodes.push(node); }
    replaceChildren() { this.childNodes = []; }
    cloneNode() { return new TestNode(this.name); }
}
async function checkSlices(cancel) {
    const frames = [];let clock = 0;
    const context = { currentRenderId: 1, performance: { now: () => ++clock / 100 }, requestAnimationFrame: callback => frames.push(callback) };
    vm.createContext(context);vm.runInContext(appendCode + ';globalThis.append=appendPreparedArticle;', context);
    const prepared = new TestNode('root', Array.from({ length: 120 }, (_, i) => new TestNode(`node-${i}`, [new TestNode(`text-${i}`)])));
    prepared.dataset.editorialLayout = 'ready';
    const content = new TestNode('root');
    let finished = false;
    const task = context.append(content, prepared, 1).then(result => { finished = true;return result; });
    if (cancel) context.currentRenderId = 2;
    const before = content.childNodes.length;
    while (!finished) { frames.shift()?.(clock);await Promise.resolve();await Promise.resolve(); }
    const result = await task;
    if (cancel) { assert.equal(result, false);assert.equal(content.childNodes.length, before); }
    else {
        assert.equal(result, true);assert.equal(content.dataset.editorialLayout, 'ready');
        assert.deepEqual(content.childNodes.map(node => [node.name, node.childNodes[0].name]), prepared.childNodes.map(node => [node.name, node.childNodes[0].name]));
    }
}
(async () => { await checkSlices(false);await checkSlices(true);console.log('PASS: sliced article tree is identical; obsolete requests never append another slice.'); })().catch(error => { console.error(error);process.exitCode = 1; });
