/**
 * SEC-8 remediation — delete the PUBLIC blob copies of the metadata store.
 *
 * Moving this data into Postgres (see src/lib/db/user-metadata.ts) fixes nothing on its
 * own: the blobs at metadata/{googleUserId}/{key}.json live in a public-read store with
 * addRandomSuffix:false, so the old snapshot keeps being served to anyone who knows the
 * googleUserId — and /api/auth/session hands that to the browser. Verified 2026-08-03
 * that every key returned HTTP 200 to an unauthenticated request. THIS script is the
 * part that actually closes it.
 *
 *   dry run (default, also writes the backup):  node scripts/.purge-public-metadata-blobs.mjs
 *   apply:                                      node scripts/.purge-public-metadata-blobs.mjs --write
 *
 * Refuses to delete a blob unless the SAME key is already present in `user_metadata` and
 * its content matches semantically — so a key that never migrated cannot be destroyed.
 * Every blob is written to a local backup directory before any deletion, in both modes.
 *
 * JSONB does not preserve object key order, so the comparison is canonical (keys sorted
 * recursively) rather than a byte or JSON.stringify match. Array order IS preserved and
 * is compared as-is.
 */
import { list, del } from "@vercel/blob";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { sql } from "@/lib/db/index";
import { GLOBAL_OWNER } from "@/lib/db/user-metadata";

const WRITE = process.argv.includes("--write");

// Opt-in override for blobs that the migration guard legitimately refuses:
//
//   - a *_cache key whose DB copy DIFFERS because the DB copy is NEWER (forcing
//     /api/meta/ad-limits?refresh=1 rewrites the DB row and leaves the blob stale). A
//     cache's blob copy is disposable by definition — worst case it is recomputed.
//   - blobs under an owner id with no user_metadata rows at all. In this codebase that is
//     the pre-Google `snapUserId` (a UUID) path: abandoned early snapshots, superseded by
//     the Google-keyed data (1 article vs 33, 3 silo assets vs 218 when measured).
//
// These are still PUBLICLY READABLE, so leaving them behind leaves SEC-8 half-fixed.
// This flag only ever applies to blobs whose local backup was written successfully.
const INCLUDE_UNMIGRATED = process.argv.includes("--include-unmigrated");
const BACKUP_DIR =
  process.env.METADATA_BACKUP_DIR ??
  path.join(process.env.HOME ?? ".", `BoilerRoom-metadata-backup-${new Date().toISOString().slice(0, 10)}`);

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canon((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

// metadata/{owner}/{key}.json  ->  { owner, key }.  The one global cache is stored under
// the literal path segment "global" but owned by the GLOBAL_OWNER sentinel in Postgres.
function parsePath(pathname: string): { owner: string; key: string } | null {
  const m = /^metadata\/([^/]+)\/(.+)\.json$/.exec(pathname);
  if (!m) return null;
  const [, rawOwner, key] = m;
  return { owner: rawOwner === "global" ? GLOBAL_OWNER : rawOwner, key };
}

async function main() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`${WRITE ? "MODE: WRITE (will delete blobs)" : "MODE: DRY RUN (no deletes)"}`);
  console.log(`backup dir: ${BACKUP_DIR}\n`);

  const { rows } = await sql<{ google_user_id: string; key: string; data: unknown }>`
    SELECT google_user_id, key, data FROM user_metadata
  `;
  const dbIndex = new Map(rows.map((r) => [`${r.google_user_id}::${r.key}`, r.data]));

  const { blobs } = await list({ prefix: "metadata/", limit: 1000 });
  console.log(`found ${blobs.length} blob(s) under metadata/\n`);

  const deletable: string[] = [];
  const skipped: string[] = [];

  for (const b of blobs) {
    const parsed = parsePath(b.pathname);
    if (!parsed) {
      skipped.push(`${b.pathname} — unrecognized path shape`);
      continue;
    }

    // Back up the PUBLIC content (that is what is at risk, and what we are removing).
    let content: unknown;
    try {
      const res = await fetch(b.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      content = await res.json();
      const safe = b.pathname.replace(/[/]/g, "__");
      writeFileSync(path.join(BACKUP_DIR, safe), JSON.stringify(content, null, 2));
    } catch (err) {
      skipped.push(`${b.pathname} — backup failed (${err instanceof Error ? err.message : err})`);
      continue;
    }

    const dbCopy = dbIndex.get(`${parsed.owner}::${parsed.key}`);
    if (dbCopy === undefined) {
      if (!INCLUDE_UNMIGRATED) {
        skipped.push(`${b.pathname} — NOT in user_metadata yet`);
        continue;
      }
      deletable.push(b.url);
      console.log(`  ok to delete (unmigrated, backed up): ${b.pathname}`);
      continue;
    }
    if (JSON.stringify(canon(dbCopy)) !== JSON.stringify(canon(content))) {
      if (!INCLUDE_UNMIGRATED) {
        skipped.push(`${b.pathname} — DB copy differs from blob`);
        continue;
      }
      deletable.push(b.url);
      console.log(`  ok to delete (DB copy differs/newer, backed up): ${b.pathname}`);
      continue;
    }
    deletable.push(b.url);
    console.log(`  ok to delete: ${b.pathname}`);
  }

  if (skipped.length > 0) {
    console.log("\nSKIPPED (left in place):");
    for (const s of skipped) console.log(`  - ${s}`);
  }

  console.log(`\n${deletable.length} deletable, ${skipped.length} skipped.`);

  if (!WRITE) {
    console.log("\nBackup written. Re-run with --write to delete the deletable blobs.");
    process.exit(0);
  }

  // del() accepts a batch of urls.
  for (let i = 0; i < deletable.length; i += 50) {
    await del(deletable.slice(i, i + 50));
  }
  console.log(`\nDeleted ${deletable.length} public blob(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
