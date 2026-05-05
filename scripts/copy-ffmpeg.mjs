import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/@ffmpeg/core/dist/umd");
const dest = resolve(root, "public/ffmpeg");

mkdirSync(dest, { recursive: true });

for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const from = resolve(src, file);
  const to = resolve(dest, file);
  if (!existsSync(from)) {
    console.error(`copy-ffmpeg: missing ${from} — run npm install`);
    process.exit(1);
  }
  copyFileSync(from, to);
  console.log(`copy-ffmpeg: ${file} → public/ffmpeg/`);
}
