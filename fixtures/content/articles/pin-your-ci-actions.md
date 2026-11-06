---
title: Pin your CI actions to commit SHAs
summary: A tag can move under you; a commit SHA cannot.
publishDate: 2026-02-01
tags: [CI, Security]
cover: ./pin-your-ci-actions/cover.jpg
coverAlt: A padlock drawn on a whiteboard
---

## The risk

A tag such as `v4` is a pointer the action's owner can move.

## The fix

```yaml
- uses: actions/checkout@0000000000000000000000000000000000000000 # v4.0.0
```
