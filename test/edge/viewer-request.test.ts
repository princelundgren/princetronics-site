import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isResponse, loadFunction, requestEvent } from '../../edge/simulate';

const WWW = 'www.princetronics.com';
const APEX = 'princetronics.com';
const STATIC = 'www-static.princetronics.com';
const NEW_POST = 'https://www.princetronics.com/projects/new-post/';

const template = readFileSync(new URL('../../edge/viewer-request.js', import.meta.url), 'utf8');
const data = {
  slugs: { 'old-post': '/projects/new-post/' },
  ids: { p12: '/projects/new-post/', page3: '/about/' },
  attachments: { p12: [201, 202] },
  tags: ['c-plus-plus', 'arduino', 'rss-feed', 'embed'],
  terms: { 'tag/cplusplus': 'c-plus-plus' },
  paths: { '/email-subscription/': '/follow/' },
};
const handler = loadFunction(template.replace('__REDIRECT_DATA__', JSON.stringify(data)));

function answer(host: string, uri: string, query?: Record<string, string>) {
  return handler(requestEvent(host, uri, query));
}

function expectRedirect(host: string, uri: string, location: string, query?: Record<string, string>) {
  const result = answer(host, uri, query);
  expect(isResponse(result) && result.statusCode, `${host}${uri}`).toBe(301);
  expect(isResponse(result) && result.headers?.location?.value, `${host}${uri}`).toBe(location);
}

function expectGone(host: string, uri: string, query?: Record<string, string>) {
  const result = answer(host, uri, query);
  expect(isResponse(result) && result.statusCode, `${host}${uri}`).toBe(410);
}

function expectServed(host: string, uri: string, servedUri: string) {
  const result = answer(host, uri);
  expect(isResponse(result), `${host}${uri}`).toBe(false);
  expect(!isResponse(result) && result.uri).toBe(servedUri);
}

describe('the viewer-request template', () => {
  it('has exactly one data placeholder line', () => {
    expect(template.split('var DATA = __REDIRECT_DATA__;').length).toBe(2);
  });
});

describe('viewer-request', () => {
  it('serves the index of a directory path', () => {
    expectServed(WWW, '/projects/new-post/', '/projects/new-post/index.html');
  });

  it('redirects an old slug and everything under it', () => {
    for (const uri of ['/old-post/', '/old-post/feed/', '/old-post/comment-page-2/', '/old-post']) {
      expectRedirect(WWW, uri, NEW_POST);
    }
  });

  it('redirects the apex and an old slug in one hop', () => {
    expectRedirect(APEX, '/old-post', NEW_POST);
  });

  it('serves uploads on www-static and www', () => {
    expectServed(STATIC, '/wp-content/uploads/2014/06/sample.jpg', '/wp-content/uploads/2014/06/sample.jpg');
    expectServed(WWW, '/wp-content/uploads/2014/06/sample.jpg', '/wp-content/uploads/2014/06/sample.jpg');
  });

  it('redirects other www-static paths to www', () => {
    expectRedirect(STATIC, '/about/', 'https://www.princetronics.com/about/');
  });

  it('maps query forms', () => {
    expectRedirect(WWW, '/', NEW_POST, { p: '12' });
    expectRedirect(WWW, '/', 'https://www.princetronics.com/about/', { page_id: '3' });
    expectRedirect(WWW, '/', 'https://www.princetronics.com/', { p: '999' });
    expectRedirect(WWW, '/', NEW_POST, { attachment_id: '202' });
    expectRedirect(WWW, '/', 'https://www.princetronics.com/', { attachment_id: '999' });
    expectRedirect(WWW, '/', 'https://www.princetronics.com/', { s: 'x' });
    expectRedirect(WWW, '/', 'https://www.princetronics.com/rss.xml', { feed: 'rss2' });
    expectGone(WWW, '/', { feed: 'comments-rss2' });
  });

  it('maps feeds', () => {
    expectRedirect(WWW, '/feed/', 'https://www.princetronics.com/rss.xml');
    expectRedirect(WWW, '/feed/atom/', 'https://www.princetronics.com/rss.xml');
    expectGone(WWW, '/comments/feed/');
  });

  it('maps paths and what is under them', () => {
    expectRedirect(WWW, '/email-subscription/', 'https://www.princetronics.com/follow/');
    expectRedirect(WWW, '/email-subscription/feed/', 'https://www.princetronics.com/follow/');
    expectRedirect(WWW, '/about/feed/', 'https://www.princetronics.com/about/');
    expectRedirect(WWW, '/about/embed/', 'https://www.princetronics.com/about/');
  });

  it('serves new pages whose slug ends in feed or embed', () => {
    for (const uri of ['/tag/rss-feed/', '/tag/embed/', '/projects/news-feed/', '/articles/how-to-embed/']) {
      expectServed(WWW, uri, `${uri}index.html`);
    }
  });

  it('serves a current tag page instead of redirecting it', () => {
    expectServed(WWW, '/tag/arduino/', '/tag/arduino/index.html');
  });

  it("redirects a current tag's paged and feed forms to its page", () => {
    expectRedirect(WWW, '/tag/arduino/page/2/', 'https://www.princetronics.com/tag/arduino/');
    expectRedirect(WWW, '/tag/arduino/feed/', 'https://www.princetronics.com/tag/arduino/');
  });

  it('maps a category to the tag of its own slug when that tag is published', () => {
    expectRedirect(WWW, '/category/arduino/feed/atom/', 'https://www.princetronics.com/tag/arduino/');
  });

  it('maps terms by data, else home', () => {
    expectRedirect(WWW, '/tag/cplusplus/', 'https://www.princetronics.com/tag/c-plus-plus/');
    expectRedirect(WWW, '/tag/cplusplus/page/2/', 'https://www.princetronics.com/tag/c-plus-plus/');
    expectRedirect(WWW, '/category/parent/child/', 'https://www.princetronics.com/');
    expectRedirect(WWW, '/tag/unknown/', 'https://www.princetronics.com/');
  });

  it('retires WordPress internals with 410', () => {
    const internals = [
      '/wp-content/themes/x/style.css',
      '/wp-content/plugins/x/a.js',
      '/wp-includes/js/a.js',
      '/wp-json/wp/v2/posts',
      '/wp-admin/admin-ajax.php',
      '/xmlrpc.php',
      '/wp-login.php',
    ];
    for (const uri of internals) {
      expectGone(WWW, uri);
      expectGone(APEX, uri);
    }
  });

  it('sends archives home', () => {
    for (const uri of ['/author/x/', '/page/2/', '/2015/03/']) {
      expectRedirect(WWW, uri, 'https://www.princetronics.com/');
    }
    expectRedirect(WWW, '/wp-sitemap.xml', 'https://www.princetronics.com/sitemap-index.xml');
    expectRedirect(WWW, '/wp-sitemap-posts-post-1.xml', 'https://www.princetronics.com/sitemap-index.xml');
  });

  it('adds a missing trailing slash', () => {
    expectRedirect(WWW, '/learning', 'https://www.princetronics.com/learning/');
    expectServed(WWW, '/rss.xml', '/rss.xml');
    expectServed(WWW, '/_astro/a.css', '/_astro/a.css');
  });
});
