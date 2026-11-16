import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {}

function ipv4Private(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return (
    v === "::" || v === "::1" ||
    v.startsWith("fc") || v.startsWith("fd") ||
    /^fe[89ab]/.test(v) || v.startsWith("ff")
  );
}

/** Throws unless the URL is http(s) and resolves only to public addresses. */
export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https links can be tracked.");
  }
  if (url.username || url.password) throw new UnsafeUrlError("Links with credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new UnsafeUrlError("Local network addresses can't be tracked.");
  }
  const addrs = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true }).catch(() => {
        throw new UnsafeUrlError(`Couldn't find the shop at ${host}.`);
      });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("Local network addresses can't be tracked.");
  }
  return url;
}
