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

    window.SwblogPostType = {
        postType,
        inferType,
        TYPE_MARK,
        TYPE_MARK_ALL,
        mark: type => `<!--swblog:type ${type === 'gallery' ? 'gallery' : 'blog'}-->`
    };
}());
