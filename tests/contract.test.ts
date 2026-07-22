import { afterEach, expect, test } from 'bun:test';
import golden from './fixtures/golden-v1.json';
import { KrynoxCaptcha } from '../src/index';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('maps the golden verification and classifier contracts', async () => {
  const responses = [golden.verify, golden.classify];
  globalThis.fetch = (async () => Response.json(responses.shift()!)) as typeof fetch;
  const client = new KrynoxCaptcha('kcps_test', { retries: 0 });
  const verify = await client.verify('token');
  expect(verify).toMatchObject({ success: true, challengeTs: golden.verify.challenge_ts, action: 'signup', cdata: 'order-42' });
  const classify = await client.classify({ text: 'hello', ip: '203.0.113.5' });
  expect(classify.classification).toBe('NEUTRAL');
  expect(classify.blocked).toBeFalse();
});
