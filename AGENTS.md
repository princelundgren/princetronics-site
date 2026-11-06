# princetronics-site

The Astro platform for www.princetronics.com. It renders the site from a content folder that lives in a separate,
private repository; this repo holds only code and invented sample content in `fixtures/content`.

## This repository is public

Everything here, including commit messages, PR and issue text, is public. Never add:

- account IDs, secrets, DNS details or redirect data
- real site content, drafts, or comment data
- anything about the maintainer's private repositories or infrastructure

Fixtures are invented sample content.

## Content folder

`CONTENT_DIR` names the content folder (default `fixtures/content`), resolved against the working directory. Its
layout is the contract between the two repos: see *Content folder contract* in the design spec's *Repositories,
preview and deploy*. Its `public/` folder is served from the site root.

```sh
CONTENT_DIR=../path/to/content npm run dev
```

## Commands

- `npm run dev`: local preview; drafts are visible here and never in a production build
- `npm test`: unit and component tests (`test/`)
- `npm run test:dist`: builds, then tests the built site (`test-dist/`)
- `npm run check`: `astro check`
- `npx vitest run test/<file>.test.ts`: one test file

Stop `astro dev` (`npx astro dev stop`) before a build: the build regenerates `.astro/`, which the dev server reads,
and a build against another content folder leaves a running dev server failing to render entries.

## Conventions

- Lists of entries go through `publishedEntries()` in `src/lib/entries.ts`, never `getCollection` directly, so drafts
  stay out of production pages, tags, RSS and the sitemap.
- Old comments are plain text: never `set:html`, never author links.
- No client-side JavaScript except the code-block copy button.
- The design is `docs/superpowers/specs/2026-11-05-princetronics-rebuild-design.md`; change it with the code it
  describes.
- CI runs on GitHub-hosted runners, actions pinned to full commit SHAs, with a read-only token.
- Signed commits; changes land through pull requests.
