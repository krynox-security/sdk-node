# Graph Report - sdk-node  (2026-07-30)

## Corpus Check
- 8 files · ~3,889 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 88 nodes · 98 edges · 12 communities (10 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `535a5d8d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- compilerOptions
- package.json
- KrynoxCaptcha
- keywords
- integration.test.ts
- devDependencies
- @krynox/captcha (Node)
- scripts
- [0.1.0] - 2026-07-22
- .verify
- .post

## God Nodes (most connected - your core abstractions)
1. `KrynoxCaptcha` - 9 edges
2. `compilerOptions` - 9 edges
3. `@krynox/captcha (Node)` - 7 edges
4. `keywords` - 6 edges
5. `isAbort()` - 4 edges
6. `scripts` - 3 edges
7. `repository` - 3 edges
8. `lib` - 3 edges
9. `Changelog` - 3 edges
10. `[0.1.0] - 2026-07-22` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (12 total, 2 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.20
Nodes (8): KrynoxAgent, KrynoxClassification, KrynoxErrorCode, KrynoxFeedback, KrynoxHuman, KrynoxOptions, KrynoxResult, RiskLevel

### Community 1 - "compilerOptions"
Cohesion: 0.14
Nodes (13): DOM, ES2022, src, compilerOptions, declaration, lib, module, moduleResolution (+5 more)

### Community 2 - "package.json"
Cohesion: 0.10
Nodes (19): description, engines, node, exports, files, homepage, license, main (+11 more)

### Community 4 - "keywords"
Cohesion: 0.33
Nodes (6): keywords, bot, captcha, krynox, proof-of-work, verification

### Community 5 - "integration.test.ts"
Cohesion: 0.40
Nodes (3): allBodies, Hit, Mock

### Community 6 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, typescript, typescript

### Community 7 - "@krynox/captcha (Node)"
Cohesion: 0.25
Nodes (7): API, Content classification (spam/abuse), Feedback (false-positive correction), @krynox/captcha (Node), Reasons, agents & attested humans, Reliability, Self-hosting

### Community 8 - "scripts"
Cohesion: 0.67
Nodes (3): scripts, build, test

### Community 9 - "[0.1.0] - 2026-07-22"
Cohesion: 0.33
Nodes (5): [0.1.0] - 2026-07-22, Added, Changelog, Notes, [Unreleased]

### Community 10 - ".verify"
Cohesion: 0.50
Nodes (3): isAbort(), parseResult(), randomKey()

## Knowledge Gaps
- **53 isolated node(s):** `name`, `version`, `description`, `type`, `main` (+48 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `KrynoxCaptcha` connect `KrynoxCaptcha` to `index.ts`, `.verify`, `.post`, `integration.test.ts`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `keywords` connect `keywords` to `package.json`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `scripts` connect `scripts` to `package.json`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _53 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._