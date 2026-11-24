/** True for the file types the server can import. */
export function isImportableName(name: string): boolean {
  return /\.(md|markdown|zip|skill)$/i.test(name);
}

/** Base64 of raw bytes (chunked so large files don't overflow the call stack). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Read a picked file's bytes (FileReader: also works where Blob#arrayBuffer is missing). */
export function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}
