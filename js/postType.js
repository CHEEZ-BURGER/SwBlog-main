/* What kind of post a post is: a blog post (writing, set as it is now) or a gallery post (a
   portfolio piece, told mostly in large pictures). The editor writes the choice into the content
   as an invisible comment, <!--swblog:type gallery--> or <!--swblog:type blog-->, so the database
   needs no new column. A post saved before the choice existed is sorted by its content: one that
   is mostly pictures (four or more, with little text between them), or a design post (the old
   DESIGN category, or the #디자인 hashtag) with five or more pictures, is a gallery; anything else
   is a blog post. */
(function () {
    'use strict';
    const TYPE_MARK = /<!--\s*swblog:type\s+(gallery|blog)\s*-->/;
    const TYPE_MARK_ALL = /<!--\s*swblog:type\s+(?:gallery|blog)\s*-->\n?/g;

    function inferType(post) {
        const content = String(post?.content || '');
        const pictures = (content.match(/<img\b/gi) || []).length;
        const text = content.replace(/<[^>]*>/g, '').replace(/&[#\w]+;/g, ' ').replace(/\s/g, '').length;
        if (pictures >= 4 && text <= pictures * 40) return 'gallery';
        const category = String(post?.category || '');
        if ((category.toUpperCase().includes('DESIGN') || category.includes('디자인')) && pictures >= 5) return 'gallery';
        return 'blog';
    }

    function postType(post) {
        const marked = String(post?.content || '').match(TYPE_MARK);
        return marked ? marked[1] : inferType(post);
    }

    // Private posts. The editor's DB view sets a post private with another invisible comment,
    // <!--swblog:private-->. The site still lists a private post, with a lock, but shows neither
    // its pictures nor its words and will not open it.
    const PRIVATE_MARK = /<!--\s*swblog:private\s*-->/;
    const PRIVATE_MARK_ALL = /<!--\s*swblog:private\s*-->\n?/g;
    const isPrivate = post => PRIVATE_MARK.test(String(post?.content || ''));
    // Puts the mark in (after the leading thumbnail and marks, where the others sit) or takes it out.
    function setPrivate(content, on) {
        const text = String(content || '').replace(PRIVATE_MARK_ALL, '');
        if (!on) return text;
        const lead = text.match(/^(?:\s*<img\b[^>]*\bhidden-thumbnail\b[^>]*>\s*|\s*<!--[\s\S]*?-->\s*)*/)[0];
        return lead + '<!--swblog:private-->\n' + text.slice(lead.length);
    }
    const LOCK_SVG = '<svg class="lock-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="2.5" y="7" width="11" height="8" rx="2" fill="currentColor"/></svg>';

    window.SwblogPostType = {
        postType,
        inferType,
        TYPE_MARK,
        TYPE_MARK_ALL,
        mark: type => `<!--swblog:type ${type === 'gallery' ? 'gallery' : 'blog'}-->`,
        PRIVATE_MARK_ALL,
        isPrivate,
        setPrivate,
        privateMark: '<!--swblog:private-->',
        LOCK_SVG
    };
}());
