/**
 * Real-HTTP integration tests: a local Bun.serve mock data plane drives the actual
 * client transport (fetch, retries, backoff, idempotency key, AbortController timeout).
 */
import { afterEach, expect, test } from 'bun:test';
import pkg from '../package.json';
import golden from './fixtures/golden-v1.json';
import { KrynoxCaptcha, USER_AGENT, VERSION } from '../src/index';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Hit {
  path: string;
  body: Record<string, unknown>;
  userAgent: string | null;
}

interface Mock {
  /** `http://127.0.0.1:<port>` — build any endpoint shape from this. */
  origin: string;
  endpoint: string;
  hits: Hit[];
  stop: () => void;
}

/** Every request body seen by any mock server in this file (for the honeypot sweep). */
const allBodies: Record<string, unknown>[] = [];

let active: Mock | undefined;
afterEach(() => {
  active?.stop();
  active = undefined;
});

function serve(handler: (hit: Hit, count: number) => Response | Promise<Response>): Mock {
  const hits: Hit[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const body = (await req.json()) as Record<string, unknown>;
      const hit: Hit = {
        path: new URL(req.url).pathname,
        body,
        userAgent: req.headers.get('user-agent'),
      };
      hits.push(hit);
      allBodies.push(body);
      return handler(hit, hits.length);
    },
  });
  const mock: Mock = {
    origin: `http://127.0.0.1:${server.port}`,
    endpoint: `http://127.0.0.1:${server.port}/siteverify`,
    hits,
    stop: () => server.stop(true),
  };
  active = mock;
  return mock;
}

test('happy path: exact request body + full golden-fixture mapping', async () => {
  const mock = serve(() => Response.json(golden.verify));
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  const result = await client.verify('tok_123', '203.0.113.9');

  expect(mock.hits).toHaveLength(1);
  expect(mock.hits[0]!.path).toBe('/siteverify');
  const body = mock.hits[0]!.body;
  expect(Object.keys(body).sort()).toEqual(['idempotency_key', 'remoteip', 'response', 'secret']);
  expect(body.secret).toBe('kcps_test');
  expect(body.response).toBe('tok_123');
  expect(body.remoteip).toBe('203.0.113.9');
  expect(body.idempotency_key).toMatch(UUID_RE);

  expect(result.success).toBe(true);
  expect(result.score).toBe(0.91);
  expect(result.risk).toBe('low');
  expect(result.hostname).toBe('app.example.com');
  expect(result.challengeTs).toBe('2026-07-19T00:00:00.000Z');
  expect(result.action).toBe('signup');
  expect(result.cdata).toBe('order-42');
  expect(result.reasons).toEqual(['verified-agent']);
  expect(result.errorCodes).toEqual([]); // absent from the response → empty array, never undefined
  expect(result.agent).toEqual({ verified: true, name: 'ExampleBot', allowlisted: true });
  expect(result.human).toEqual({ attested: true, method: 'passkey', issuer: undefined });
});

test('drops the remoteip key entirely when absent', async () => {
  const mock = serve(() => Response.json(golden.verify));
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  await client.verify('tok_123');

  expect(Object.keys(mock.hits[0]!.body).sort()).toEqual(['idempotency_key', 'response', 'secret']);
});

test('retries once on 500, reusing the SAME idempotency_key', async () => {
  const mock = serve((_hit, count) =>
    count === 1 ? Response.json({ success: false }, { status: 500 }) : Response.json(golden.verify),
  );
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  const result = await client.verify('tok_retry');

  expect(result.success).toBe(true);
  expect(mock.hits).toHaveLength(2);
  const [first, second] = mock.hits;
  expect(first!.body.idempotency_key).toMatch(UUID_RE);
  expect(second!.body.idempotency_key).toBe(first!.body.idempotency_key);
});

test('retries once on 429, reusing the SAME idempotency_key', async () => {
  const mock = serve((_hit, count) =>
    count === 1 ? Response.json({ 'error-codes': ['rate-limited'] }, { status: 429 }) : Response.json(golden.verify),
  );
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  const result = await client.verify('tok_429');

  expect(result.success).toBe(true);
  expect(mock.hits).toHaveLength(2);
  expect(mock.hits[1]!.body.idempotency_key).toBe(mock.hits[0]!.body.idempotency_key);
});

test('exhausted retries (always 500, non-JSON body) → success:false request-failed', async () => {
  const mock = serve(() => new Response('upstream exploded', { status: 500 }));
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  const result = await client.verify('tok_dead');

  expect(mock.hits).toHaveLength(3); // initial attempt + 2 retries
  expect(result).toEqual({ success: false, errorCodes: ['request-failed'], reasons: [] });
});

test('timeout: slow handler + tiny timeoutMs → success:false timeout, no retry', async () => {
  const mock = serve(async () => {
    await new Promise((r) => setTimeout(r, 1000));
    return Response.json(golden.verify);
  });
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint, timeoutMs: 50 });

  const result = await client.verify('tok_slow');

  expect(result).toEqual({ success: false, errorCodes: ['timeout'], reasons: [] });
  expect(mock.hits).toHaveLength(1); // aborts are not retried, as-is
});

test('failure response parsing: invalid-input-response', async () => {
  const mock = serve(() => Response.json(golden.error));
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  const result = await client.verify('tok_bad');

  expect(result.success).toBe(false);
  expect(result.errorCodes).toEqual(['invalid-input-response']);
  expect(result.reasons).toEqual([]); // absent from the response → empty array, never undefined
});

test('collections default to [] on a response that omits every field', async () => {
  const mock = serve(() => Response.json({ success: true }));
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  const result = await client.verify('tok_bare');

  expect(result.errorCodes).toEqual([]);
  expect(result.reasons).toEqual([]);
  // Callers can index without optional chaining.
  expect(result.reasons.includes('tor-exit')).toBe(false);
});

test('classify() and feedback() hit the derived endpoints', async () => {
  const mock = serve((hit) => {
    if (hit.path === '/classify') return Response.json(golden.classify);
    if (hit.path === '/feedback') return Response.json({ ok: true, corrected: true });
    return Response.json(golden.verify);
  });
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  const classification = await client.classify({ text: 'buy now!!', ip: '203.0.113.9' });
  expect(mock.hits[0]!.path).toBe('/classify');
  expect(Object.keys(mock.hits[0]!.body).sort()).toEqual(['ip', 'secret', 'text']); // fields dropped when absent
  expect(classification).toEqual({
    ok: true,
    score: 0.55,
    classification: 'NEUTRAL',
    reasons: ['risky-ip'],
    blocked: false,
    errorCodes: [],
  });

  const fb = await client.feedback('human', { ip: '203.0.113.9' });
  expect(mock.hits[1]!.path).toBe('/feedback');
  expect(Object.keys(mock.hits[1]!.body).sort()).toEqual(['ip', 'label', 'secret']); // note dropped when absent
  expect(mock.hits[1]!.body.label).toBe('human');
  expect(fb).toEqual({ ok: true, corrected: true });
});

test('sends the exact SDK user-agent on verify, classify and feedback', async () => {
  const mock = serve((hit) => {
    if (hit.path === '/classify') return Response.json(golden.classify);
    if (hit.path === '/feedback') return Response.json({ ok: true });
    return Response.json(golden.verify);
  });
  const client = new KrynoxCaptcha('kcps_test', { endpoint: mock.endpoint });

  await client.verify('tok_ua');
  await client.classify({ text: 'hello' });
  await client.feedback('human', { ip: '203.0.113.9' });

  expect(mock.hits.map((h) => h.path)).toEqual(['/siteverify', '/classify', '/feedback']);
  for (const hit of mock.hits) {
    expect(hit.userAgent).toBe('krynox-captcha-node/0.1.0');
  }
});

test('the user-agent is built from VERSION, which tracks package.json', () => {
  expect(VERSION).toBe(pkg.version);
  expect(USER_AGENT).toBe(`krynox-captcha-node/${VERSION}`);
});

test('a /siteverify endpoint derives sibling /classify and /feedback paths', async () => {
  const mock = serve(() => Response.json({ ok: true }));
  // Trailing slash must not defeat the suffix match.
  const client = new KrynoxCaptcha('kcps_test', { endpoint: `${mock.origin}/siteverify/` });

  await client.classify({ text: 'hi' });
  await client.feedback('bot');

  expect(mock.hits.map((h) => h.path)).toEqual(['/classify', '/feedback']);
});

test('a non-/siteverify endpoint is treated as a base URL and appended to', async () => {
  const mock = serve(() => Response.json({ ok: true }));
  const client = new KrynoxCaptcha('kcps_test', { endpoint: `${mock.origin}/captcha/api/` });

  await client.classify({ text: 'hi' });
  await client.feedback('bot');

  // Never POSTs a classify payload at the verify endpoint.
  expect(mock.hits.map((h) => h.path)).toEqual(['/captcha/api/classify', '/captcha/api/feedback']);
});

test('never sends a honeypot or sitekey key in any request body', () => {
  expect(allBodies.length).toBeGreaterThan(0);
  for (const body of allBodies) {
    expect(body).not.toContainKey('honeypot');
    expect(body).not.toContainKey('sitekey');
  }
});
