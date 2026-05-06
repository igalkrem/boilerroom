import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";

// SESSION_SECRET is a 64-char hex string (32 bytes) — reuse as AES-256-GCM key.
// Both the DB dump AND the SESSION_SECRET must be compromised to get usable tokens.
function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 64) throw new Error("SESSION_SECRET missing or too short");
  return Buffer.from(secret, "hex").subarray(0, 32);
}

// Format: base64(iv):base64(authTag):base64(ciphertext)
export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const key = getKey();
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid token format");
  const [ivB64, tagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// Constant-time comparison to prevent timing attacks on the cron secret.
export function verifyCronSecret(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = `Bearer ${secret}`;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false; // buffers differ in length
  }
}
