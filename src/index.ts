/**
 * Krynox Captcha — official server-side verification SDK (Node/TypeScript).
 *
 * Verify a widget solution on your backend with a single call:
 *
 *   import { KrynoxCaptcha } from '@krynox/captcha';
 *   const krynox = new KrynoxCaptcha(process.env.KRYNOX_SECRET!);
 *   const result = await krynox.verify(token);
 *   if (!result.success) return res.status(400).send('captcha failed');
 *   if (result.risk === 'high') { ... extra friction ... }
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface KrynoxResult {
  /** Whether the solution is valid. */
  success: boolean;
  /** Privacy-preserving risk hint, 0 (likely bot) … 1 (likely human). */
  score?: number;
  /** Bucketed risk derived from `score`. */
  risk?: RiskLevel;
  /** Site name the key belongs to. */
  hostname?: string;
  /** ISO timestamp the challenge was verified. */
  challengeTs?: string;
  /** Machine-readable failure reasons (e.g. `invalid-input-response`). */
  errorCodes?: string[];
}

export interface KrynoxOptions {
  /** Override the verify endpoint (for self-hosted / staging). */
  endpoint?: string;
  /** Request timeout in milliseconds (default 5000). */
  timeoutMs?: number;
}

const DEFAULT_ENDPOINT = 'https://api.krynox.id/siteverify';

export class KrynoxCaptcha {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly secret: string,
    options: KrynoxOptions = {},
  ) {
    if (!secret) throw new Error('KrynoxCaptcha: secret key is required');
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /** Verify a captcha response token from the widget. */
  async verify(response: string, remoteip?: string): Promise<KrynoxResult> {
    if (!response) return { success: false, errorCodes: ['missing-input-response'] };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: this.secret, response, remoteip }),
        signal: controller.signal,
      });
      const data = (await res.json()) as Record<string, unknown>;
      return {
        success: data.success === true,
        score: typeof data.score === 'number' ? data.score : undefined,
        risk: data.risk as RiskLevel | undefined,
        hostname: typeof data.hostname === 'string' ? data.hostname : undefined,
        challengeTs: typeof data.challenge_ts === 'string' ? data.challenge_ts : undefined,
        errorCodes: Array.isArray(data['error-codes']) ? (data['error-codes'] as string[]) : undefined,
      };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return { success: false, errorCodes: [aborted ? 'timeout' : 'request-failed'] };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Report detection-quality feedback. Flagging an auto-blocked IP as 'human'
   * un-blocks it server-side (false-positive correction).
   */
  async feedback(label: 'human' | 'bot', opts: { ip?: string; note?: string } = {}): Promise<{ ok: boolean; corrected?: boolean }> {
    const endpoint = this.endpoint.replace(/\/siteverify$/, '/feedback');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: this.secret, label, ip: opts.ip, note: opts.note }),
      });
      const data = (await res.json()) as { ok?: boolean; corrected?: boolean };
      return { ok: data.ok === true, corrected: data.corrected };
    } catch {
      return { ok: false };
    }
  }
}

/** Functional shorthand for a one-off verification. */
export async function verify(secret: string, response: string, options?: KrynoxOptions): Promise<KrynoxResult> {
  return new KrynoxCaptcha(secret, options).verify(response);
}
