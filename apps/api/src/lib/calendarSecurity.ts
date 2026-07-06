/**
 * SSRF-hardened validation for customer-supplied calendar (.ics) URLs.
 *
 * Short-term-rental hosts paste an iCal feed URL from Airbnb / Vrbo / Google
 * Calendar / their PMS. That URL is fetched server-side on a schedule, so it is
 * a classic SSRF vector: an attacker could point it at cloud metadata
 * (169.254.169.254), localhost, or an internal service and use our worker as a
 * confused deputy.
 *
 * Defense in depth:
 *   1. Scheme allow-list (http/https only; https preferred).
 *   2. Literal-IP + hostname denylist covering loopback, private, link-local,
 *      unique-local, metadata, and internal-looking hostnames — for both IPv4
 *      and IPv6 (including IPv4-mapped/compat forms).
 *   3. DNS resolution via DoH (1.1.1.1) so a public hostname that *resolves* to
 *      a private address is still rejected.
 *   4. Manual redirect following (max 3 hops), re-validating every hop's URL and
 *      resolved address — a public URL can 302 to a private one.
 *   5. Response cap (5 MB) + wall-clock timeout (10 s).
 *   6. Validation by ICS parseability, NOT Content-Type (feeds routinely serve
 *      text/plain, application/octet-stream, etc).
 *
 * Pure classification helpers are exported for unit testing; `fetchCalendar`
 * performs the network I/O.
 */

export const MAX_CALENDAR_BYTES = 5 * 1024 * 1024; // 5 MB
export const CALENDAR_FETCH_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 3;

export class CalendarValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CalendarValidationError";
    this.code = code;
  }
}

// ── IP classification ───────────────────────────────────────────────────────

/** True when an IPv4 dotted-quad falls in a loopback/private/reserved range. */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const oct = parts.map((p) => Number(p));
  if (oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = oct;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && oct[2] === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved (224+/240+), incl. 255.255.255.255
  return false;
}

/** Expand/normalize an IPv6 address to a list of 16-bit hextet numbers, or null. */
function parseIPv6(ip: string): number[] | null {
  let s = ip.trim();
  // Strip zone id (fe80::1%eth0) and surrounding brackets.
  s = s.replace(/%.*$/, "");
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (!s.includes(":")) return null;

  // Handle embedded IPv4 tail (e.g. ::ffff:127.0.0.1).
  let tailHextets: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = tail.split(".").map((p) => Number(p));
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
      return null;
    tailHextets = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1) + "0:0";
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;

  const toHextets = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = toHextets(halves[0]);
  if (head === null) return null;

  let full: number[];
  if (halves.length === 2) {
    const back = toHextets(halves[1]);
    if (back === null) return null;
    const merged = [...head, ...back];
    const fill = 8 - merged.length;
    if (fill < 0) return null;
    full = [...head, ...Array(fill).fill(0), ...back];
  } else {
    full = head;
  }

  // Re-apply the IPv4 tail if we substituted it above.
  if (tailHextets.length) {
    full = full.slice(0, 6).concat(tailHextets);
  }
  if (full.length !== 8) return null;
  return full;
}

/** True when an IPv6 address is loopback/ULA/link-local/mapped-private/etc. */
export function isPrivateIPv6(ip: string): boolean {
  const h = parseIPv6(ip);
  if (!h) return false;
  const isZero = (n: number) => n === 0;

  // ::1 loopback and :: unspecified
  if (h.slice(0, 7).every(isZero) && (h[7] === 1 || h[7] === 0)) return true;
  // fe80::/10 link-local
  if ((h[0] & 0xffc0) === 0xfe80) return true;
  // fc00::/7 unique local
  if ((h[0] & 0xfe00) === 0xfc00) return true;
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compat ::a.b.c.d — check embedded v4
  const mappedV4 =
    h.slice(0, 5).every(isZero) && (h[5] === 0xffff || h[5] === 0);
  if (mappedV4) {
    const a = (h[6] >> 8) & 0xff;
    const b = h[6] & 0xff;
    const c = (h[7] >> 8) & 0xff;
    const d = h[7] & 0xff;
    if (isPrivateIPv4(`${a}.${b}.${c}.${d}`)) return true;
  }
  return false;
}

/** True for any literal IP (v4 or v6) that must never be fetched. */
export function isBlockedLiteralIP(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIPv4(h);
  if (h.includes(":")) return isPrivateIPv6(h);
  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
]);

/** True for hostnames that are inherently internal / not publicly routable. */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  // Internal-only TLDs / suffixes.
  if (/\.(local|internal|localdomain|intranet|lan|home|corp)$/.test(h)) return true;
  return false;
}

// ── URL validation ──────────────────────────────────────────────────────────

export interface ValidatedUrl {
  url: URL;
  hostname: string;
}

/**
 * Structural (non-network) validation of a candidate calendar URL: scheme,
 * literal-IP denylist, hostname denylist. Throws CalendarValidationError on any
 * violation. Does NOT resolve DNS — call `assertResolvesPublic` for that.
 */
export function validateCalendarUrlSyntax(raw: string): ValidatedUrl {
  let url: URL;
  const trimmed = raw.trim();
  // Common webcal:// feeds → normalize to https.
  const normalized = trimmed.replace(/^webcal:\/\//i, "https://");
  try {
    url = new URL(normalized);
  } catch {
    throw new CalendarValidationError("invalid_url", "That doesn't look like a valid URL.");
  }
  const scheme = url.protocol.toLowerCase();
  if (scheme !== "https:" && scheme !== "http:") {
    throw new CalendarValidationError(
      "bad_scheme",
      "Calendar URLs must start with https:// (or http://).",
    );
  }
  if (url.username || url.password) {
    throw new CalendarValidationError("has_credentials", "Remove the user:password@ portion of the URL.");
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname) {
    throw new CalendarValidationError("no_host", "The URL is missing a host.");
  }
  if (isBlockedLiteralIP(hostname)) {
    throw new CalendarValidationError("private_ip", "That address isn't publicly reachable.");
  }
  if (isBlockedHostname(hostname)) {
    throw new CalendarValidationError("internal_host", "That host isn't a public calendar server.");
  }
  return { url, hostname };
}

// ── DNS resolution (DoH) ─────────────────────────────────────────────────────

/**
 * Resolve a hostname's A/AAAA records via Cloudflare DoH and reject if any
 * resolved address is private/reserved. Catches the "public hostname → private
 * IP" rebinding class. Fails closed on resolution errors.
 */
export async function assertResolvesPublic(hostname: string): Promise<void> {
  // Literal IPs were already checked structurally.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) return;

  const lookup = async (type: "A" | "AAAA"): Promise<string[]> => {
    const res = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    if (!body.Answer) return [];
    const want = type === "A" ? 1 : 28;
    return body.Answer.filter((a) => a.type === want).map((a) => a.data);
  };

  let addrs: string[];
  try {
    const [a, aaaa] = await Promise.all([lookup("A"), lookup("AAAA")]);
    addrs = [...a, ...aaaa];
  } catch {
    throw new CalendarValidationError("dns_failed", "We couldn't resolve that host. Double-check the URL.");
  }
  if (addrs.length === 0) {
    throw new CalendarValidationError("dns_empty", "That host didn't resolve to any address.");
  }
  for (const ip of addrs) {
    if (isBlockedLiteralIP(ip)) {
      throw new CalendarValidationError("resolves_private", "That host resolves to a non-public address.");
    }
  }
}

// ── ICS parsing ──────────────────────────────────────────────────────────────

export interface ParsedReservation {
  externalUid: string | null;
  summary: string | null;
  status: string | null;
  /** Event start (checkin) as YYYY-MM-DD or ISO. */
  start: string | null;
  /** Event end — for lodging feeds this is the checkout date. */
  end: string | null;
}

/** Unfold RFC 5545 folded lines (continuation lines begin with space/tab). */
function unfold(ics: string): string[] {
  const rawLines = ics.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function icsDateToIso(value: string): string | null {
  const v = value.trim();
  // DATE form: 20260706
  const dOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dOnly) return `${dOnly[1]}-${dOnly[2]}-${dOnly[3]}`;
  // DATE-TIME form: 20260706T140000Z / 20260706T140000
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dt) {
    return `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}${dt[7] ? "Z" : ""}`;
  }
  return null;
}

/**
 * Parse an ICS document into reservations. Returns null if the payload is not a
 * recognizable VCALENDAR — used as the "validate by parseability" signal.
 */
export function parseIcs(ics: string): ParsedReservation[] | null {
  if (!/BEGIN:VCALENDAR/i.test(ics)) return null;
  const lines = unfold(ics);
  const events: ParsedReservation[] = [];
  let cur: ParsedReservation | null = null;

  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rawKey = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const key = rawKey.split(";")[0].toUpperCase();

    if (key === "BEGIN" && value.toUpperCase() === "VEVENT") {
      cur = { externalUid: null, summary: null, status: null, start: null, end: null };
      continue;
    }
    if (key === "END" && value.toUpperCase() === "VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    switch (key) {
      case "UID":
        cur.externalUid = value.trim() || null;
        break;
      case "SUMMARY":
        cur.summary = value.trim() || null;
        break;
      case "STATUS":
        cur.status = value.trim() || null;
        break;
      case "DTSTART":
        cur.start = icsDateToIso(value);
        break;
      case "DTEND":
        cur.end = icsDateToIso(value);
        break;
    }
  }
  return events;
}

// ── Network fetch ─────────────────────────────────────────────────────────────

export interface FetchCalendarResult {
  body: string;
  reservations: ParsedReservation[];
  finalUrl: string;
}

/**
 * Fetch and validate a calendar feed with full SSRF hardening: per-hop URL +
 * DNS validation, manual redirects (max 3), size cap, timeout, and
 * parseability check. Throws CalendarValidationError on any failure.
 */
export async function fetchCalendar(rawUrl: string): Promise<FetchCalendarResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALENDAR_FETCH_TIMEOUT_MS);
  try {
    let current = rawUrl;
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const { url, hostname } = validateCalendarUrlSyntax(current);
      await assertResolvesPublic(hostname);

      const res = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/calendar, text/plain, */*",
          "user-agent": "Sweepr-CalendarSync/1.0",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          throw new CalendarValidationError("bad_redirect", "The calendar server sent an invalid redirect.");
        }
        if (hop === MAX_REDIRECTS) {
          throw new CalendarValidationError("too_many_redirects", "The calendar URL redirects too many times.");
        }
        // Resolve relative redirects against the current URL, then re-validate.
        current = new URL(loc, url).toString();
        continue;
      }
      response = res;
      break;
    }

    if (!response) {
      throw new CalendarValidationError("no_response", "We couldn't reach that calendar.");
    }
    if (!response.ok) {
      throw new CalendarValidationError(
        "http_error",
        `The calendar server responded with ${response.status}.`,
      );
    }

    const body = await readCapped(response, MAX_CALENDAR_BYTES);
    const reservations = parseIcs(body);
    if (reservations === null) {
      throw new CalendarValidationError(
        "not_ics",
        "That URL didn't return a valid iCalendar (.ics) feed.",
      );
    }
    return { body, reservations, finalUrl: response.url || current };
  } catch (err) {
    if (err instanceof CalendarValidationError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new CalendarValidationError("timeout", "The calendar server took too long to respond.");
    }
    throw new CalendarValidationError("fetch_failed", "We couldn't fetch that calendar URL.");
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body, aborting once it exceeds `maxBytes`. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  // Fast path: honor a well-formed Content-Length.
  const len = Number(response.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) {
    throw new CalendarValidationError("too_large", "That calendar feed is too large to import.");
  }
  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new CalendarValidationError("too_large", "That calendar feed is too large to import.");
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}
