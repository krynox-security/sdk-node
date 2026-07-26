# Changelog

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-22

First release.

### Added

- `verify()` — validate a solved token against `POST /siteverify`. Returns
  `success`, `score`, `risk`, `hostname`, `challengeTs` and the stable
  `reasons` codes that explain the score.
- `classify()` — score submitted content for spam and abuse via `POST /classify`.
- `feedback()` — report a verification as `human` or `bot` to correct detection.
- `agent` on the result — a cryptographically verified AI agent (Web Bot Auth),
  when the site's Agent policy allows it through.
- `human` on the result — an attested real human, from a device Private Access
  Token or a WebAuthn passkey.
- Automatic retries on transient failures (network, `429`, `5xx`), each carrying
  a per-verify idempotency key so a retried single-use token replays the first
  outcome instead of failing.
- Configurable API host for self-hosted deployments. `classify`/`feedback` are derived from
  the verify endpoint by one rule shared with the other six SDKs: an `/siteverify` suffix
  (trailing slash ignored) is replaced, and any other endpoint is treated as a base URL the
  path is appended to.
- A `user-agent` header on every request (`verify`, `classify`, `feedback`), formatted
  `krynox-captcha-node/<version>` and built from the exported `VERSION` constant so it can
  never drift from `package.json` — without it, server-side attribution of SDK and version
  is impossible.
- `errorCodes` and `reasons` on `KrynoxResult` are always arrays (empty when the API omits
  them), matching the other six SDKs — no optional chaining needed to read them.
- Ships ESM and TypeScript types (ESM-only package).

### Notes

- The seven SDKs are held to one shared response contract, enforced by a
  byte-identical golden fixture and a contract test in every language.

[0.1.0]: https://github.com/krynox-security/sdk-node/releases/tag/v0.1.0
