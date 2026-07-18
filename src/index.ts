/**
 * Krynox Captcha — official server-side SDK (Node/TypeScript).
 *
 *   import { KrynoxCaptcha } from '@krynox/captcha';
 *   const krynox = new KrynoxCaptcha(process.env.KRYNOX_SECRET!);
 *   const r = await krynox.verify(token, req.ip);
 *   if (!r.success) return res.status(400).send('captcha failed');
 *   if (r.risk === 'high' || r.reasons?.includes('tor-exit')) { ...friction... }
 */

export type RiskLevel = 'low' | 'medium' | 'high';

/** A cryptographically verified AI agent (Web Bot Auth), when the integrator forwards one. */
export interface KrynoxAgent {
  verified: boolean;
  name?: string;
  allowlisted?: boolean;
}

/** A device-attested real human (Private Access Token), when the integrator forwards one. */
export interface KrynoxHuman {
  attested: boolean;
  method?: string;
  issuer?: string;
}

export interface KrynoxResult {
  /** Whether the solution is valid, unused, and not blocked. */
  success: boolean;
  /** Privacy-preserving risk hint, 0 (likely bot) … 1 (likely human). */
  score?: number;
  /** Bucketed risk derived from `score`. */
  risk?: RiskLevel;
  /** Site name / primary domain the key belongs to. */
  hostname?: string;
  /** ISO timestamp the challenge was verified. */
  challengeTs?: string;
  /** Machine-readable failure reasons (see {@link KrynoxErrorCode}). */
  errorCodes?: string[];
  /** Stable reason codes explaining the score — empty on a clean verification. */
  reasons?: string[];
  /** Verified AI agent identity, when forwarded. */
  agent?: KrynoxAgent;
  /** Attested-human identity, when forwarded. */
  human?: KrynoxHuman;
}

/** Content-classifier result from {@link KrynoxCaptcha.classify}. */
export interface KrynoxClassification {
  ok: boolean;
  score?: number;
  classification?: 'GOOD' | 'SUSPECT' | 'BAD' | string;
  reasons?: string[];
  blocked?: boolean;
  errorCodes?: string[];
}

/** Feedback result from {@link KrynoxCaptcha.feedback}. */
export interface KrynoxFeedback {
  ok: boolean;
  corrected?: boolean;
}

/** Machine-readable error codes returned by the API + SDK transport (compare, don't stringly-type). */
export const KrynoxErrorCode = {
  MissingSecret: 'missing-input-secret',
  MissingResponse: 'missing-input-response',
  InvalidResponse: 'invalid-input-response',
  InvalidSecret: 'invalid-input-secret',
  TimeoutOrDuplicate: 'timeout-or-duplicate',
  IpBlocked: 'ip-blocked',
  RateLimited: 'rate-limited',
  /** SDK-side: the request timed out. */
  Timeout: 'timeout',
  /** SDK-side: the request failed to reach the API. */
  RequestFailed: 'request-failed',
} as const;
export type KrynoxErrorCode = (typeof KrynoxErrorCode)[keyof typeof KrynoxErrorCode];

export interface KrynoxOptions {
  /** Override the verify endpoint (feedback/classify are derived from it). */
  endpoint?: string;
  /** Per-attempt request timeout in ms (default 5000). */
  timeoutMs?: number;
  /** Transient-failure (network / 429 / 5xx) retries (default 2). */
  retries?: number;
}

const DEFAULT_ENDPOINT = 'https://api.krynox.net/siteverify';

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError';
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number): number => Math.min(1000, 100 * 2 ** attempt);
const randomKey = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `k_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

function parseResult(data: Record<string, unknown>): KrynoxResult {
  const agent = data.agent as Record<string, unknown> | undefined;
  const human = data.human as Record<string, unknown> | undefined;
  return {
    success: data.success === true,
    score: typeof data.score === 'number' ? data.score : undefined,
    risk: data.risk as RiskLevel | undefined,
    hostname: typeof data.hostname === 'string' ? data.hostname : undefined,
    challengeTs: typeof data.challenge_ts === 'string' ? data.challenge_ts : undefined,
    errorCodes: Array.isArray(data['error-codes']) ? (data['error-codes'] as string[]) : undefined,
    reasons: Array.isArray(data.reasons) ? (data.reasons as string[]) : undefined,
    agent:
      agent && typeof agent === 'object'
        ? { verified: agent.verified === true, name: typeof agent.name === 'string' ? agent.name : undefined, allowlisted: agent.allowlisted === true }
        : undefined,
    human:
      human && typeof human === 'object'
        ? { attested: human.attested === true, method: typeof human.method === 'string' ? human.method : undefined, issuer: typeof human.issuer === 'string' ? human.issuer : undefined }
        : undefined,
  };
}

export class KrynoxCaptcha {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(
    private readonly secret: string,
    options: KrynoxOptions = {},
  ) {
    if (!secret) throw new Error('KrynoxCaptcha: secret key is required');
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.retries = options.retries ?? 2;
  }

  private derive(path: string): string {
    return this.endpoint.replace(/\/siteverify$/, path);
  }

  /** POST JSON with a per-attempt timeout, retrying transient failures (network / 429 / 5xx). */
  private async post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if ((res.status === 429 || res.status >= 500) && attempt < this.retries) {
          lastErr = new Error(`http ${res.status}`);
          await delay(backoff(attempt));
          continue;
        }
        return (await res.json()) as Record<string, unknown>;
      } catch (e) {
        lastErr = e;
        if (isAbort(e) || attempt >= this.retries) throw e;
        await delay(backoff(attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr ?? new Error('request-failed');
  }

  /** Verify a captcha response token from the widget. */
  async verify(response: string, remoteip?: string, opts: { idempotencyKey?: string } = {}): Promise<KrynoxResult> {
    if (!response) return { success: false, errorCodes: [KrynoxErrorCode.MissingResponse] };
    // A token is single-use, so a retried verify must carry an idempotency key — the server then
    // returns the first outcome instead of failing the now-consumed token.
    const idempotency_key = opts.idempotencyKey ?? (this.retries > 0 ? randomKey() : undefined);
    try {
      return parseResult(await this.post(this.endpoint, { secret: this.secret, response, remoteip, idempotency_key }));
    } catch (e) {
      return { success: false, errorCodes: [isAbort(e) ? KrynoxErrorCode.Timeout : KrynoxErrorCode.RequestFailed] };
    }
  }

  /**
   * Report detection-quality feedback. Flagging an auto-blocked IP as 'human' un-blocks it
   * server-side (false-positive correction).
   */
  async feedback(label: 'human' | 'bot', opts: { ip?: string; note?: string } = {}): Promise<KrynoxFeedback> {
    try {
      const data = await this.post(this.derive('/feedback'), { secret: this.secret, label, ip: opts.ip, note: opts.note });
      return { ok: data.ok === true, corrected: data.corrected === true };
    } catch {
      return { ok: false };
    }
  }

  /** Score submitted content (a `text` string or a `fields` object) for spam/abuse. */
  async classify(input: { text?: string; fields?: Record<string, unknown>; ip?: string }): Promise<KrynoxClassification> {
    try {
      const data = await this.post(this.derive('/classify'), { secret: this.secret, text: input.text, fields: input.fields, ip: input.ip });
      return {
        ok: data.ok === true,
        score: typeof data.score === 'number' ? data.score : undefined,
        classification: typeof data.classification === 'string' ? data.classification : undefined,
        reasons: Array.isArray(data.reasons) ? (data.reasons as string[]) : undefined,
        blocked: data.blocked === true,
        errorCodes: Array.isArray(data['error-codes']) ? (data['error-codes'] as string[]) : undefined,
      };
    } catch (e) {
      return { ok: false, errorCodes: [isAbort(e) ? KrynoxErrorCode.Timeout : KrynoxErrorCode.RequestFailed] };
    }
  }
}

/** Functional shorthand for a one-off verification. */
export async function verify(secret: string, response: string, options?: KrynoxOptions): Promise<KrynoxResult> {
  return new KrynoxCaptcha(secret, options).verify(response);
}
