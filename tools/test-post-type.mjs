import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// The post type rule, exercised without a browser.
const context = {window: {}};
vm.runInNewContext(readFileSync('js/postType.js', 'utf8'), context);
const {postType, mark, TYPE_MARK_ALL, isPrivate, setPrivate} = context.window.SwblogPostType;
const pics = n => Array.from({length: n}, (_, i) => `<p><img src="${i}.jpg"></p>`).join('');

// The editor's mark wins over anything the content suggests.
assert.equal(postType({content: mark('gallery') + '\n<p>' + 'x'.repeat(5000) + '</p>'}), 'gallery');
assert.equal(postType({content: mark('blog') + '\n' + pics(12)}), 'blog');
console.log('PASS: the editor\'s mark decides the type.');

// Without a mark: mostly pictures, or a DESIGN post with five or more, is a gallery.
assert.equal(postType({content: pics(4) + '<p>짧은 글</p>'}), 'gallery');
assert.equal(postType({content: pics(4) + '<p>' + '긴 글'.repeat(200) + '</p>'}), 'blog', 'pictures with a long text read as a blog post');
assert.equal(postType({category: 'DESIGN', content: pics(5) + '<p>' + '설명'.repeat(300) + '</p>'}), 'gallery');
assert.equal(postType({category: 'CODING', content: pics(1)}), 'blog');
assert.equal(postType({content: ''}), 'blog');
assert.equal(postType(null), 'blog');
console.log('PASS: older posts are sorted by their content.');

// Saving strips the old mark before writing the new one.
const saved = (mark('blog') + '\n<p>본문</p>').replace(TYPE_MARK_ALL, '');
assert.equal(saved, '<p>본문</p>');
assert.equal(mark('anything'), '<!--swblog:type blog-->', 'an unknown type is written as blog');
console.log('PASS: marks are replaced cleanly.');

// Private posts: the mark goes in after the leading thumbnail and marks, comes out cleanly, and
// never doubles.
const stored = '<img class="hidden-thumbnail" src="t.png" alt="thumbnail">\n<!--swblog:panel p.png-->\n<!--swblog:type blog-->\n<p>본문</p>';
const hidden = setPrivate(stored, true);
assert.ok(isPrivate({content: hidden}));
assert.ok(hidden.startsWith('<img class="hidden-thumbnail" src="t.png" alt="thumbnail">\n<!--swblog:panel p.png-->\n<!--swblog:type blog-->\n<!--swblog:private-->\n<p>본문</p>'));
assert.equal(setPrivate(hidden, true), hidden, 'setting private twice changes nothing');
assert.equal(setPrivate(hidden, false), stored, 'making it public restores the content exactly');
assert.equal(postType({content: hidden}), 'blog', 'the private mark leaves the type alone');
assert.ok(!isPrivate({content: '<p>본문</p>'}) && !isPrivate(null));
console.log('PASS: private mark goes in after the leading marks and comes out cleanly.');
