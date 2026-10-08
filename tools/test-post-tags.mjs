import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// The hashtag rule, exercised without a browser.
const context = {window: {}};
vm.runInNewContext(readFileSync('js/postTags.js', 'utf8'), context);
const {TAGS, MAX, parse, tagsOf, format, label, pillsHTML} = context.window.SwblogTags;
const list = value => Array.from(value);

assert.equal(TAGS.length, 10, 'ten hashtags');
assert.equal(MAX, 3);
console.log('PASS: ten hashtags, up to three per post.');

// Stored values: the new form, a written form with #, and the old categories.
assert.deepEqual(list(parse('디자인,개발')), ['디자인', '개발']);
assert.deepEqual(list(parse('#디자인 #사진')), ['디자인', '사진']);
assert.deepEqual(list(parse('CODING')), ['개발']);
assert.deepEqual(list(tagsOf({category: 'LIFE'})), ['일상']);
assert.deepEqual(list(tagsOf({category: 'DESIGN'})), ['디자인']);
assert.deepEqual(list(tagsOf({category: 'TECH'})), ['개발']);
console.log('PASS: old categories read as the matching hashtag.');

// Unknown words are dropped, repeats collapse, and at most three are kept.
assert.deepEqual(list(parse('디자인,디자인,없는태그')), ['디자인']);
assert.deepEqual(list(parse('디자인,개발,사진,회고')), ['디자인', '개발', '사진']);
assert.deepEqual(list(parse('')), []);
assert.deepEqual(list(tagsOf(null)), []);
console.log('PASS: unknown words dropped, repeats collapsed, three at most.');

// What is stored and what is shown.
assert.equal(format(['개발', '디자인']), '개발,디자인');
assert.equal(label('개발,디자인'), '개발 · 디자인');
assert.equal(label(''), '');
assert.equal(pillsHTML('개발,<b>'), '<span class="tag-pills"><span class="tag-pill">개발</span></span>');
assert.equal(pillsHTML(''), '');
console.log('PASS: stored as "개발,디자인", shown without "#" as "개발 · 디자인" or as pills.');
