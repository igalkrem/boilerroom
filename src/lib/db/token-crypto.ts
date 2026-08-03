import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

// SEC-15: the token key is SEPARATE from SESSION_SECRET.
//
// It used to be the first 32 bytes of the hex-decoded SESSION_SECRET, which meant one
// leaked env var yielded BOTH the ability to forge session cookies AND every stored
// Snapchat refresh token / Meta access token in the database. Those are different blast
// radii and should not share a secret: a forged cookie is bounded by the 14-day cookie
// maxAge and the user reconnecting, whereas a decrypted refresh token is a durable
// credential against the ad platform.
//
// Two formats coexist on purpose, so this could ship without a flag-day cutover:
//
//   legacy  "base64(iv):base64(tag):base64(ct)"        key = SESSION_SECRET-derived
//   v2      "v2:base64(iv):base64(tag):base64(ct)"     key = TOKEN_ENCRYPTION_KEY
//
// decryptToken() reads both; encryptToken() always writes the best key available. The
// version prefix (rather than trial-decrypting with each key) keeps this deterministic
// and makes "how many rows are still on the old key?" a plain string query:
//   SELECT count(*) FROM user_snapchat_tokens WHERE refresh_token_enc NOT LIKE 'v2:%';
// scripts/reencrypt-tokens.ts is the backfill that drives that count to zero.
//
// Do NOT delete the legacy branch until that query returns 0 on production for BOTH
// token tables — a row that predates the backfill is only recoverable through it.

const V2_PREFIX = "v2";

function hexKey(value: string, label: string): Buffer {
  if (value.length < 64) throw new Error(`${label} missing or too short (need 64 hex chars)`);
  const buf = Buffer.from(value, "hex");
  // Buffer.from silently stops at the first non-hex character, so a typo'd value would
  // otherwise yield a short key and a confusing createCipheriv error further down.
  if (buf.length < 32) throw new Error(`${label} is not valid hex (need 64 hex chars)`);
  return buf.subarray(0, 32);
}

function getLegacyKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET missing");
  return hexKey(secret, "SESSION_SECRET");
}

// The key new ciphertext is written under. Falls back to the legacy key when
// TOKEN_ENCRYPTION_KEY is unset so a dev environment without the new variable keeps
// working unchanged — it just keeps producing legacy-format values.
function getPrimaryKey(): { key: Buffer; version: string | null } {
  const dedicated = process.env.TOKEN_ENCRYPTION_KEY;
  if (dedicated) return { key: hexKey(dedicated, "TOKEN_ENCRYPTION_KEY"), version: V2_PREFIX };
  return { key: getLegacyKey(), version: null };
}

export function encryptToken(plain: string): string {
  const { key, version } = getPrimaryKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const body = [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")];
  return version ? [version, ...body].join(":") : body.join(":");
}

// Force-write the legacy (SESSION_SECRET-derived) format regardless of whether
// TOKEN_ENCRYPTION_KEY is set. Used ONLY by the rollback path in
// scripts/reencrypt-tokens.ts — see the ordering hazard documented there. Nothing on the
// request path should call this; encryptToken() is the one to use.
export function encryptTokenLegacy(plain: string): string {
  const key = getLegacyKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const parts = stored.split(":");

  let key: Buffer;
  let body: string[];
  if (parts.length === 4 && parts[0] === V2_PREFIX) {
    const dedicated = process.env.TOKEN_ENCRYPTION_KEY;
    // Fail with the actual cause. Without this the error is an opaque GCM auth failure,
    // which reads like a corrupt row and sends you looking in the wrong place.
    if (!dedicated) {
      throw new Error("TOKEN_ENCRYPTION_KEY missing but stored token is v2-encrypted");
    }
    key = hexKey(dedicated, "TOKEN_ENCRYPTION_KEY");
    body = parts.slice(1);
  } else if (parts.length === 3) {
    key = getLegacyKey();
    body = parts;
  } else {
    throw new Error("Invalid token format");
  }

  const [ivB64, tagB64, encB64] = body;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// True when `stored` is already on the dedicated key. Used by the backfill script to
// skip rows and to report progress; not needed on the request path.
export function isV2Encrypted(stored: string): boolean {
  return stored.startsWith(`${V2_PREFIX}:`);
}

// Constant-time comparison to prevent timing attacks on the cron secret.
export function verifyCronSecret(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cron] CRON_SECRET not set — cron endpoint is effectively disabled");
    }
    return false;
  }
  if (!header) return false;
  const expected = `Bearer ${secret}`;
  // Hash both sides to a fixed 32 bytes before comparing. timingSafeEqual THROWS on
  // a length mismatch, and returning from that catch is observably faster than a
  // full byte comparison — which leaked the expected header's length. Hashing makes
  // every input take the same path regardless of length.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
