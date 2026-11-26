/**
 * Server-local port of the skills module: fetch one remote file for an import
 * from a URL. Implemented by `adapters/http` (`HttpRemoteFetcher`) and by
 * `MockRemoteFetcher` in tests; the service only sees this interface.
 */

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
