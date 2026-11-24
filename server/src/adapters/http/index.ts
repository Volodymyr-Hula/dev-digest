/**
 * http adapter — fetch one remote file (skill import from a URL).
 *
 * Outbound HTTP to a user-supplied URL is an SSRF surface, so every hop is
 * checked: `https:` only, no credentials or custom ports, and the socket may
 * only connect to a public address. The address check runs inside the DNS
 * `lookup` the socket itself uses (`checkedLookup`), so the address that was
 * checked is the address that is connected to — a DNS-rebinding host cannot
 * pass the check with one answer and connect with another. Redirects are
 * followed manually (max 3) and re-checked, the body is capped and the request
 * times out. Nothing fetched is executed; callers only parse it.
 *
 * Swappable in tests via ContainerOverrides.fetcher.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { request, type RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { AppError } from '../../platform/errors.js';
import type { FetchedFile, FetchOptions, RemoteFetcher } from '../../modules/skills/types.js';

const MAX_REDIRECTS = 3;
const BLOCKED_CODE = 'E_DEVDIGEST_BLOCKED_ADDRESS';

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
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return isBlockedAddress(x.slice(7));
    // ::/96 (unspecified, loopback, IPv4-compatible) and NAT64 64:ff9b::/96 embed or reach IPv4.
    if (x.startsWith('::') || x.startsWith('64:ff9b:')) return true;
    const [h1 = 0, h2 = 0] = x.split(':').map((h) => (h === '' ? 0 : parseInt(h, 16)));
    return (
      (h1 & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (h1 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
      (h1 & 0xffc0) === 0xfec0 || // fec0::/10 site-local
      (h1 & 0xff00) === 0xff00 || // ff00::/8 multicast
      h1 === 0x2002 || // 2002::/16 6to4
      (h1 === 0x2001 && h2 === 0) || // 2001::/32 Teredo
      (h1 === 0x0100 && h2 === 0) // 100::/64 discard
    );
  }
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * `dns.lookup` for the request's socket that refuses any blocked address.
 * Every resolved address must be public; the socket then connects to one of them.
 */
export function checkedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return callback(err, '');
    const list = addrs as LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} resolves to a blocked address`), { code: BLOCKED_CODE }), '');
    }
    if (options.all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

/** URL shape rules; an IP-literal host is checked here because no lookup happens for it. */
function assertHttpsUrl(raw: string): URL {
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
  if (isIP(host) && isBlockedAddress(host)) throw fetchError('This host is not reachable for imports');
  return u;
}

function get(u: URL, signal: AbortSignal): Promise<IncomingMessage> {
  const opts: RequestOptions = { method: 'GET', lookup: checkedLookup as RequestOptions['lookup'], signal };
  return new Promise((resolve, reject) => {
    const req = request(u, opts, resolve);
    req.on('error', reject);
    req.end();
  });
}

function toFetchError(e: unknown): AppError {
  const err = e as NodeJS.ErrnoException;
  if (err?.code === BLOCKED_CODE) return fetchError('This host is not reachable for imports');
  if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') return fetchError('Cannot resolve the host');
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return fetchError('The URL took too long to respond');
  return fetchError('Could not fetch the URL');
}

export class HttpRemoteFetcher implements RemoteFetcher {
  async get(url: string, { maxBytes, timeoutMs }: FetchOptions): Promise<FetchedFile> {
    const signal = AbortSignal.timeout(timeoutMs);
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = assertHttpsUrl(current);
      let res: IncomingMessage;
      try {
        res = await get(u, signal);
      } catch (e) {
        throw toFetchError(e);
      }
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        const loc = res.headers.location;
        if (!loc) throw fetchError(`Redirect without a location (${status})`);
        current = new URL(loc, u).toString();
        continue;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        throw fetchError(`The URL responded with ${status}`);
      }
      const declared = Number(res.headers['content-length'] ?? 0);
      if (declared > maxBytes) {
        res.destroy();
        throw fetchError(`File is larger than ${maxBytes} bytes`);
      }
      const bytes = await readCapped(res, maxBytes).catch((e) => {
        throw e instanceof AppError ? e : toFetchError(e);
      });
      return { bytes, contentType: res.headers['content-type'] ?? '', url: u.toString() };
    }
    throw fetchError('Too many redirects');
  }
}

async function readCapped(res: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res as AsyncIterable<Buffer>) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      res.destroy();
      throw fetchError(`File is larger than ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks, total));
}
