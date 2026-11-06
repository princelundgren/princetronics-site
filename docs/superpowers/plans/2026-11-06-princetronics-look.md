# PrinceTronics look and page structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site's pages follow the spec's *Content model* and *Look*: the new page start, unnumbered steps after *What you'll need*, tags last at `/tag/<tag>/`, picture cards, and the charcoal, grey and sky-blue look with self-hosted fonts and dark mode.

**Architecture:** The schema loses the fields the design dropped and gains `video`. `EntryLayout` renders the new page start and places *What you'll need* between the body's intro and its first `##` step, by splitting the rendered body. Tag pages move from `src/pages/tags/` to `src/pages/tag/`, and the edge function serves a current tag URL instead of redirecting it. The look is CSS custom properties in `global.css` for light and dark, with fonts from Astro's Fonts API.

**Tech Stack:** Astro 7.4.5 (`fonts` config, `<Font />` from `astro:assets`, `Astro.slots.render()`), Zod via `astro/zod`, Vitest 5 with the Container API, CloudFront Functions JavaScript.

**Spec:** `docs/superpowers/specs/2026-11-05-princetronics-rebuild-design.md` (*Content model*, *Look*), with the mockup `docs/superpowers/specs/mockups/project-pages.html`.

## Global Constraints

- Colours: header and footer `#2f3238`; accent `#74b6d8`; headings `#444`; text `#666`; background white. No black text.
- The sky blue only on charcoal or as a non-text accent; links and tag pills in a darker shade of it.
- All text meets WCAG 2.2 AA: 4.5:1 for normal text, in light and in dark mode; small grey text no lighter than `#767676` on white.
- Type: headings Source Serif 4 at weight 300, body text Inter at 400 and 500 for the navigation and tag pills, served from the site (no request to Google from a page).
- Dark mode follows `prefers-color-scheme`; no toggle.
- No new client-side JavaScript; the copy button stays the only script.
- Nothing from YouTube loads on a page: a video is a link.
- Fixtures stay invented: no real site content in this repo (`AGENTS.md`).
- Tests: `npm test` (unit, Container API) and `npm run test:dist` (built site). Both green at the end of every task.

## Review Focus

1. A guide whose body has no `##` heading: the whole body is the intro and *What you'll need* follows it (Task 2, `splitAtFirstStep`).
2. A `video` that is not a YouTube watch URL, such as a playlist, a channel or another host: the build fails naming the field (Task 2, schema test).
3. A part's `whereToBuy` that is plain text, or a non-HTTP URL such as `javascript:`: shown as text, never as a link (Task 2, `PartsList` test).
4. A published tag's own URL, whether or not WordPress had a term with that slug, and including one ending in `embed` or `feed`: served as the page, never a redirect to itself, to its parent or home (Task 1, edge tests).
5. A palette value changed later so that a text colour drops below 4.5:1 in either scheme, or a token goes missing from a scheme: the unit suite fails (Task 4, palette test).

---

### Task 1: Tag pages at `/tag/<tag>/`

**Files:**
- Move: `src/pages/tags/[tag].astro` → `src/pages/tag/[tag].astro` (canonical path `/tag/${tag}/`)
- Modify: `src/layouts/EntryLayout.astro` (tag links), `edge/viewer-request.js` (`fromTerm`, the section-prefix line in `destination`), `edge/build-function.ts` (`termTargets` and its comment; `RESERVED_SLUGS`: `tags` → `tag`), `fixtures/inventory.json` (`/tags/arduino/` → `/tag/arduino/`, and add `{ "url": "https://www.princetronics.com/tag/drones/" }`)
- Test: `test/edge/viewer-request.test.ts`, `test/edge/build-function.test.ts`, `test-dist/list-pages.test.ts`

**Interfaces:**
- Produces: tag page URLs `/tag/<tagSlug(tag)>/`; the function data's `tags` holds every published tag's slug, and `terms` maps each other published WordPress term to its tag's slug; `destination(path, query)` returns `undefined` for `/tag/<slug>/` when `<slug>` is in `tags`.

- [ ] **Step 1: Change the tests to the new path and add the self-redirect case**
  - In `viewer-request.test.ts`, every expected `/tags/` location becomes `/tag/`, and:
    - `serves a current tag page instead of redirecting it`: `/tag/arduino/` on www is not a redirect, and its `uri` becomes `/tag/arduino/index.html`.
    - `/tag/arduino/page/2/` and `/tag/arduino/feed/` still 301 to `https://www.princetronics.com/tag/arduino/`.
    - `/tag/cplusplus/` still 301s to `/tag/c-plus-plus/`; `/tag/unknown/` to `/`.
    - `serves new pages whose slug ends in feed or embed` uses `/tag/rss-feed/` and `/tag/embed/`, with `embed` added to the test data's `tags`.
  - In `build-function.test.ts`:
    - the expected `/tags/` locations become `/tag/`, and `legacySlug: tags` becomes `legacySlug: tag`, which must throw `/"tag"/`;
    - `serves a published tag that WordPress never had`: `locationOf(code, '/tag/drones/')` is `undefined` (the fixtures publish `Drones` with no WordPress term);
    - in the size test, `/tag/${termNames[1]}/` is now served (`undefined`), and the code stays at or under 10,240 bytes.
  - In `list-pages.test.ts`, `dist/tags` becomes `dist/tag`.
- [ ] **Step 2: Run** `npm test` and `npm run test:dist`. Expected: the changed cases FAIL on `/tags/` locations and on the missing `dist/tag`.
- [ ] **Step 3: Implement.**
  - `termTargets` puts every published tag's slug in `tags`, and the other published terms in `terms`.
  - In `fromTerm`, the target becomes `'/tag/' + … + '/'`, and a target equal to the request path returns `undefined` so the page is served.
  - In `destination`, the section-prefix line becomes `/^\/(projects|articles|tag)\//`, so a served tag page whose slug ends in `embed` or `feed` doesn't fall through to the parent rule.
  - If the size test goes over 10,240 bytes, keep `tags` to slugs no `terms` value names, and have `fromTerm` also serve a slug that is a `terms` value.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -S -m "Move tag pages to /tag/, where WordPress had them"`

### Task 2: The project and article page

**Files:**
- Modify: `src/lib/schemas.ts`, `src/layouts/EntryLayout.astro`, `src/pages/projects/[slug].astro` and `src/pages/articles/[slug].astro` (both stop passing `headings`, which only `OnThisPage` used), the fixtures under `fixtures/content/projects/` and `fixtures/content/articles/`
- Create: `src/lib/guide-body.ts`, `src/components/EntryDemo.astro`, `src/components/PartsList.astro`
- Delete: `src/components/WhyHowResult.astro`, `src/components/GuideAtAGlance.astro`, `src/components/OnThisPage.astro`, `src/components/PartsTable.astro`, and their tests in `test/entry-components.test.ts`
- Test: `test/schemas.test.ts`, `test/guide-body.test.ts`, `test/entry-components.test.ts`, `test-dist/entry-pages.test.ts`

**Interfaces:**
- Produces: `splitAtFirstStep(html: string): { intro: string; steps: string }`; `EntryDemo` props `{ cover: ImageMetadata; coverAlt: string; video?: string }`; `PartsList` props `{ parts: Guide['parts']; tools: string[] }`; project field `video?: string`.

- [ ] **Step 1: Write the failing tests**
  - `schemas.test.ts`:
    - a project without `why`, `how`, `result` and with a guide of only `parts` and `tools` parses;
    - a part without `whereToBuy` parses;
    - `video: https://www.youtube.com/watch?v=abc123` parses;
    - `https://www.youtube.com/playlist?list=x`, `https://vimeo.com/1` and `http://www.youtube.com/watch?v=abc123` are rejected, with an error naming `video`.
  - `guide-body.test.ts`:
    - `splits before the first h2`: `'<p>Intro</p><h2 id="a">A</h2><p>x</p>'` → `{ intro: '<p>Intro</p>', steps: '<h2 id="a">A</h2><p>x</p>' }`;
    - `a body with no h2 is all intro`: `'<p>Only</p>'` → `{ intro: '<p>Only</p>', steps: '' }`;
    - `a body that starts with a step has no intro`: `'<h2>A</h2>'` → `{ intro: '', steps: '<h2>A</h2>' }`.
  - `entry-components.test.ts`:
    - `PartsList` renders one `<li>` per part with its quantity;
    - a price when given;
    - an `https:` `whereToBuy` as `<a href>`;
    - plain text and `javascript:alert(1)` as text with no `href`;
    - `Tools:` and the tools when `tools` is not empty.
    - `EntryDemo` with a `video` renders `<a href="https://www.youtube.com/watch?v=abc123"` with the accessible name "Watch the video on YouTube", and no `<iframe`; without one, no `<a`.
  - `entry-pages.test.ts`, replacing the On-this-page and parts-table cases:
    - the guide page has, in this order: `<h1`, `class="summary"`, `class="demo"`, `class="date"`, the intro paragraph, `class="parts"`, the first step `<h2`, `class="tags"`, `Suggest a fix`;
    - no `aria-label="On this page"`, `class="why-how-result"` (the removed block's class), `← Projects` or `<iframe`;
    - the date test matches `<p class="date">` instead of `<span class="date">`;
    - the showcase test becomes `not.toContain('class="parts"')`, since `<table class="parts"` can no longer appear;
    - the article page has no `class="demo"`;
    - tag links point to `/tag/`.
- [ ] **Step 2: Run** `npm test` and `npm run test:dist`. Expected: FAIL on the missing modules and the old page order.
- [ ] **Step 3: Update the fixtures.**
  - Remove `why`, `how` and `result` from every entry, and `difficulty`, `time` and `cost` from the guide.
  - Give `read-433mhz-codes` an intro paragraph before its first `##`, and `video: https://www.youtube.com/watch?v=example0001`.
  - Leave one part without `whereToBuy`.
- [ ] **Step 4: Implement.**
  - **Schema:**
    - drop the fields;
    - `whereToBuy: z.string().optional()`;
    - `video` on projects only, `z.url({ protocol: /^https$/, hostname: /^(www\.)?youtube\.com$/ })` refined to path `/watch` with a `v` parameter (check the `z.url` options in `astro/zod`'s Zod 4 docs first).
  - **`splitAtFirstStep`:** splits at the first `<h2`.
  - **`EntryLayout`:**
    - renders the spec's page start: `h1`, `p.summary`, `EntryDemo` for projects, `p.date`;
    - for a guide, `const body = await Astro.slots.render('default')`, then intro, `PartsList`, steps via `<Fragment set:html>`; otherwise the slot as now;
    - then the links, `div.tags` with links to `/tag/<slug>/`, Suggest a fix, and the discussion slot.
- [ ] **Step 5: Run** both suites and `npm run check`. Expected: PASS, no type errors.
- [ ] **Step 6: Commit** `git commit -S -m "Give project and article pages the new page start and guide order"`

### Task 3: Cards and the home page

**Files:**
- Modify: `src/components/EntryCard.astro`, `src/pages/index.astro`
- Test: `test-dist/list-pages.test.ts`

**Interfaces:**
- Consumes: the `pages` collection entry `about` (`data.summary`).

- [ ] **Step 1: Write the failing tests** in `list-pages.test.ts`:
  - the home page `<h1>` is `PrinceTronics`, followed by the About fixture's summary, `Who writes this site and why.`;
  - each card has, in order, its cover `<img`, `Project · Mar 2026` (or `Article · …`), the linked title and the summary;
  - each card has exactly one link, so the entry order tests and `linkedEntries` stay as they are.
- [ ] **Step 2: Run** `npm run test:dist`. Expected: FAIL on the `h1` and the card order.
- [ ] **Step 3: Implement.**
  - **The card:** one link, the title's, stretched over the whole card with a CSS `::after`, so the cover is clickable and screen readers hear the title once.
  - **The home page:** reads `getEntry('pages', 'about')` and throws a clear error naming `pages/about.md` when it is missing.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -S -m "Show posts as picture cards and open the home page with the About line"`

### Task 4: The look

**Files:**
- Modify: `astro.config.mjs` (`fonts`), `src/layouts/BaseLayout.astro`, `src/styles/global.css`, `src/pages/projects/index.astro`, `src/pages/articles/index.astro`, `src/pages/learning.astro`, `src/pages/about.astro` and `src/layouts/EntryLayout.astro` (each passes `currentSection`)
- Create: `src/lib/contrast.ts`
- Test: `test/base-layout.test.ts`, `test/contrast.test.ts`, `test-dist/site-files.test.ts`

**Interfaces:**
- Produces: `BaseLayout` prop `currentSection?: 'projects' | 'articles' | 'learning' | 'about'`; `contrastRatio(foreground: string, background: string): number` for `#rgb` and `#rrggbb`.

- [ ] **Step 1: Write the failing tests**
  - `contrast.test.ts`:
    - `contrastRatio('#666', '#fff')` is `5.74` to two decimals, and `#74b6d8` on `#fff` is `2.23`;
    - `the palette meets AA in both schemes` reads `src/styles/global.css`, takes the `:root` block as the light scheme and the `@media (prefers-color-scheme: dark)` block over it as the dark one. In each it asserts ≥ 4.5 for:
      - `--text`, `--heading`, `--muted` and `--link` on `--bg`;
      - `--header-text` and `--header-muted` on `--header-bg` (the footer uses the same tokens);
      - `--tag-text` on `--tag-bg`;
      - `--code-text` on `--code-bg` (the code and its Copy label);
      - `--demo-text` on `--demo-bg` (the play button's label).
    - `a missing token fails the palette test`: the parser throws naming the token when a pair's token is in neither block.
  - `base-layout.test.ts`:
    - the header's first link is `href="/"` with the accessible name `PrinceTronics`, and its visible text is `P`;
    - the header has no other "PrinceTronics" text;
    - with `currentSection: 'projects'`, the Projects link has `aria-current="true"`;
    - the footer has `PrinceTronics`, Follow, RSS and About.
  - `site-files.test.ts`: no file in `dist` references `fonts.googleapis.com` or `fonts.gstatic.com`, and `dist` holds at least one `.woff2`.
- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement**
  - **`fonts` in `astro.config.mjs`:**
    - Source Serif 4 at 300 and 600 (the "P" mark) as `--font-heading`, with `fallbacks: ['Georgia', 'serif']`, and Inter at 400 and 500 as `--font-text`, with `fallbacks: ['system-ui', 'sans-serif']`;
    - both through `fontProviders.fontsource()`, `styles: ['normal']`, `subsets: ['latin']`;
    - `<Font cssVariable=… preload />` for each in `BaseLayout`'s head (the Fonts guide in Astro's docs).
  - **`contrastRatio`:** the WCAG 2.x relative-luminance formula.
  - **`global.css`:** define the tokens the test reads, light under `:root` and dark under the media query, starting from the Global Constraints and the mockup. Then the header, footer, page start, demo play button, parts list, tags, cards grid and code blocks, as in the mockup.
- [ ] **Step 4: Run** both suites and `npm run check`. Expected: PASS.
- [ ] **Step 5: Look at it.**
  - `npm run dev` with the fixtures. Compare the home, a guide, the article and a tag page with the mockup, in light and dark, at 375 px and 1280 px wide.
  - Fix what differs, and run the suites again.
- [ ] **Step 6: Commit** `git commit -S -m "Give the site its look: charcoal header, light serif headings, greys and dark mode"`

### Task 5: Reconcile the spec

- [ ] **Step 1:** Compare the built site with *Content model* and *Look*. Update the spec for each deviation decided in a commit or this PR, and bump `verified` in its header.
- [ ] **Step 2: Commit** `git commit -S -m "Reconcile the design spec with the new look"`; when the spec already holds, the commit changes only `verified` and says so.
