# PrinceTronics edge function, URL check and infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The viewer-request CloudFront Function (generated from a template and the content folder's redirect data), the URL check that proves every old URL still lands, and the CDK app that hosts the site, all tested against invented data, ready for a first deploy.

**Architecture:** `edge/viewer-request.js` is the rule engine: plain JavaScript for CloudFront's JS 2.0 runtime, with one placeholder that `edge/build-function.ts` fills with redirect data resolved to final URLs from the content folder. `infra/` is a separate npm package (so the site build never installs CDK) holding three stacks in us-east-1: record-writer access in the hosted zone's account, the site in the workload account, and the CI roles. Every account ID, zone ID and repository ID is a CDK context input; none is committed.

**Tech Stack:** CloudFront Functions (`cloudfront-js-2.0`), AWS CDK v2 in TypeScript, cdk-nag, Vitest, Zod 4.

**Spec:** `docs/superpowers/specs/2026-11-05-princetronics-rebuild-design.md`: *Migration* (the redirect rules and the URL check's tool; the inventory it runs on is migration work), *Repositories, preview and deploy* (the function's generation, the OIDC roles) and *Hosting and cut-over* (everything but the cut-over steps).

## Global Constraints

- Versions: `aws-cdk-lib@2.275.0`, `aws-cdk@2.1148.0`, `constructs@10.8.1`, `cdk-nag@3.0.2` (exact pins in `infra/package.json`); `yaml@^2.9.1` in the site package's devDependencies.
- Names: domain `princetronics.com`; hosts `princetronics.com`, `www.princetronics.com`, `www-static.princetronics.com`; canonical origin `https://www.princetronics.com`. Stacks `PrinceTronics-ZoneAccess`, `PrinceTronics-Site`, `PrinceTronics-Ci`, all in `us-east-1`. Every resource tagged `project=princetronics`.
- Context inputs, none committed: `workloadAccount`, `zoneAccount` (12 digits each), `hostedZoneId`, `contentRepo` (`<owner>@<owner id>/<repo>@<repo id>`), `budgetEmail`, optional `oidcProviderArn`, and `functionCode` (default `../edge-dist/viewer-request.js`). Tests use `111111111111`, `222222222222`, `Z0000000000EXAMPLE` and `example@111/content@222`.
- The function: under 10,240 bytes as generated, no logging, no KeyValueStore, only features on AWS's *JavaScript runtime 2.0 features for CloudFront Functions* page.
- Before Task 3, the maintainer confirms the workload account can take a Free plan (spec, *Pricing*).
- Free plan limits: at most 5 WAF rules, no custom rule groups, only managed cache, origin-request and response-headers policies, at most 5 cache behaviours, no Lambda@Edge.
- The repo is public: no account IDs, zone IDs, redirect data, or anything about where the hosted zone or the registration live. Code is written so it reads the same whichever account holds the zone.
- cdk-nag's `AwsSolutionsChecks` runs on every synth (`Validations.of(app).addPlugins(...)`); each acknowledged finding names its reason.
- Branch `edge-and-infra` in a worktree, one signed commit per task, one PR at the end. CI as in plan 1: GitHub-hosted, actions pinned to SHAs, `contents: read`.

## Review Focus

- An old URL without its trailing slash (`/old-slug`, `/category/x`): one redirect straight to the final URL, never two (Task 1).
- A request to the apex or `www-static` for a path that also redirects: one redirect that fixes host and path together (Task 1).
- A legacy slug equal to a new top-level path (`projects`, `tags`, `about`, `wp-content`): the generator fails naming it, instead of shadowing a section (Task 2).
- A WordPress term whose tag no published entry uses (only a draft has it): redirects to `/`, not to a tag page that 404s (Task 2).
- The certificate's validation records not yet resolvable: the custom resource keeps waiting, up to 1 hour (the provider framework's maximum), rather than failing the stack within minutes (Task 4).
- An `http://` inventory URL: CloudFront's https redirect counts as one of its two hops, so a second function redirect fails the check (Task 7).

---

### Task 1: The rule engine

**Files:**
- Create: `edge/viewer-request.js`, `test/edge/load-function.ts`, `test/edge/viewer-request.test.ts`

**Interfaces:**
- Produces: `edge/viewer-request.js` declares `function handler(event)` and contains the line `var DATA = __REDIRECT_DATA__;` exactly once. `DATA` is `{ slugs: { [legacySlug]: url }, ids: { [key]: url }, terms: { ['category/<slug>' | 'tag/<slug>']: url }, paths: { [oldPath]: url } }`; `ids` keys are `p<id>`, `page<id>` and `attachment<id>`; every `url` is a site path such as `/projects/x/`.
- Produces: `loadFunction(code: string): (event: CloudFrontEvent) => CloudFrontRequest | CloudFrontResponse` in `test/edge/load-function.ts`: runs the code in a fresh `node:vm` context and returns its `handler`. `requestEvent(host: string, uri: string, query?: Record<string, string>)` builds the viewer-request event shape (`querystring` as `{ key: { value } }`).

Rules, in this order. "Redirect to P" means `301` with `location: https://www.princetronics.com` + P; the query string is dropped.

1. Normalise the path: an extensionless path without a trailing slash gains one (`/old-slug` → `/old-slug/`) for the lookups below.
2. Query forms: `p`, `page_id`, `attachment_id` → `ids` (missing id → `/`); `feed=comments-rss2|comments-atom` → `410`; any other `feed` → `/rss.xml`; `cat`, `author`, `s`, `m`, `paged` → `/`. `replytocom` and unknown keys are ignored.
3. `/feed/`, `/feed/<anything>/` → `/rss.xml`. `/comments/feed/…` → `410`.
4. `/category/…` and `/tag/…`: strip a trailing `feed/` or `page/<n>/`, take the last segment, look up `terms['<category|tag>/<segment>']`, else `/`.
5. `/wp-sitemap…xml` → `/sitemap-index.xml`.
6. Prefixes `/wp-content/themes/`, `/wp-content/plugins/`, `/wp-includes/`, `/wp-json/`, `/wp-admin/`, and paths `/xmlrpc.php`, `/wp-login.php` → `410 Gone` (no redirect, any host).
7. `/author/…`, `/page/<n>/`, `/search/…`, `/<4 digits>/…` → `/`.
8. `paths[p]` → that URL, where `p` is the normalised path or the longest `paths` key it starts with.
9. `slugs[first segment]` → that URL, for the slug and any path under it.
9a. A path ending in `feed/`, `embed/` or `comment-page-<n>/` that matched nothing above redirects to its parent (`/about/feed/` → `/about/`).
10. Host: `www-static.princetronics.com` serves only `/wp-content/uploads/…`; any other path there, and every path on the apex, redirects to `www` with rules 1–9 applied in that same redirect. A path that matched nothing redirects to its normalised form.
11. On `www`, if step 1 changed the path, redirect to the normalised path. Otherwise, serve: a path ending in `/` gets `index.html` appended to `request.uri`.

- [ ] **Step 1: Write the failing tests** in `test/edge/viewer-request.test.ts`, loading the template with `__REDIRECT_DATA__` replaced by an inline invented `DATA` (`slugs: { 'old-post': '/projects/new-post/' }`, `ids: { p12: '/projects/new-post/', page3: '/about/' }`, `terms: { 'tag/cplusplus': '/tags/c-plus-plus/' }`, `paths: { '/email-subscription/': '/follow/' }`):
  - `serves the index of a directory path` → `www`, `/projects/new-post/` returns a request with uri `/projects/new-post/index.html`.
  - `redirects an old slug and everything under it` → `/old-post/`, `/old-post/feed/`, `/old-post/comment-page-2/`, `/old-post` all 301 to `https://www.princetronics.com/projects/new-post/`.
  - `redirects the apex and an old slug in one hop` → apex `/old-post` 301 to the new URL.
  - `serves uploads on www-static and www`, `redirects other www-static paths to www` (`/about/` → `https://www.princetronics.com/about/`).
  - `maps query forms` → `/?p=12` and `/?page_id=3` to their URLs, `/?p=999` and `/?s=x` to `/`, `/?feed=rss2` to `/rss.xml`, `/?feed=comments-rss2` to 410.
  - `maps feeds` → `/feed/`, `/feed/atom/` to `/rss.xml`; `/comments/feed/` to 410.
  - `maps paths and what is under them` → `/email-subscription/` and `/email-subscription/feed/` to `/follow/`; `/about/feed/` and `/about/embed/` to `/about/`.
  - `maps terms by data, else home` → `/tag/cplusplus/`, `/tag/cplusplus/page/2/` to `/tags/c-plus-plus/`; `/category/parent/child/` and `/tag/unknown/` to `/`.
  - `retires WordPress internals with 410` → each path in rule 6, on `www` and on the apex.
  - `sends archives home` → `/author/x/`, `/page/2/`, `/2015/03/` to `/`; `/wp-sitemap.xml`, `/wp-sitemap-posts-post-1.xml` to `/sitemap-index.xml`.
  - `adds a missing trailing slash` → `/learning` 301 to `https://www.princetronics.com/learning/`; `/rss.xml` and `/_astro/a.css` are served unchanged.
- [ ] **Step 2: Run** `npx vitest run test/edge/viewer-request.test.ts` — FAIL (file missing).
- [ ] **Step 3: Implement** `edge/viewer-request.js`: one file, no modules, no `console.log`.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** — `Add the viewer-request rule engine`.

### Task 2: Redirect data and the function generator

**Files:**
- Create: `src/lib/redirect-data.ts`, `edge/build-function.ts`, `test/redirect-data.test.ts`, `test/edge/build-function.test.ts`, `fixtures/content/redirects.json`
- Modify: `package.json` (script `build:edge`: `tsx edge/build-function.ts`, devDependencies `yaml`, `tsx`), `.gitignore` (`edge-dist/`)
- Move: `entryUrl` and `Section` from `src/lib/entries.ts` to a new `src/lib/urls.ts` with no `astro:*` imports, so plain Node can load it; `entries.ts` and its callers import it from there
- Modify: `docs/superpowers/specs/2026-11-05-princetronics-rebuild-design.md` (*Content folder contract* moves here from plan 1, with `redirects.json` added), `AGENTS.md` (point the contract at the spec)

**Interfaces:**
- Consumes: Task 1's `DATA` shape; `tagSlug` and `collectTags` from `src/lib/tags.ts`; `entryUrl` from `src/lib/urls.ts`.
- Produces: `redirectDataSchema` (Zod) for `<CONTENT_DIR>/redirects.json`: `{ posts: Record<id, legacySlug>, pages: Record<id, path>, attachments: Record<id, postId> (attached media only), terms: Record<'category/<slug>' | 'tag/<slug>', name>, paths: Record<oldPath, newPath> }`, ids as digit strings, paths starting and ending with `/`.
- Produces: `buildFunctionCode(contentDir: string, template: string): string` in `edge/build-function.ts`, and a CLI that reads `CONTENT_DIR` (default `fixtures/content`, as the site build does) and writes `edge-dist/viewer-request.js`. It reads published entries' front matter (`yaml`, between the leading `---` lines; `draft: true` skipped), fills `ids` (`p<id>` for posts and pages, `page<id>` for pages, `attachment<id>` for attachments) and `slugs` by resolving `posts` and `attachments` through the entries' `legacySlug`s to `entryUrl`s, resolves each term name through `tagSlug` to `/tags/<slug>/` only if `collectTags` over published entries has that key, and drops terms that resolve to `/` (the engine's default).
- It throws, naming the file or value, when: `redirects.json` fails the schema; two entries share a `legacySlug`; a `legacySlug` is one of `projects`, `articles`, `tags`, `learning`, `about`, `follow`, `rss.xml`, `wp-content`, `_astro`; a `posts` id names a slug no published entry has; a mapping points at itself; or the output exceeds 10,240 bytes (the message gives the size).

- [ ] **Step 1: Write the failing tests:**
  - `test/redirect-data.test.ts`: a non-digit id fails; a path without a trailing slash fails; an empty file `{posts:{},pages:{},attachments:{},terms:{},paths:{}}` passes.
  - `test/edge/build-function.test.ts` against a temp copy of `fixtures/content`: the fixture's `legacySlug` maps to `/projects/read-433mhz-codes/`; the draft's `legacySlug` (add `legacySlug: old-robot` to `draft-robot.md`) is absent; a term naming `Robots` (used only by the draft) is absent; a term naming `ARDUINO` maps to `/tags/arduino/`; a duplicate `legacySlug`, a `legacySlug: tags`, and a self-mapping each throw naming the value; `redirects.json` padded past 10,240 bytes throws with the size; the output contains no `__REDIRECT_DATA__` and runs through `loadFunction`.
- [ ] **Step 2: Run** `npm test` — FAIL.
- [ ] **Step 3: Implement**, and add `fixtures/content/redirects.json` with invented ids covering each key.
- [ ] **Step 4: Run** `npm test && npm run build:edge && wc -c edge-dist/viewer-request.js` — PASS, size under 10,240.
- [ ] **Step 5: Spec:** move *Content folder contract* into the spec's *Repositories, preview and deploy* section, adding `redirects.json  the WordPress ids, terms and fixed paths the function maps` to the layout; `AGENTS.md`'s *Content folder* points there. Add `edge/**` and `infra/**` to `governs`.
- [ ] **Step 6: Commit** — `Generate the viewer-request function from the content folder`.

### Task 3: CDK app, inputs and the record-writer access stack

**Files:**
- Create: `infra/package.json`, `infra/package-lock.json`, `infra/tsconfig.json`, `infra/cdk.json`, `infra/bin/app.ts`, `infra/lib/inputs.ts`, `infra/lib/zone-access-stack.ts`, `infra/lib/site-budget.ts`, `infra/test/inputs.test.ts`, `infra/test/zone-access-stack.test.ts`
- Modify: `.gitignore` (`infra/cdk.out/`, and `infra/cdk.context.json`, where a deploy puts its real inputs)

**Interfaces:**
- Produces: `readInputs(context: Record<string, unknown>): Inputs` in `infra/lib/inputs.ts`, `Inputs = { workloadAccount, zoneAccount, hostedZoneId, contentRepo, budgetEmail, oidcProviderArn?, functionCode }` (strings); throws naming the first missing or malformed key and the form it expects. `functionCode` must name an existing file.
- Produces: `RECORD_WRITER_ROLE_NAME = 'PrinceTronics-RecordWriter'` and `recordWriterRoleArn(zoneAccount: string): string`.
- Produces: `SiteBudget` construct `{ email: string }`: a monthly `CfnBudget` of 2 USD with `Metrics: ['UnblendedCost']` and `FilterExpression: { Tags: { Key: 'user:project', Values: ['princetronics'] } }` (the `user:` key form of the Budgets API reference's `CreateBudget` tag example) (not `CostFilters`, which the API refuses alongside `FilterExpression`), emailing at ACTUAL > 100 % and FORECASTED > 100 %.
- `ZoneAccessStack` (env `zoneAccount`/`us-east-1`): role `PrinceTronics-RecordWriter` trusted by the workload account's root principal, allowed `route53:ChangeResourceRecordSets` on the zone ARN only, with `ForAllValues:StringEquals` on `route53:ChangeResourceRecordSetsRecordTypes` = `A`, `AAAA`, `CNAME` and `route53:ChangeResourceRecordSetsActions` = `UPSERT`, `DELETE`, and `ForAllValues:StringLike` on `route53:ChangeResourceRecordSetsNormalizedRecordNames` = the three host names and `_*.princetronics.com`; `route53:ListResourceRecordSets` on the zone; `route53:GetChange` on `*`. Plus a `SiteBudget`.

- [ ] **Step 1: Write the failing tests:**
  - `infra/test/inputs.test.ts`: each missing key throws naming it; `workloadAccount: '123'` throws naming the 12-digit form; `contentRepo: 'owner/repo'` throws naming the `owner@id/repo@id` form; a valid set returns all fields.
  - `infra/test/zone-access-stack.test.ts` (`Template.fromStack`): the role's name, trust and the three condition keys with exactly the values above; no statement grants `route53:*` or `Resource: '*'` except `GetChange`; the budget's filter and both notifications.
- [ ] **Step 2: Run** `cd infra && npm test` — FAIL.
- [ ] **Step 3: Implement.** `bin/app.ts` builds all three stacks from `readInputs(app.node.getAllContext())` and adds cdk-nag.
- [ ] **Step 4: Run** `npm test && npx cdk synth -c …` with the test inputs — PASS, no unacknowledged cdk-nag errors.
- [ ] **Step 5: Commit** — `Add the CDK app and the record-writer access stack`.

### Task 4: Certificate and records in the hosted zone's account

**Files:**
- Create: `infra/lib/zone-record.ts`, `infra/lib/zone-validated-certificate.ts`, `infra/lambda/certificate/index.mjs`, `infra/lambda/certificate/steps.mjs`, `infra/test/certificate-steps.test.ts`, `infra/test/zone-constructs.test.ts`

**Interfaces:**
- Produces: `ZoneRecord` construct `{ roleArn, hostedZoneId, name, type: 'A' | 'AAAA', aliasDnsName }`: an `AwsCustomResource` that UPSERTs on create and update and DELETEs on delete through `assumedRoleArn`, alias zone `CloudFrontTarget.CLOUDFRONT_ZONE_ID`, physical id `<zone>/<name>/<type>`.
- Produces: `ZoneValidatedCertificate` construct `{ roleArn, hostedZoneId, domainName, alternativeNames: string[] }` with `certificateArn: string`: a provider-framework custom resource (Node 24 runtime, `totalTimeout` 1 hour, the framework's maximum, `queryInterval` 1 minute). `onEvent` Create requests a DNS-validated certificate tagged `managed-by=princetronics-certificate`; Delete deletes it. `isComplete` writes the validation CNAMEs (UPSERT, idempotent) once ACM lists them, and completes when the status is `ISSUED`. ACM permissions: `RequestCertificate` and `AddTagsToCertificate` only with `aws:RequestTag/managed-by` equal to that tag; `DescribeCertificate` and `DeleteCertificate` only on certificates carrying it; `sts:AssumeRole` only on the record-writer role.
- Produces, in `steps.mjs` (pure, no SDK): `validationChanges(certificate): Change[]` — one UPSERT per distinct `ResourceRecord`, `[]` while ACM has not listed them yet; `certificateDone(certificate): boolean` — `true` for `ISSUED`, `false` for `PENDING_VALIDATION`, throws naming the status and `FailureReason` otherwise.
- The validation CNAMEs resolve only where the domain's DNS is served; until the zone serves it, the same records must be added there by hand, within that hour.

- [ ] **Step 1: Write the failing tests:**
  - `infra/test/certificate-steps.test.ts`: three names sharing one validation record give one change; no `ResourceRecord` yet gives `[]`; `ISSUED` → true; `PENDING_VALIDATION` → false; `FAILED` throws with its reason.
  - `infra/test/zone-constructs.test.ts`: the record resource's SDK call names the role, zone, alias zone id and both actions; the certificate's provider has the 1-hour timeout; every ACM statement carries the tag condition.
- [ ] **Step 2: Run** `cd infra && npm test` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** — `Add the zone record and certificate constructs`.

### Task 5: The site stack

**Files:**
- Create: `infra/lib/site-stack.ts`, `infra/lib/web-acl.ts`, `infra/test/site-stack.test.ts`

**Interfaces:**
- Consumes: `Inputs`, `ZoneRecord`, `ZoneValidatedCertificate`, `SiteBudget`, `recordWriterRoleArn`.
- Produces: `SiteStack` with public `bucket: s3.IBucket` and `distribution: cloudfront.Distribution`; public `viewerRequest: cloudfront.Function`; outputs `BucketName`, `DistributionId`, `DistributionDomainName`, `FunctionName`, `CertificateArn` and `PlanSubscriptionStatus` (the subscription's `Status` attribute).
- Bucket: block all public access, `enforceSSL`, S3-managed encryption, `RemovalPolicy.RETAIN`, no website hosting.
- Distribution: `S3BucketOrigin.withOriginAccessControl(bucket)`; the three host names with the certificate (`Certificate.fromCertificateArn`); `REDIRECT_TO_HTTPS`; `CachePolicy.CACHING_OPTIMIZED`; `ResponseHeadersPolicy.SECURITY_HEADERS`; GET/HEAD only; compression on; HTTP/2 and 3; IPv6; `TLS_V1_2_2021`; no default root object; error responses 403 and 404 → `/404.html` with status 404 and a 1-day TTL; one viewer-request `cloudfront.Function` (`FunctionRuntime.JS_2_0`, code from `functionCode`); exactly one cache behaviour; `webAclId` set to the web ACL's ARN; `RemovalPolicy.RETAIN`.
- `WebAcl` (`wafv2.CfnWebACL`, scope `CLOUDFRONT`, default allow, `RemovalPolicy.RETAIN`) with 4 rules: `RateLimit` (rate-based, 1,000 requests per 5 minutes per IP, block; the live URL check stays under it, Task 7), then the managed groups `AWSManagedRulesAmazonIpReputationList`, `AWSManagedRulesCommonRuleSet`, `AWSManagedRulesKnownBadInputsRuleSet`.
- `pricingplanmanager.CfnSubscription`: `planFamily: 'CloudFront'`, `planTier: 'FREE'`, `resourceArns: [distribution ARN, web ACL ARN]`.
- Six `ZoneRecord`s: A and AAAA for each host name, aliased to the distribution. A `SiteBudget`.
- No CDK dependency on `PrinceTronics-ZoneAccess`: the record-writer role's ARN is built from `zoneAccount`, so deploying the site never deploys that stack.

- [ ] **Step 1: Write the failing tests** in `infra/test/site-stack.test.ts`: the bucket's public-access block and retain policy; the distribution's three aliases, its single behaviour, the managed cache and headers policy ids, both error responses with `ErrorCachingMinTTL: 86400`, the function association on `viewer-request` with runtime `cloudfront-js-2.0`; the distribution's `WebACLId` resolves to the web ACL; both carry `DeletionPolicy: Retain`; the web ACL has exactly 4 rules with the names above and no `RuleGroupReferenceStatement`; the subscription's family, tier and two ARNs; six records; a missing `functionCode` file fails synth naming the path.
- [ ] **Step 2: Run** `cd infra && npm test` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npx cdk synth …` — PASS, cdk-nag clean or acknowledged with reasons (no access logs at launch, per the spec).
- [ ] **Step 5: Commit** — `Add the site stack`.

### Task 6: CI roles, and CI for the infrastructure

**Files:**
- Create: `infra/lib/ci-stack.ts`, `infra/test/ci-stack.test.ts`
- Modify: `.github/workflows/ci.yml` (an `infra` job), `AGENTS.md` (the `infra/` commands and the context inputs), the spec's *AWS access from CI* (`sub` pinned to `main` instead of an environment: GitHub Free offers no environments to private repositories; the maintainer confirms this before the task starts)

**Interfaces:**
- Consumes: `SiteStack.bucket`, `SiteStack.viewerRequest`, `Inputs.contentRepo`, `Inputs.oidcProviderArn`.
- `CiStack`: the GitHub OIDC provider imported from `oidcProviderArn` when given, else created (`token.actions.githubusercontent.com`, client id `sts.amazonaws.com`). Two roles, both trusting it with `StringEquals` on `token.actions.githubusercontent.com:aud` = `sts.amazonaws.com` and `token.actions.githubusercontent.com:sub` = `repo:<contentRepo>:ref:refs/heads/main`:
  - `PrinceTronics-Deploy`: `s3:ListBucket` on the bucket, `s3:PutObject` and `s3:DeleteObject` on its objects, and `cloudfront:GetFunction` on the function (so a deploy can tell when the function is out of date), nothing else.
  - `PrinceTronics-Infra`: `sts:AssumeRole` on `arn:aws:iam::<workloadAccount>:role/cdk-*`, nothing else.
- CI job `infra`: `npm ci` and `npm run build:edge` at the root, then in `infra/` `npm ci`, `npm test`, `npx tsc --noEmit` and `npx cdk synth` with the test inputs and that `functionCode`.

- [ ] **Step 1: Write the failing tests** in `infra/test/ci-stack.test.ts`: both trust policies' exact `sub` and `aud`, with no `StringLike`; the deploy role's four actions and three resources, and no other statement; the infra role's single statement; with `oidcProviderArn` set, no provider resource is created.
- [ ] **Step 2: Run** `cd infra && npm test` — FAIL.
- [ ] **Step 3: Implement**, and the CI job.
- [ ] **Step 4: Run** `npm test` (root and `infra`), `npx cdk synth` with test inputs, and `actionlint` if installed — PASS.
- [ ] **Step 5: Commit** — `Add the CI roles and test the infrastructure in CI`.

### Task 7: The URL check

**Files:**
- Create: `edge/url-check.ts`, `test/edge/url-check.test.ts`, `test-dist/url-check.test.ts`, `fixtures/inventory.json`
- Modify: `package.json` (script `url-check`: `tsx edge/url-check.ts`), `AGENTS.md` (the command)

**Interfaces:**
- Consumes: `loadFunction` and `requestEvent` (Task 1, moved from `test/edge/` to `edge/simulate.ts` so the tool can use them), the generated function (Task 2).
- Produces: inventory format, a JSON array of `{ url: string, gone?: true }` with absolute URLs; `gone` marks a URL whose 410 is expected.
- Produces: `type Hop = { status: number, location?: string }`, `type Step = (url: string) => Promise<Hop>`, and `checkUrl(entry, step: Step): Promise<{ ok: boolean, hops: string[] }>`: follows at most 2 redirects; `ok` when the last status is 200, or 410 with `gone`.
- Produces: `buildStep(functionCode: string, distDir: string): Step`: `http://` → 301 to the `https://` form (CloudFront's redirect); otherwise runs the function on the URL's host, path and query; a returned response gives its status and `location`; a returned request gives 200 if `distDir` + its uri is a file, else 404.
- Produces: `liveStep(connectTo?: string, intervalMs = 400): Step`, waiting `intervalMs` between requests so a full run stays under the web ACL's rate rule (Task 5), running `curl` through `execFile` (no shell) with `curlArgs(url, connectTo?)` = `['-s', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', '--max-redirs', '0']`, plus `['--connect-to', '::' + connectTo + ':']` when given (curl's `HOST1:PORT1:HOST2:PORT2`, empty parts meaning any host or the original port), then the URL; requests are sequential.
- CLI: `npm run url-check -- --inventory <file> (--dist <dir> --function <file> | --live [--connect-to <host>])`; prints each failure with its hops and exits 1 if any fail.

- [ ] **Step 1: Write the failing tests:**
  - `test/edge/url-check.test.ts` (with a fake `Step`): 200 directly passes; two redirects then 200 passes; three redirects fail; 410 passes only with `gone`; 404 fails; `curlArgs` with and without `connectTo` equals the arrays above; `liveStep` with a fake clock waits 400 ms between two calls.
  - `test-dist/url-check.test.ts`: `buildStep` over the fixture build and `fixtures/inventory.json` (an old slug with and without slash, its `http://` apex form, an upload on `www-static`, `/feed/`, `/xmlrpc.php` with `gone`, `/tags/arduino/`) passes every entry; `http://princetronics.com/xmlrpc.php` takes https then 410; a missing upload fails with 404.
- [ ] **Step 2: Run** `npm test && npm run test:dist` — FAIL.
- [ ] **Step 3: Implement.** `test:dist` runs `build:edge` before the dist tests.
- [ ] **Step 4: Run** `npm test && npm run test:dist && npm run url-check -- --inventory fixtures/inventory.json --dist dist --function edge-dist/viewer-request.js` — PASS, exit 0.
- [ ] **Step 5: Commit** — `Add the URL check`.

### Finish

- [ ] Run `cfn-lint` on `infra/cdk.out/*.template.json`; fix what it finds in the task that owns it.
- [ ] Whole-branch review, including a security-auditor review of `infra/` (IAM, trust policies, bucket access), then the PR.
- [ ] Spec reconciliation: *Hosting and cut-over* and *Repositories, preview and deploy* against what was built; *Left to the builder* records CDK as the infrastructure tool; *Repositories, preview and deploy* says the function also changes when the set of published tags does, that the deploy job also compares the deployed function with the build's (its "syncs the artifact to S3 and nothing else"), and that the deploy role may read the function (its "nothing else"); bump `verified`.
