---
status: building
verified: 2026-11-06
governs:
  - src/**
  - astro.config.mjs
  - fixtures/**
  - .github/**
  - edge/**
  - infra/**
---

# PrinceTronics rebuild: design

## Intent

PrinceTronics (`www.princetronics.com`) is a maker and software site. It shows Prince's projects (partly as a CV
showcase) and teaches others to build them. Today it is a WordPress site from 2014–2016 on shared hosting. The rebuild
moves it to a static site on AWS that is cheap, needs no server upkeep, and is where new projects and articles get
published. Everything other sites already link to must keep working.

## Goals

- New projects and best-practice articles are the front page. The 2014–2016 posts live on as ordinary pages, not as an
  archive section.
- Every URL that exists today ends, after redirects, on a page with the same content or its new home (see *URL check*).
- The real reader comments are carried over. New comments come back after launch, with bot and spam protection.
- Writing is Markdown in Git, often with AI help. Every change can be previewed locally before it goes live.
- The site's code is public (it is portfolio material). Its content and drafts are private until published.
- Running cost is close to zero: the domain's yearly fee, the DNS zone (about $0.50 a month) and cents of S3. The
  CDN, firewall and edge function are flat-rate, so a spike or attack cannot run up their bill; what stays metered
  (S3 requests on cache misses) is held down by caching and a rate limit, and a budget alert catches the rest. There
  is no server, database or plugin to patch.

## Non-goals

- Email newsletter. RSS only; email can be added if readers ask for it.
- Site search, accounts, analytics dashboards, multiple languages (the site is English only).
- Reuse by other sites: nothing here is built for it.

## Anti-goals (it fails even if it works)

- Any old link or embedded image that breaks, or a feed reader that silently stops getting posts.
- Comment spam visible on the site, which is what the WordPress site shows today.
- Drafts, personal notes, AWS account IDs, commenter emails or IPs, or other private details in the public repository
  or its history.
- A custom-built piece where a maintained framework or service already does the job.

## Decisions

| Decision | Reason |
|---|---|
| Astro static site | Content collections give every page type a typed schema, so an incomplete guide fails the build. MDX components cover the parts table and steps. The default `build.format: 'directory'` writes `/<path>/index.html`; `trailingSlash: 'always'` goes with it, as Astro's docs recommend. |
| Platform repo public, content repo private | Code shows skill. Drafts and history stay private, and published pages are public on the site anyway. |
| S3 + CloudFront + CloudFront Functions + Route 53, infra as code | Cheap, no servers. Astro's static redirects are meta-refresh pages with no status code, so the real 301s and the `/<path>/` → `index.html` lookup live in a CloudFront Function. |
| `www.princetronics.com` stays canonical; apex redirects to `www` | That is how the site answers today, so existing links already point there. |
| `www-static.princetronics.com` keeps serving `/wp-content/uploads/...` at the same paths | The WordPress pages load their images from this host, so other sites that embed them would break. The upload files, resized variants included, are copied to the same paths in S3 and answer 200 on both `www` and `www-static`. Any other path on `www-static` 301s to `www`. |
| Pages under `/projects/<slug>/` and `/articles/<slug>/`; old root URLs 301 there | One consistent, permanent pattern. Old links keep working through the redirect. `/about/` stays at the root. |
| RSS at `/rss.xml`; old feed URLs 301 → `/rss.xml` | Clearer name; the 301 carries existing feed subscribers over. |
| No email subscription; `/email-subscription/` 301 → `/follow/` | The old Subscribe2 form already looks broken (its shortcode shows as plain text). |
| Comments feeds retired with 410 Gone | Their content is almost entirely spam. |
| Old comments shown read-only by the site; new-comment platform chosen separately, later | Old comments are rendered as "Earlier discussion" from the filtered export, so the new-comment system needs no WordPress import and free options (e.g. giscus) are viable. Launch does not wait for it. |
| Content fixes reported as issues on the platform repo, with a "Content fix" issue template *(my call)* | One repo fewer to maintain than a separate issues-only repo; the issue text reveals nothing private. |

## Content model

Three collections, tag pages and three standalone pages. Page layouts follow the approved mockup
(`mockups/project-pages.html`, kept next to this document). Every page has a shared top: title, one-line summary,
tags, date and updated date, cover, then a Why / How / Result block. The body depends on the type.

- **projects** (`/projects/<slug>/`): `area: maker | software`, plus an optional `guide` block.
  - **No `guide` block (showcase):** *What it does*, *How it's built*, *What I learned*, plus links (source repo, related
    articles).
  - **With a `guide` block:** the steps are the main content, and the showcase sections shrink to an intro.
    - Required guide fields: `difficulty`, `time`, `cost`, `parts[]` (name, quantity, optional approximate price,
      where to buy), `tools[]`.
    - Body: *What you'll need* (rendered from the fields), numbered steps (diagram or photo, text, copyable code),
      *Troubleshooting*, *Downloads*.
    - A sticky "On this page" step list sits beside it.
  - Adding a guide to a showcase therefore never changes its URL. *(My call: one schema with an optional block, not
    two kinds.)*
- **articles** (`/articles/<slug>/`): best practices in software and cloud. Normal long-form posts.
- **learning** (`/learning/`): a data collection of recommended guides, open-source projects and courses (title, URL,
  type, topic, one-line why). Rendered as one page grouped by topic, not as posts.
- **Tag pages** (`/tags/<tag>/`) list everything with that tag *(my call)*.
- **Pages:** About (`/about/`), Follow (`/follow/`: the RSS link; email later if ever), and a 404 page.
- **Every entry:** `publishDate`, `updatedDate?`, `draft`, `tags[]`, `cover`, `summary`, and `legacySlug?` for
  migrated posts.
- **Each project and article also has:** "Suggest a fix", old comments read-only (new comments later), and Open Graph /
  Twitter link-preview metadata.
  - "Suggest a fix" opens a pre-filled "Content fix" issue on the platform repo.
  - Old comments are rendered with `id="comment-<WordPress id>"`, so old `#comment-NNN` links still land on the right
    comment.

**Navigation:** Projects · Articles · Learning · About; the footer links Follow and RSS. Home shows the newest projects
and articles together. Learning appears in the navigation once it has entries *(my call)*.

## Migration

- **Inventory first.** Build the full list of old URLs on both `www` and `www-static`:
  - from `wp-sitemap.xml` (posts, pages, categories, tags, users) and a crawl;
  - every `/wp-content/uploads/...` file, including resized variants such as `-150x150`;
  - the routes WordPress answers without listing them: `/feed/`, `/feed/rss2/`, `/feed/atom/`, `/?feed=rss2`,
    `/comments/feed/`, per-post, category and tag feeds, `/<slug>/embed/`, `/<slug>/comment-page-N/`, attachment
    pages, `/page/N/`, date archives, `/?p=<id>` and `/author/<name>/`;
  - query-string forms: `?p=`, `?page_id=`, `?attachment_id=`, `?cat=`, `?author=`, `?s=`, `?replytocom=`;
  - `/wp-sitemap*.xml`, nested categories (`/category/<parent>/<child>/`) and WordPress's de-duplicated tag slugs
    (`/tag/<x>-2/`);
  - WordPress internals a crawl finds (`/wp-content/themes/`, `/wp-content/plugins/`, `/wp-includes/`, `/wp-json/`,
    `/xmlrpc.php`, `/wp-login.php`), listed as 410;
  - each URL with and without its trailing slash;
  - `http://` and apex variants of all of the above.

  Today there are 12 posts, 2 pages (`/about/`, `/email-subscription/`), 63 media files, 12 categories and 92 tags.
- **Redirect rules,** most specific first. Each request gets at most one redirect from the function, already combining
  host, path and trailing slash:
  - `/<old-slug>/` and **any path under it** (feed, embed, comment pages) → the post's new URL.
  - `/feed/` and its variants → `/rss.xml`.
  - Comments feeds → 410.
  - `/category/<x>/` and `/tag/<x>/` → the tag page of the category or tag with that name, otherwise `/`. The match
    goes by name: WordPress drops `+` and `#` from slugs, and the new tag URLs spell them out.
  - `/?p=<id>`, `/?page_id=<id>` and `/?attachment_id=<id>` → the new URL of that post, page or its post.
  - `/wp-sitemap*.xml` → Astro's sitemap index.
  - WordPress internals → 410.
  - Author, date, search and pagination archives, and their query forms → `/`.
  - Any other extensionless path without a trailing slash → the same path with one.
- **Posts** become projects or articles under their section, with their original `publishDate`. Content is converted
  from the WordPress export to Markdown, internal links are rewritten to the new URLs, and images keep their
  `/wp-content/uploads/...` paths.
- **Migrated posts meet the same schema as new ones; there is no looser legacy schema.** Each gets the required fields
  filled in during migration (an AI-assisted writing task per post; Prince reviews it). Prices are optional, since 2014
  prices are meaningless. Classification *(my call, Prince can change it)*:
  - **Projects with a guide:** both 433 MHz receiver posts, Arduino Uno as USB-to-serial, Super Mario theme song,
    electronic dice, sound-sensitive lights, voice-controlled wireless switches, iBeacon with Raspberry Pi, and both
    LED-blinking posts.
  - **Articles:** restoring an iPhone to factory default, and auto-downloading subtitles on macOS.
- **Comments.**
  1. Mark spam in WordPress (101,077 published comments, overwhelmingly link spam; real Q&A from 2014–2016 is mixed in).
     Use an automatic pass first (re-check with the anti-spam service, plus rules: link-only comments, known spam
     phrases), then a manual review of what is left. Prince does the final review.
     When unsure, a comment counts as spam: losing a real comment is better than showing spam.
  2. Export, then strip each comment to WordPress id, parent id, post, author name, date and text. Emails, IP
     addresses, user agents and author URLs never reach a repo.
  3. Commit the stripped file to the content repo. The site renders it read-only under each post as
     "Earlier discussion": text sanitised to plain paragraphs and code, never raw HTML, and no author links.
  4. Remove the visible spam from the live WordPress site now, independent of the rebuild.
- **URL check (the acceptance test).** Every inventoried URL must end in a 200, or in a 410 that is on the list, within
  at most two redirects. CloudFront's http→https is one redirect; the function's own redirect is the other. The
  function does apex→`www` and the path mapping in a single redirect. The check runs in CI, and before and after the
  cut-over.

## Repositories, preview and deploy

- **Platform repo (public):**
  - The Astro project: theme, components, layouts and the 404 page.
  - The CloudFront Function template: the `index.html` lookup, host handling and the rule engine.
  - The infrastructure code, the URL-check tool and the "Content fix" issue template.
  - It contains no account IDs, secrets, content, redirect data or DNS details.
- **Content repo (private):** Markdown and MDX, images and uploads, the learning list, the stripped comments, site
  config, the operational notes (DNS records, registrar, AWS accounts), and the deploy workflow.
  - **CI**, in two jobs:
    1. **Build job, with no AWS access:** check out the platform at a pinned commit SHA with its lockfile, build, run
       the schema check and the URL check against the build, and upload the output as an artifact.
    2. **Deploy job:** runs no npm code, only the AWS CLI. It syncs the artifact to S3 and nothing else.
  - **The function's code** is generated from the platform template and the redirect data: post redirects come from
    each entry's `legacySlug`, so that fact lives in one place, and archives use prefix rules. The infrastructure code
    owns the function and takes the generated code as its input; the generation step fails above CloudFront's 10 KB
    limit. The function changes when the redirect data does (an old post moves) or the set of published tags does, and
    only through an infrastructure deploy.
  - **No cache invalidations** *(my call)*: hashed assets (`/_astro/`) are cached for a year, everything else with a
    short `max-age` (a minute), so a deploy shows within a minute without an invalidation request.
  - *Builder's call: how content and platform combine (npm package, git submodule or CI checkout).*
- **AWS access from CI** uses GitHub OIDC with two roles, both trusting only the content repo:
  - **Deploy role:** write and delete in the site bucket, nothing else.
  - **Infrastructure role:** separate, for infrastructure changes, used by a manually started workflow.
  - **Trust conditions:** `aud` = `sts.amazonaws.com`, and `sub` pinned to the `main` branch. GitHub Free gives a
    private repository no environments, and the maintainer keeps the Free plan (maintainer, 2026-11-06). The content
    repo is new, so its `sub` uses GitHub's immutable form with owner and repository IDs
    (`repo:<owner>@<id>/<repo>@<id>:ref:refs/heads/main`); match that form exactly.
- **Local preview** is the main review step: `astro dev` against the content checkout, with drafts visible locally and
  never built for production. A separate dev environment is optional and not needed for launch. If one is added later,
  it needs its own distribution and function, its own pricing plan or pay-as-you-go, and `noindex`.
- **Content folder contract:** the layout of the folder `CONTENT_DIR` names, which the content repo holds and the
  platform builds from:

  ```
  <CONTENT_DIR>/
    projects/<slug>.md|mdx         images beside it: projects/<slug>/...
    articles/<slug>.md|mdx
    learning.json                  array of learning entries, each with an `id`
    pages/about.md, pages/follow.md
    comments/projects/<slug>.json  { "comments": Comment[] }, one file per entry that has old comments
    comments/articles/<slug>.json
    redirects.json                 the WordPress ids, terms and fixed paths the function maps
    public/                        served from the site root as-is (wp-content/uploads/..., favicon)
  ```

  A comment's `text` is plain text with HTML entities decoded: a blank line separates paragraphs, a single newline is
  a line break, and a line starting with ```` ``` ```` opens or closes a code block. Any markup in it is shown as text.

## Hosting and cut-over

- **Accounts:** the site's stacks (bucket, distribution, function, certificate, web ACL, plan subscription, deploy
  roles) live in a **workload account**. Where the hosted zone and the registration live is in the operational notes;
  the infrastructure code takes the hosted zone's account and ID as deploy inputs.
  - The certificate and the web ACL must be in us-east-1, so the edge stack lives there.
- **Delivery:**
  - A private S3 bucket behind one CloudFront distribution with origin access control.
  - Alternate names: apex, `www` and `www-static`.
  - An ACM certificate in us-east-1 covering those three names.
  - Route 53 DNS.
- **Viewer-request function:** the `index.html` lookup, host handling and redirects.
- **Security headers:** the AWS-managed response-headers policy, or a viewer-response function. The Free plan has no
  custom response-header policies.
- **Missing files:** with origin access control and no `s3:ListBucket`, S3 answers 403 for a missing file. Map 403 and
  404 to the 404 page with status 404, and cache that answer for a day so random paths don't each reach S3. A request
  the firewall blocks also shows the 404 page; that is accepted.
- **Pricing:** the CloudFront flat-rate Free plan ($0), chosen because it never bills overage, even in a spike or
  an attack. The infrastructure code subscribes to it (`AWS::PricingPlanManager::Subscription`).
  - It covers one apex domain per plan, and the three names above share one apex.
  - At most 3 free plans per account, and an account on the AWS Free Tier is not eligible: confirm both for the
    workload account before building.
  - It requires an AWS WAF web ACL on the distribution, which cannot be removed afterwards. The infrastructure code
    creates it with at most 5 rules: an IP rate-based rule, plus the managed protections the Free plan includes.
  - It allows only managed cache and origin-request policies, at most 5 cache behaviours, and no custom rule
    groups; each AWS managed rule group counts as one of the 5 rules.
  - A distribution on a plan can't be deleted, nor its web ACL detached, until the plan is cancelled, so a change
    that would replace either has to cancel the plan first.
  - It has no KeyValueStore, and Lambda@Edge is billed separately, so nothing uses either.
  - Its allowance is 1 M requests and 100 GB a month. Going over is never billed; sustained excess over months may
    slow delivery, far above this site's traffic.
  - It covers the hosted zone only once the zone is attached to the plan, is in the same account as the distribution,
    covers its domain and stays within the tier's record limit; otherwise Route 53 bills as pay-as-you-go.
  - S3 storage is offset by the plan's 5 GB S3 credit.
  - Logs: none at launch, and the function never logs (function logs are billed outside the plan). Standard logs to
    S3 can be added later, billed as S3 storage.
  - An AWS Budgets alert covers every account the site uses.

  Pay-as-you-go is the fallback, also near zero for this site, but with no protection against a spike's bill.
- **DNS** moves to Route 53, and the registration to Amazon Registrar. The records, the current registrar, the accounts
  and the cut-over steps with their dates live in the content repo's operational notes.
- **Cut-over:**
  1. Deploy production, and run the URL check against it with the hostnames pinned (`curl --connect-to`).
  2. Move DNS and the registration as the operational notes say.
  3. Re-run the URL check. Keep WordPress available but unlinked until it passes.
  4. Retire the old hosting only once the registration has moved, so cancelling it cannot take the domain with it.

## Launch scope

Launch needs:
- the migrated posts and pages
- every old URL passing the URL check
- read-only old comments
- RSS
- the Follow, About and 404 pages

New comment posting and new projects or articles are not launch blockers.

## Left to the builder

- the visual design within the mockup's structure
- the Astro add-ons (MDX, sitemap, RSS, image handling)
- the infrastructure-as-code tool (chosen: AWS CDK in TypeScript, in `infra/`, with cdk-nag on every synth) and the
  converter
- the content/platform combining mechanism
- the code-block and "On this page" components
- the function's internal structure, within the size limit

## Open

- **New-comment platform**, chosen after launch. Free is preferred, and import is no longer needed.
  - *Free:* giscus (GitHub login, no server).
  - *Paid, managed, guest commenting:* Hyvor Talk and FastComments.
  - *Free, but needs a server:* Remark42 and Comentario.
