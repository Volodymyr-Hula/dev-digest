/**
 * http adapter — fetch one remote file (skill import from a URL).
 *
 * Outbound HTTP to a user-supplied URL is an SSRF surface, so every hop is
 * checked: `https:` only, no credentials or custom ports, the host must not
 * resolve to a loopback / private / link-local address, redirects are followed
 * manually (max 3) and re-checked, the body is capped and the request times out.
 * Nothing fetched is executed; callers only parse it.
 *
 * Swappable in tests via ContainerOverrides.fetcher.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '../../platform/errors.js';

export interface FetchedFile {
  bytes: Uint8Array;
  contentType: string;
  /** URL after redirects — its path decides how the file is parsed. */
  url: string;
}

export interface FetchOptions {
  maxBytes: number;
  timeoutMs: number;
}

export interface RemoteFetcher {
  get(url: string, opts: FetchOptions): Promise<FetchedFile>;
}

const MAX_REDIRECTS = 3;

export function fetchError(message: string): AppError {
  return new AppError('fetch_failed', message, 422);
}

/** True for addresses a server-side fetch must never reach. */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return isBlockedAddress(x.slice(7));
    return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80');
  }
  return true;
}

async function assertPublicHttps(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw fetchError('Not a valid URL');
  }
  if (u.protocol !== 'https:') throw fetchError('Only https:// URLs can be imported');
  if (u.username || u.password) throw fetchError('URLs with credentials are not allowed');
  if (u.port && u.port !== '443') throw fetchError('Custom ports are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw fetchError(`Cannot resolve ${host}`);
  if (addrs.some((a) => isBlockedAddress(a.address))) throw fetchError('This host is not reachable for imports');
  return u;
}

export class HttpRemoteFetcher implements RemoteFetcher {
  async get(url: string, { maxBytes, timeoutMs }: FetchOptions): Promise<FetchedFile> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = await assertPublicHttps(current);
      let res: Response;
      try {
        res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        const timedOut = e instanceof Error && e.name === 'TimeoutError';
        throw fetchError(timedOut ? 'The URL took too long to respond' : 'Could not fetch the URL');
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw fetchError(`Redirect without a location (${res.status})`);
        current = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok) throw fetchError(`The URL responded with ${res.status}`);
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > maxBytes) throw fetchError(`File is larger than ${maxBytes} bytes`);
      const bytes = await readCapped(res, maxBytes);
      return { bytes, contentType: res.headers.get('content-type') ?? '', url: u.toString() };
    }
    throw fetchError('Too many redirects');
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw fetchError(`File is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
