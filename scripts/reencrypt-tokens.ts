/**
 * SEC-15 backfill — re-encrypt stored platform tokens under TOKEN_ENCRYPTION_KEY.
 *
 * Rewrites every legacy-format value in user_snapchat_tokens.refresh_token_enc and
 * user_meta_tokens.access_token_enc to the v2 format. Rows already on v2 are skipped, so
 * this is idempotent and safe to re-run.
 *
 *   dry run (default):  node scripts/.reencrypt-tokens.mjs
 *   apply:              node scripts/.reencrypt-tokens.mjs --write
 *
 * Requires POSTGRES_URL, SESSION_SECRET (to read the old values) and TOKEN_ENCRYPTION_KEY
 * (to write the new ones) in the environment. See package.json for the bundle step.
 *
 * Safety properties, in the order they matter:
 *   - Each row is decrypted, re-encrypted, and then decrypted AGAIN and compared against
 *     the original plaintext BEFORE the UPDATE is issued. A row that fails that check is
 *     reported and left exactly as it was.
 *   - Rows are processed independently, so one undecryptable row (e.g. written under a
 *     rotated SESSION_SECRET) does not stop the rest. That user reconnects; nobody else
 *     is affected.
 *   - The UPDATE is guarded on the old ciphertext still being present, so a token
 *     rewritten by a live OAuth callback mid-run is never clobbered with a stale value.
 */
import { sql } from "@/lib/db";
import { encryptToken, encryptTokenLegacy, decryptToken, isV2Encrypted } from "@/lib/db/token-crypto";

const WRITE = process.argv.includes("--write");

// Rollback: rewrite v2 rows back to the legacy SESSION_SECRET-derived format.
//
// This exists because the forward migration has a deployment ordering requirement — every
// environment reading these rows must have TOKEN_ENCRYPTION_KEY set *before* the rows
// become v2. If that is not true (it was not, on the first attempt: `vercel env add` via
// piped stdin silently stored an empty value), production cannot decrypt its own tokens
// and every tenant's reporting stops at the next cron tick. Reverting the DATA is the
// fast, deterministic way out, because SESSION_SECRET is known-present everywhere.
//
//   node scripts/.reencrypt-tokens.mjs --to-legacy --write
const TO_LEGACY = process.argv.includes("--to-legacy");

interface Outcome {
  table: string;
  total: number;
  alreadyV2: number;
  converted: number;
  failed: Array<{ user: string; reason: string }>;
}

async function convert(
  table: "user_snapchat_tokens" | "user_meta_tokens"
): Promise<Outcome> {
  const out: Outcome = { table, total: 0, alreadyV2: 0, converted: 0, failed: [] };

  // Column/table names cannot be parameterized, so they are constrained by the union
  // types above rather than interpolated from anything caller-supplied.
  const { rows } =
    table === "user_snapchat_tokens"
      ? await sql<{ google_user_id: string; enc: string }>`
          SELECT google_user_id, refresh_token_enc AS enc FROM user_snapchat_tokens`
      : await sql<{ google_user_id: string; enc: string }>`
          SELECT google_user_id, access_token_enc AS enc FROM user_meta_tokens`;

  out.total = rows.length;

  for (const row of rows) {
    // Skip rows already in the target format, in whichever direction we are going.
    if (TO_LEGACY ? !isV2Encrypted(row.enc) : isV2Encrypted(row.enc)) {
      out.alreadyV2++;
      continue;
    }

    let next: string;
    try {
      const plain = decryptToken(row.enc);
      next = TO_LEGACY ? encryptTokenLegacy(plain) : encryptToken(plain);

      // Prove the new ciphertext is readable before trusting it with the only copy.
      if (decryptToken(next) !== plain) {
        throw new Error("round-trip mismatch");
      }
      if (TO_LEGACY ? isV2Encrypted(next) : !isV2Encrypted(next)) {
        throw new Error(
          TO_LEGACY
            ? "rollback produced a v2 value"
            : "re-encrypted value is not v2 — is TOKEN_ENCRYPTION_KEY set?"
        );
      }
    } catch (err) {
      out.failed.push({
        user: row.google_user_id,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (WRITE) {
      // The WHERE guard on the old value makes this a compare-and-swap: if an OAuth
      // callback rewrote this row since the SELECT, it matches 0 rows and we leave the
      // fresher token alone (it will already be v2 anyway).
      const res =
        table === "user_snapchat_tokens"
          ? await sql`UPDATE user_snapchat_tokens SET refresh_token_enc = ${next}
                      WHERE google_user_id = ${row.google_user_id} AND refresh_token_enc = ${row.enc}`
          : await sql`UPDATE user_meta_tokens SET access_token_enc = ${next}
                      WHERE google_user_id = ${row.google_user_id} AND access_token_enc = ${row.enc}`;
      if (res.rowCount === 0) {
        out.failed.push({ user: row.google_user_id, reason: "row changed mid-run, skipped" });
        continue;
      }
    }
    out.converted++;
  }

  return out;
}

async function main() {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.error(
      TO_LEGACY
        ? "TOKEN_ENCRYPTION_KEY is not set — it is required to READ the v2 rows being rolled back."
        : "TOKEN_ENCRYPTION_KEY is not set — nothing to migrate to. Aborting."
    );
    process.exit(1);
  }

  console.log(`DIRECTION: ${TO_LEGACY ? "v2 -> legacy (ROLLBACK)" : "legacy -> v2"}`);
  console.log(WRITE ? "MODE: WRITE (will update rows)\n" : "MODE: DRY RUN (no writes)\n");

  const results = [
    await convert("user_snapchat_tokens"),
    await convert("user_meta_tokens"),
  ];

  let anyFailed = false;
  for (const r of results) {
    console.log(`${r.table}:`);
    console.log(`  rows            ${r.total}`);
    console.log(`  already target  ${r.alreadyV2}`);
    console.log(`  ${WRITE ? "converted" : "convertible"}     ${r.converted}`);
    console.log(`  failed          ${r.failed.length}`);
    for (const f of r.failed) {
      anyFailed = true;
      console.log(`    - ${f.user}: ${f.reason}`);
    }
    console.log("");
  }

  if (anyFailed) {
    console.log(
      "Failed rows were left untouched. A row that cannot be decrypted was written under a\n" +
        "different SESSION_SECRET; that user must reconnect the platform. No other user is affected."
    );
  }
  if (!WRITE) console.log("Re-run with --write to apply.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
