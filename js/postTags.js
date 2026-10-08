/* Hashtags. A post has one of two big kinds (블로그 or 갤러리, see js/postType.js) and up to three
   of these ten hashtags. The hashtags are kept in the posts table's existing `category` column as
   plain text ("디자인,개발"), so the database needs no new column. Older posts still carry one of
   the former categories there (CODING, DESIGN, LIFE…); those read as the matching hashtag. */
(function () {
    'use strict';
    const TAGS = ['디자인', '개발', '인터랙션', '브랜딩', '타이포그래피', '사진', '프로젝트', '회고', '일상', '실험'];
    const ALIASES = { CODING: '개발', DEVELOP: '개발', TECH: '개발', DESIGN: '디자인', LIFE: '일상' };
    const MAX = 3;

    // Any stored value (new "디자인,개발", "#디자인 #개발", or an old "CODING") → known hashtags.
    function parse(value) {
        const words = (Array.isArray(value) ? value.join(',') : String(value || ''))
            .split(/[,#\s]+/).map(word => word.trim()).filter(Boolean)
            .map(word => ALIASES[word.toUpperCase()] || word)
            .filter(word => TAGS.includes(word));
        return [...new Set(words)].slice(0, MAX);
    }

    const tagsOf = post => parse(post?.category);
    const format = tags => parse(tags).join(',');
    const label = tags => parse(tags).map(tag => '#' + tag).join(' ');

    window.SwblogTags = { TAGS, MAX, parse, tagsOf, format, label };
}());
