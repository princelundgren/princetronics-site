// CloudFront viewer-request function (cloudfront-js-2.0). edge/build-function.ts fills in DATA.
var CANONICAL = 'https://www.princetronics.com';
var WWW = 'www.princetronics.com';
var STATIC = 'www-static.princetronics.com';
var GONE_PREFIXES = ['/wp-content/themes/', '/wp-content/plugins/', '/wp-includes/', '/wp-json/', '/wp-admin/'];
var GONE_PATHS = ['/xmlrpc.php', '/wp-login.php'];
var DATA = __REDIRECT_DATA__;

function has(map, key) {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function startsWith(text, prefix) {
  return text.slice(0, prefix.length) === prefix;
}

function normalise(uri) {
  var last = uri.slice(uri.lastIndexOf('/') + 1);
  return last === '' || last.indexOf('.') !== -1 ? uri : uri + '/';
}

function lookup(map, key) {
  return has(map, key) ? map[key] : '/';
}

function queryValue(query, key) {
  return has(query, key) ? query[key].value : undefined;
}

function fromQuery(query) {
  var p = queryValue(query, 'p');
  if (p !== undefined) return lookup(DATA.ids, 'p' + p);
  var pageId = queryValue(query, 'page_id');
  if (pageId !== undefined) return lookup(DATA.ids, 'page' + pageId);
  var attachmentId = queryValue(query, 'attachment_id');
  if (attachmentId !== undefined) return lookup(DATA.ids, attachmentPost(attachmentId));
  var feed = queryValue(query, 'feed');
  if (feed !== undefined) return feed === 'comments-rss2' || feed === 'comments-atom' ? null : '/rss.xml';
  var archives = ['cat', 'author', 's', 'm', 'paged'];
  for (var i = 0; i < archives.length; i++) {
    if (has(query, archives[i])) return '/';
  }
  return undefined;
}

function attachmentPost(id) {
  for (var key in DATA.attachments) {
    if (has(DATA.attachments, key) && DATA.attachments[key].indexOf(Number(id)) !== -1) return key;
  }
  return '';
}

function fromTerm(path) {
  var match = path.match(/^\/(category|tag)\/(.*)$/);
  if (!match) return undefined;
  var segments = match[2].replace(/(^|\/)(feed\/([a-z0-9]+\/)?|page\/\d+\/)$/, '$1').split('/').filter(Boolean);
  if (!segments.length) return '/';
  var slug = segments[segments.length - 1];
  var key = match[1] + '/' + slug;
  if (has(DATA.terms, key)) return '/tags/' + DATA.terms[key] + '/';
  return DATA.tags.indexOf(slug) !== -1 ? '/tags/' + slug + '/' : '/';
}

function fromPaths(path) {
  if (has(DATA.paths, path)) return DATA.paths[path];
  var best;
  for (var key in DATA.paths) {
    if (has(DATA.paths, key) && startsWith(path, key) && (!best || key.length > best.length)) best = key;
  }
  return best ? DATA.paths[best] : undefined;
}

// The final URL for an old URL: a path to redirect to, null for 410 Gone, undefined when no rule matches.
function destination(path, query) {
  var target = fromQuery(query);
  if (target !== undefined) return target;
  if (startsWith(path, '/feed/')) return '/rss.xml';
  if (startsWith(path, '/comments/feed/')) return null;
  target = fromTerm(path);
  if (target !== undefined) return target;
  if (/^\/wp-sitemap.*\.xml$/.test(path)) return '/sitemap-index.xml';
  for (var i = 0; i < GONE_PREFIXES.length; i++) {
    if (startsWith(path, GONE_PREFIXES[i])) return null;
  }
  if (GONE_PATHS.indexOf(path) !== -1) return null;
  if (/^\/(author\/|page\/\d+\/|search\/|\d{4}\/)/.test(path)) return '/';
  target = fromPaths(path);
  if (target !== undefined) return target;
  var slug = path.split('/')[1];
  if (slug && has(DATA.slugs, slug)) return DATA.slugs[slug];
  if (/^\/(projects|articles|tags)\//.test(path)) return undefined;
  var parent = path.replace(/\/(feed|embed|comment-page-\d+)\/$/, '/');
  return parent !== path ? parent : undefined;
}

function redirect(path) {
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: CANONICAL + path } } };
}

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : '';
  if (host === STATIC && startsWith(request.uri, '/wp-content/uploads/')) return request;
  var path = normalise(request.uri);
  var target = destination(path, request.querystring);
  if (target === null) return { statusCode: 410, statusDescription: 'Gone' };
  if (target !== undefined) return redirect(target);
  if (host !== WWW || path !== request.uri) return redirect(path);
  if (path.slice(-1) === '/') request.uri = path + 'index.html';
  return request;
}
