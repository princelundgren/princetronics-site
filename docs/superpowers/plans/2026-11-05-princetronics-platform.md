# PrinceTronics platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public Astro platform that renders PrinceTronics from a content folder, previewable locally, with every page type the design names, tested against invented sample content.

**Architecture:** One Astro project reads all content from a folder given by `CONTENT_DIR` (default: the repo's own `fixtures/content`), so the private content repo previews with `CONTENT_DIR=<content checkout> npm run dev` and builds the same way in its CI. Pure logic (schemas, URLs, tags, comment threading) lives in `src/lib/` with unit tests; pages are tested on the built output.

**Tech Stack:** Astro 7, MDX, `@astrojs/rss`, `@astrojs/sitemap`, Zod 4 (`astro/zod`), Vitest with Astro's Container API, GitHub Actions on GitHub-hosted runners.

**Spec:** `docs/superpowers/specs/2026-11-05-princetronics-rebuild-design.md` (this plan covers its *Content model*, the platform half of *Repositories, preview and deploy*, and *Launch scope*'s pages; infrastructure, the edge function, migration and cut-over have their own plans).

## Global Constraints

- Versions: `astro@^7.4.5`, `@astrojs/mdx@^8.1.2`, `@astrojs/rss@^4.0.19`, `@astrojs/sitemap@^3.7.4`, `vitest@^5.1.0`; Node `>=22.23.4` (CI uses Node 24); npm with a committed `package-lock.json`.
- `astro.config.mjs`: `site: 'https://www.princetronics.com'`, `trailingSlash: 'always'`, `build: { format: 'directory' }`, `publicDir` = `<CONTENT_DIR>/public`.
- URLs: `/projects/<slug>/`, `/articles/<slug>/`, `/projects/`, `/articles/`, `/learning/`, `/tags/<tag>/`, `/about/`, `/follow/`, `/rss.xml`, `/404.html`.
- Navigation: Projects · Articles · Learning · About; the footer links Follow and RSS. Learning is in the navigation only when the learning collection has entries.
- English only. No client-side JavaScript except the code-block copy button.
- Drafts (`draft: true`) render in `astro dev` and never in a production build: not as pages, nor on the home or list pages, tag pages, RSS or sitemap.
- Old comments are never rendered as HTML and never carry author links.
- The repo is public: no account IDs, secrets, real content, redirect data or DNS details. Fixtures are invented sample content.
- CI: `runs-on: ubuntu-latest`, actions pinned to full commit SHAs, `permissions: contents: read`, no `pull_request_target` or `workflow_run`.
- Work happens on branch `platform-v1` in a worktree; one signed commit per task; one PR at the end. Never push to `main` after Task 1.

## Content folder contract

Plans 2 and 3 produce and consume this layout; it is the interface between the two repos.

```
<CONTENT_DIR>/
  projects/<slug>.md|mdx         images beside it: projects/<slug>/...
  articles/<slug>.md|mdx
  learning.json                  array of learning entries, each with an `id`
  pages/about.md, pages/follow.md
  comments/projects/<slug>.json  { "comments": Comment[] }, one file per entry that has old comments
  comments/articles/<slug>.json
  public/                        served from the site root as-is (wp-content/uploads/..., favicon)
```

## Review Focus

- Comment text containing `<script>`, `<a href>` or other markup: shown as literal text, never as markup (Task 5).
- A draft in a production build: absent from home, list pages, tag pages, RSS and sitemap, not only from its own URL (Task 7).
- Tags that differ only in case or spacing (`Arduino`, `arduino`, `Arduino `): one tag page, not two (Tasks 3 and 6).
- A reply whose parent comment was removed as spam: shown at top level, not dropped (Task 5).
- `CONTENT_DIR` pointing at a missing folder: the build fails naming that path, instead of building an empty site (Task 2).

---

### Task 1: Repository and CI

**Files:**
- Create: `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.nvmrc` (`24`)
- Create: `AGENTS.md`, `docs/superpowers/specs/2026-11-05-princetronics-rebuild-design.md`, `docs/superpowers/plans/2026-11-05-princetronics-platform.md` (this file)
- Create: `.github/workflows/ci.yml`
- Create: `src/lib/content-dir.ts`, `test/content-dir.test.ts`

**Interfaces:**
- Produces: `resolveContentDir(env: Record<string, string | undefined>, cwd: string): string` — absolute path of `env.CONTENT_DIR` (resolved against `cwd`), or of `<cwd>/fixtures/content` when unset; throws `Error` whose message contains the resolved path when the folder or its `projects/` subfolder is missing.
- Produces: npm scripts `dev`, `build`, `check` (`astro check`), `test` (`vitest run --dir test`), `test:dist` (`astro build && vitest run --dir test-dist`).

- [ ] **Step 1: Create the repo** — `gh repo create princelundgren/princetronics-site --public --description "Astro platform for princetronics.com: maker build guides and software projects"`, and clone it. Commit `AGENTS.md`, the spec and this plan to `main` as the initial commit and push; then `git worktree add ../princetronics-site-platform-v1 -b platform-v1` and do all further work there.
  - `AGENTS.md`: what the repo is, the content folder contract (point at this plan's section), `CONTENT_DIR`, the npm scripts, and "public repo: nothing private" with the list from Global Constraints.
- [ ] **Step 2: Scaffold** — Astro minimal template with the versions and config in Global Constraints; `astro.config.mjs` and `src/content.config.ts` both call `resolveContentDir(process.env, process.cwd())`.
- [ ] **Step 3: Write the failing tests** in `test/content-dir.test.ts`:
  - `resolves CONTENT_DIR relative to cwd` → `resolveContentDir({ CONTENT_DIR: '../c' }, '/x/site')` returns `'/x/c'` (use a temp folder with `projects/` so it exists).
  - `defaults to fixtures/content` when `CONTENT_DIR` is unset.
  - `fails naming a missing folder` → throws, message contains the resolved path.
  - `fails when projects/ is missing` → throws, message contains `projects`.
- [ ] **Step 4: Run** `npm test` — expect 4 FAIL (function not defined).
- [ ] **Step 5: Implement** `resolveContentDir` in `src/lib/content-dir.ts`.
- [ ] **Step 6: Run** `npm test` — expect 4 PASS.
- [ ] **Step 7: CI** — `.github/workflows/ci.yml` on `push` to `main` and `pull_request`: checkout, setup-node from `.nvmrc` with npm cache, `npm ci`, `npm run check`, `npm test`, `npm run test:dist`. Constraints from Global Constraints (pinned SHAs, read-only token). Run `actionlint` locally if installed.
- [ ] **Step 8: Mark the spec as building:** in the repo's copy, `status: building` and `governs:` = `src/**`, `astro.config.mjs`, `fixtures/**`, `.github/**`.
- [ ] **Step 9: Commit** — `git commit -S -m "Scaffold the Astro platform and its CI"`.

### Task 2: Content schemas and fixtures

**Files:**
- Create: `src/lib/schemas.ts`, `src/content.config.ts`, `test/schemas.test.ts`
- Create: `fixtures/content/` per the contract: two projects (one showcase, `fpv-drone.mdx`; one guide, `read-433mhz-codes.mdx` with three `##` steps and a code block), one article, one draft project (`draft-robot.md`), `learning.json` with two entries, `pages/about.md`, `pages/follow.md`, `comments/projects/read-433mhz-codes.json` (a thread with a reply, a reply whose parent id is absent, and a comment whose text contains `<script>alert(1)</script>` and a fenced code block), `public/wp-content/uploads/2014/06/sample.jpg`, one cover image per entry.

**Interfaces:**
- Produces, in `src/lib/schemas.ts` (pure Zod, so tests need no Astro runtime): `type ImageField = () => z.ZodType`; `makeProjectSchema(image: ImageField)`, `makeArticleSchema(image: ImageField)`, `learningSchema`, `pageSchema`, `commentFileSchema`, and the inferred types `Comment`, `Guide`, `LearningEntry`.
- Fields, exactly:
  - Shared by projects and articles: `title: string`, `summary: string`, `publishDate: z.coerce.date()`, `updatedDate?: z.coerce.date()`, `draft: boolean` (default `false`), `tags: string[]` (default `[]`), `cover: image()`, `coverAlt: string`, `why: string`, `how: string`, `result: string`, `legacySlug?: string`.
  - Projects add: `area: 'maker' | 'software'`, `repoUrl?: z.url()`, `relatedArticles: reference('articles')[]` (default `[]`), and `guide?: Guide` where `Guide = { difficulty: 'beginner' | 'intermediate' | 'advanced', time: string, cost: string, parts: { name: string, quantity: positive int, price?: string, whereToBuy: string }[] (min 1), tools: string[] }`.
  - `learningSchema`: `id: string`, `title: string`, `url: z.url()`, `type: 'guide' | 'open-source' | 'course'`, `topic: string`, `why: string`.
  - `pageSchema`: `title: string`, `summary: string`.
  - `commentFileSchema`: `{ comments: Comment[] }`, `Comment = { id: positive int, parent: positive int | null, author: string, date: z.coerce.date(), text: string }`.
- `src/content.config.ts`: collections `projects`, `articles` (glob `*.{md,mdx}` under the content folder), `learning` (`file()` on `learning.json`), `pages` (glob under `pages/`), `comments` (glob `**/*.json` under `comments/`, so ids are `projects/<slug>`). `relatedArticles` uses `reference('articles')` in the config, not in `schemas.ts`.

- [ ] **Step 1: Write the failing tests** in `test/schemas.test.ts` (pass `() => z.string()` as the image stub):
  - `a showcase project needs no guide` — valid without `guide`.
  - `a guide needs at least one part` — `guide.parts: []` fails.
  - `a part quantity must be a positive integer` — `0` and `1.5` fail.
  - `price is optional, whereToBuy is not` — missing `price` passes, missing `whereToBuy` fails.
  - `area accepts only maker or software`.
  - `draft defaults to false and tags to []`.
  - `a comment parent may be null`, `a comment id must be positive`.
- [ ] **Step 2: Run** `npm test -- schemas` — FAIL.
- [ ] **Step 3: Implement** `src/lib/schemas.ts` and `src/content.config.ts`; add the fixtures.
- [ ] **Step 4: Run** `npm test` — PASS; `npm run build` succeeds on the fixtures; `CONTENT_DIR=/nonexistent npm run build` fails and prints `/nonexistent`.
- [ ] **Step 5: Commit** — `Add the content schemas and sample content`.

### Task 3: Base layout, navigation and link metadata

**Files:**
- Create: `src/lib/entries.ts`, `test/entries.test.ts`, `src/layouts/BaseLayout.astro`, `src/components/CopyCodeButton.astro`, `test/base-layout.test.ts`

**Interfaces:**
- Produces, in `src/lib/entries.ts`:
  - `type Section = 'projects' | 'articles'`
  - `entryUrl(section: Section, id: string): string` → `/projects/<id>/`
  - `tagSlug(tag: string): string` — trim, lowercase, runs of non `[a-z0-9]` → `-`, no leading/trailing `-`.
  - `isPublished(entry: { data: { draft: boolean } }, isProduction: boolean): boolean`
  - `byNewest(a, b)` — comparator on `data.publishDate`, newest first.
  - `publishedEntries(section: Section): Promise<CollectionEntry<Section>[]>` — `getCollection` filtered by `isPublished(…, import.meta.env.PROD)`, sorted `byNewest`. Every page lists entries through this, never `getCollection` directly.
- Produces: `BaseLayout.astro` props `{ title: string, description: string, image?: ImageMetadata, canonicalPath: string, type?: 'website' | 'article' }`. It renders `<title>`, meta description, canonical (`new URL(canonicalPath, Astro.site)`), Open Graph (`og:title`, `og:description`, `og:url`, `og:type`, `og:image` from `getImage` at 1200 wide), `twitter:card` `summary_large_image`, the RSS `<link rel="alternate">`, the navigation and the footer, and includes `CopyCodeButton` (a small inline script adding a copy button to each `pre`).

- [ ] **Step 1: Write the failing tests:**
  - `test/entries.test.ts`: `entryUrl('projects', 'fpv-drone')` is `/projects/fpv-drone/`; `tagSlug('Arduino')`, `tagSlug(' arduino ')`, `tagSlug('ARDUINO')` are all `arduino`; `tagSlug('433 MHz')` is `433-mhz`; `isPublished` hides drafts only when `isProduction`; `byNewest` sorts 2026 before 2014.
  - `test/base-layout.test.ts` (Container API): renders `og:title`, `twitter:card`, a canonical of `https://www.princetronics.com/about/` for `canonicalPath: '/about/'`, the RSS alternate link, nav links Projects/Articles/About, and footer links Follow and RSS.
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement.** Learning's nav link is passed in as a prop (`showLearning: boolean`), computed by the page from the learning collection's size, so the layout stays testable.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** — `Add the base layout, navigation and link previews`.

### Task 4: Project and article pages, and "Suggest a fix"

**Files:**
- Create: `src/layouts/EntryLayout.astro`, `src/components/WhyHowResult.astro`, `src/components/GuideAtAGlance.astro`, `src/components/PartsTable.astro`, `src/components/OnThisPage.astro`, `src/lib/fix-link.ts`
- Create: `src/pages/projects/[slug].astro`, `src/pages/articles/[slug].astro`
- Create: `.github/ISSUE_TEMPLATE/content-fix.yml`, `.github/ISSUE_TEMPLATE/config.yml`
- Test: `test/fix-link.test.ts`, `test/entry-components.test.ts`, `test-dist/entry-pages.test.ts`

**Interfaces:**
- Consumes: Task 2 schemas, Task 3 `BaseLayout`, `entryUrl`, `tagSlug`, `publishedEntries`.
- Produces: `suggestFixUrl(pageUrl: string, title: string): string` → `https://github.com/princelundgren/princetronics-site/issues/new?template=content-fix.yml&title=<"Content fix: " + title, encoded>&page=<pageUrl, encoded>`.
- Produces: `EntryLayout.astro` props `{ entry: CollectionEntry<'projects' | 'articles'>, section: Section, headings: MarkdownHeading[] }`, with a named slot `discussion` (filled by Task 5).
- Issue form `content-fix.yml`: an input with `id: page` (label "Page"), a textarea `id: problem` (required), label `content-fix`.

Page order follows the approved mockup (`mockups/project-pages.html`; copy it to `docs/superpowers/specs/mockups/` in Step 3):

- Shared top: "← Projects" (or Articles) link, `h1` title, summary, tags (each linking `/tags/<tagSlug>/`), area for projects, "Mon YYYY" publish date and ", updated YYYY" when `updatedDate` is set, cover, then `WhyHowResult`.
- Guide project: `GuideAtAGlance` (difficulty · time · cost) above Why/How/Result; then a two-column body: `OnThisPage` (from `headings` of depth 2, plus "What you'll need") beside "What you'll need" (`PartsTable` from `guide.parts`, then tools) and the MDX body (its `##` headings are the steps, Troubleshooting and Downloads).
- Showcase project and article: the body, then for projects a links row (`repoUrl`, `relatedArticles`).
- Footer of every entry: "Suggest a fix" link (`suggestFixUrl`), then the `discussion` slot.

- [ ] **Step 1: Write the failing tests:**
  - `test/fix-link.test.ts`: the URL's `template` is `content-fix.yml`; `page` round-trips `https://www.princetronics.com/projects/a b/`; `title` starts with `Content fix: `.
  - `test/entry-components.test.ts` (Container API): `PartsTable` renders one row per part with quantity, and a `—` when `price` is absent; `GuideAtAGlance` renders `Beginner · ~1 hour · ~100 SEK` from those three fields; `OnThisPage` lists "What you'll need" then each depth-2 heading as a link to `#<slug>`.
  - `test-dist/entry-pages.test.ts` (on `dist/`): `projects/read-433mhz-codes/index.html` has the parts table, the On-this-page list and the Suggest-a-fix link; `projects/fpv-drone/index.html` has no parts table; `articles/<fixture>/index.html` exists; `projects/draft-robot/index.html` does not exist.
- [ ] **Step 2: Run** `npm test && npm run test:dist` — FAIL.
- [ ] **Step 3: Implement** the components, layout, pages (`getStaticPaths` from `publishedEntries`, `render(entry)` for `Content` and `headings`) and the issue template.
- [ ] **Step 4: Run** `npm test && npm run test:dist` — PASS. Run `npm run dev` and look at both fixture projects against the mockup.
- [ ] **Step 5: Commit** — `Add project, guide and article pages`.

### Task 5: Earlier discussion (old comments, read-only)

**Files:**
- Create: `src/lib/comments.ts`, `src/components/EarlierDiscussion.astro`, `test/comments.test.ts`, `test/earlier-discussion.test.ts`
- Modify: `src/pages/projects/[slug].astro`, `src/pages/articles/[slug].astro` (fill the `discussion` slot)

**Interfaces:**
- Consumes: `Comment` (Task 2), the `comments` collection (id `projects/<slug>`).
- Produces:
  - `type ThreadNode = { comment: Comment, replies: ThreadNode[] }`
  - `buildThread(comments: Comment[]): ThreadNode[]` — nests by `parent`; a comment whose parent is `null` or not in the list is top-level; siblings in ascending `date`.
  - `type TextBlock = { kind: 'paragraph' | 'code', text: string }`
  - `textToBlocks(text: string): TextBlock[]` — ```` ``` ```` fences become `code` blocks (fence lines dropped); the rest splits on blank lines into `paragraph`s; empty blocks dropped.
- `EarlierDiscussion.astro` props `{ comments: Comment[] }`: renders nothing when empty; otherwise an `h2` "Earlier discussion", then the thread as nested `ol`s, each comment an `article` with `id="comment-<id>"`, author name as plain text, date, and its blocks as `<p>` / `<pre><code>` through Astro's escaping expressions only (no `set:html` anywhere in this component).

- [ ] **Step 1: Write the failing tests:**
  - `test/comments.test.ts`: a reply nests under its parent; a reply whose parent is missing is top-level; siblings sort by date; `textToBlocks('a\n\nb')` is two paragraphs; a fenced block becomes one `code` block keeping its inner newlines.
  - `test/earlier-discussion.test.ts` (Container API): the fixture comment `<script>alert(1)</script>` appears as `&lt;script&gt;` and the output contains no `<script>alert`; each comment has `id="comment-<id>"`; no `<a` inside the discussion; an empty list renders an empty string.
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement**, and fill the slot from `getEntry('comments', \`${section}/${id}\`)`.
- [ ] **Step 4: Run** `npm test && npm run test:dist` — PASS.
- [ ] **Step 5: Commit** — `Show old comments read-only as Earlier discussion`.

### Task 6: Home, list, tag and learning pages

**Files:**
- Create: `src/components/EntryCard.astro`, `src/pages/index.astro`, `src/pages/projects/index.astro`, `src/pages/articles/index.astro`, `src/pages/tags/[tag].astro`, `src/pages/learning.astro`, `src/lib/tags.ts`
- Test: `test/tags.test.ts`, `test-dist/list-pages.test.ts`

**Interfaces:**
- Consumes: `publishedEntries`, `entryUrl`, `tagSlug`, `BaseLayout`.
- Produces: `collectTags(entries: { data: { tags: string[] } }[]): Map<string, { label: string, count: number }>` keyed by `tagSlug`; the label is the first spelling seen. Plan 3 maps old `/tag/<x>/` URLs onto these keys.
- Home: every published project and article together, newest first, as `EntryCard`s (cover, title, summary, section, date). `/projects/` and `/articles/` list their section the same way. `/tags/<tag>/` lists every published entry with that tag. `/learning/` groups the learning entries by `topic`, each with title (link), type and `why`; with no entries it says so in one line.

- [ ] **Step 1: Write the failing tests:**
  - `test/tags.test.ts`: `Arduino`, `arduino` and `Arduino ` collapse to one key `arduino` with `count: 3`.
  - `test-dist/list-pages.test.ts`: home lists both fixture projects and the article, newest first, and not `draft-robot`; `tags/arduino/index.html` exists once; no tag page exists for a tag used only by the draft; `learning/index.html` groups by topic; the nav contains Learning (fixtures have entries).
- [ ] **Step 2: Run** `npm test && npm run test:dist` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run test:dist` — PASS. Also build once with an empty `learning.json` (`[]`) in a temp copy of the fixtures and confirm the nav has no Learning link.
- [ ] **Step 5: Commit** — `Add the home, list, tag and learning pages`.

### Task 7: About, Follow, 404, RSS and sitemap

**Files:**
- Create: `src/pages/about.astro`, `src/pages/follow.astro`, `src/pages/404.astro`, `src/pages/rss.xml.ts`
- Modify: `astro.config.mjs` (add `@astrojs/sitemap`)
- Test: `test-dist/site-files.test.ts`

**Interfaces:**
- Consumes: the `pages` collection (`about`, `follow`), `publishedEntries`, `entryUrl`.
- `/about/` and `/follow/` render their page entry; `/follow/` also shows the RSS URL `https://www.princetronics.com/rss.xml`. A missing `about` or `follow` entry fails the build with a message naming the file.
- `/rss.xml`: `@astrojs/rss`, title "PrinceTronics", every published project and article, newest first, `link` from `entryUrl`, `pubDate` from `publishDate`, `description` from `summary`.
- Sitemap: `@astrojs/sitemap` with a `filter` that excludes `/404/`.

- [ ] **Step 1: Write the failing tests** in `test-dist/site-files.test.ts`:
  - `rss.xml` is valid XML with one `<item>` per published fixture entry, and no `draft-robot`.
  - `sitemap-index.xml` exists; no sitemap file mentions `draft-robot` or `404`.
  - `404.html` exists at the root of `dist/`.
  - `about/index.html` and `follow/index.html` exist; `follow/index.html` contains `/rss.xml`.
  - Every `index.html` in `dist/` sits in a folder (directory format), and every internal `href` ends in `/` or a file extension.
- [ ] **Step 2: Run** `npm run test:dist` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check && npm test && npm run test:dist` — all PASS.
- [ ] **Step 5: Commit** — `Add About, Follow, 404, RSS and the sitemap`.

### Finish

- [ ] Preview against an outside folder: copy `fixtures/content` to a temp folder, run `CONTENT_DIR=<temp> npm run dev`, confirm a page renders from it.
- [ ] Whole-branch review, then open the PR; CI green on the PR.
- [ ] Spec reconciliation: compare the spec's *Content model* with what was built, update it where a decided deviation happened, and bump `verified` in the PR.
