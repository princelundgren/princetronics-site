---
title: Pin your CI actions to commit SHAs
summary: A tag can move under you; a commit SHA cannot.
publishDate: 2026-02-01
tags: [CI, Security]
cover: ./pin-your-ci-actions/cover.jpg
coverAlt: A padlock drawn on a whiteboard
why: A compromised action runs with your token.
how: Reference each action by its full commit SHA, with the version in a comment.
result: Updates become deliberate, reviewed changes.
---

## The risk

A tag such as `v4` is a pointer the action's owner can move.

## The fix

```yaml
- uses: actions/checkout@0000000000000000000000000000000000000000 # v4.0.0
```
