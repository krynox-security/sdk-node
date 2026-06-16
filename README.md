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
// optional: privacy-preserving risk hint
if (result.risk === 'high') {
  // add friction (email verification, manual review, …)
}
```

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
- `new KrynoxCaptcha(secret, { endpoint?, timeoutMs? })`
- `.verify(response, remoteip?) → Promise<KrynoxResult>`
- `.feedback(label, { ip?, note? }) → Promise<{ ok, corrected? }>` — `label` is `'human' | 'bot'`
- `verify(secret, response, options?)` — functional shorthand

`KrynoxResult`: `{ success, score?, risk?, hostname?, challengeTs?, errorCodes? }`

Self-hosting? Pass `{ endpoint: 'https://captcha.your-domain/siteverify' }`.
