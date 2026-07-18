# @krynox/captcha (Node)

Official server-side verification SDK for **Krynox Captcha**.

```bash
npm install @krynox/captcha
```

```ts
import { KrynoxCaptcha } from '@krynox/captcha';

const krynox = new KrynoxCaptcha(process.env.KRYNOX_SECRET!);

// in your form handler
const result = await krynox.verify(req.body['krynox-captcha'], req.ip);
if (!result.success) {
  return res.status(400).json({ error: 'Captcha verification failed', codes: result.errorCodes });
}
// optional: privacy-preserving risk hint + explainable reason codes
if (result.risk === 'high' || result.reasons?.includes('tor-exit')) {
  // add friction (email verification, manual review, …)
}
```

### Reasons, agents & attested humans

- `result.reasons` — stable, machine-readable codes explaining the score
  (e.g. `'tor-exit'`, `'elevated-request-rate'`, `'datacenter-asn'`); empty on a clean verify.
- `result.agent` — set when a **verified AI agent** (Web Bot Auth) was forwarded:
  `{ verified, name?, allowlisted? }`. Allowlist good bots instead of blocking them.
- `result.human` — set when a **device-attested human** (Private Access Token) was forwarded:
  `{ attested, method?, issuer? }`.

```ts
if (result.agent?.verified && result.agent.allowlisted) return next(); // trusted crawler
if (result.human?.attested) return next();                            // proven human, skip friction
```

### Content classification (spam/abuse)

Score free-text or form fields with the on-device classifier — no extra round-trip for the visitor.

```ts
const c = await krynox.classify({ text: comment, ip: req.ip });
if (c.blocked || c.classification === 'BAD') return res.status(400).send('rejected');
```

### Reliability

Transient failures (network, `429`, `5xx`) are retried automatically (default **2** retries, exponential
backoff). Because a captcha token is single-use, a retried `verify()` carries an **idempotency key** so a
retry never fails the now-consumed token — the server replays the first outcome. Tune with
`{ retries }`, or pass your own `{ idempotencyKey }` to `verify()`.

### Feedback (false-positive correction)

Report detection quality back to Krynox. Flagging an auto-blocked IP as `human`
immediately un-blocks it server-side — a closed feedback loop that tunes detection.

```ts
// a real user got blocked by mistake → un-block their IP
const { ok, corrected } = await krynox.feedback('human', { ip: req.ip, note: 'support ticket #1234' });

// confirm a bot you let through
await krynox.feedback('bot', { ip: suspiciousIp });
```

### API
- `new KrynoxCaptcha(secret, { endpoint?, timeoutMs?, retries? })`
- `.verify(response, remoteip?, { idempotencyKey? }) → Promise<KrynoxResult>`
- `.classify({ text?, fields?, ip? }) → Promise<KrynoxClassification>`
- `.feedback(label, { ip?, note? }) → Promise<KrynoxFeedback>` — `label` is `'human' | 'bot'`
- `verify(secret, response, options?)` — functional shorthand
- `KrynoxErrorCode` — typed constants for `errorCodes` (compare, don't stringly-type)

`KrynoxResult`: `{ success, score?, risk?, hostname?, challengeTs?, errorCodes?, reasons?, agent?, human? }`
`KrynoxClassification`: `{ ok, score?, classification?, reasons?, blocked?, errorCodes? }`

Self-hosting? Pass `{ endpoint: 'https://captcha.your-domain/siteverify' }` — `feedback`/`classify`
endpoints are derived from it.
