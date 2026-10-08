/* Posts for the pages beside the index (blog, gallery, playground, info): one place that reads
   the posts table and tells each post's kind, hashtags, picture, date and reading time. Needs
   supabase-js, js/postTags.js and js/postType.js loaded first. A post opens in the index's reader
   (index.html?post=ID). */
(function () {
    'use strict';
    const S_URL = 'https://dwyoitvmforukvdikzqo.supabase.co';
    const S_KEY = 'sb_publishable_c5y0L6D5oRgoEV_MzedQQQ_nCJfKHb0';
    const client = window.supabase ? window.supabase.createClient(S_URL, S_KEY) : null;

    // The thumbnail the editor sets comes first; otherwise the first picture in the post.
    function firstImage(content) {
        const text = String(content || '');
        const hidden = text.match(/<img[^>]*class="[^"]*hidden-thumbnail[^"]*"[^>]*src=["']([^"']+)["']/i)
            || text.match(/<img[^>]*src=["']([^"']+)["'][^>]*class="[^"]*hidden-thumbnail/i);
        if (hidden) return hidden[1];
        const md = text.match(/!\[.*?\]\(([^)]+)\)/);
        if (md) return md[1];
        const html = text.match(/<img[^>]+src=["']([^"']+)["']/i);
        return html ? html[1] : null;
    }

    function plainText(content) {
        return String(content || '')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&[#\w]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Counted the way the reader counts it: characters without spaces, 500 a minute.
    const readMinutes = content => Math.max(1, Math.ceil(plainText(content).replace(/\s/g, '').length / 500));

    function excerpt(content, length = 120) {
        const text = plainText(content);
        return text.length > length ? text.slice(0, length).trim() + '…' : text;
    }

    const postUrl = id => `./index.html?post=${encodeURIComponent(id)}`;

    function enrich(post, index = 0) {
        const tags = window.SwblogTags?.tagsOf(post) || [];
        const created = post.created_at ? new Date(post.created_at) : null;
        return {
            ...post,
            index,
            number: String(index + 1).padStart(2, '0'),
            type: window.SwblogPostType?.postType(post) || 'blog',
            tags,
            tagLabel: window.SwblogTags?.label(tags) || '',
            image: firstImage(post.content),
            minutes: readMinutes(post.content),
            excerpt: excerpt(post.content),
            date: created ? created.toISOString().slice(0, 10).replace(/-/g, '.') : '',
            url: postUrl(post.id)
        };
    }

    // Newest first, each with its kind, hashtags, picture and so on.
    async function fetchPosts() {
        if (!client) return [];
        const { data, error } = await client.from('posts').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(enrich);
    }

    window.SwblogData = { fetchPosts, enrich, firstImage, plainText, readMinutes, excerpt, postUrl };
}());
