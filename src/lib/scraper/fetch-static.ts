import { assertPublicUrl } from "./url-guard";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,sl;q=0.8,de;q=0.7",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const MAX_BYTES = 5 * 1024 * 1024;

export type StaticResult = { status: number; html: string; finalUrl: string };

/** GET with manual redirects so every hop goes through the private-IP guard. */
export async function fetchStatic(rawUrl: string, timeoutMs = 20000): Promise<StaticResult> {
  let url = await assertPublicUrl(rawUrl);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= 5; hop++) {
    const res = await fetch(url, { headers: HEADERS, redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url));
      continue;
    }
    return { status: res.status, html: await readCapped(res), finalUrl: url.toString() };
  }
  throw new Error("Too many redirects.");
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(value);
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}
