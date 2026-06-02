import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { put } from "@vercel/blob";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { v4 as uuid } from "uuid";

export const maxDuration = 300;

const execFileAsync = promisify(execFile);

const bodySchema = z.object({
  blobUrl: z
    .string()
    .url()
    .refine(
      (url) => new URL(url).hostname.endsWith(".vercel-storage.com"),
      { message: "blobUrl must be a Vercel Blob URL" }
    ),
  fileName: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { blobUrl, fileName } = parsed.data;

  const id = uuid();
  const ext = fileName.split(".").pop()?.toLowerCase() || "mp4";
  const inputPath = `/tmp/${id}_in.${ext}`;
  const outputPath = `/tmp/${id}_out.mp4`;

  try {
    // Download raw video from Vercel Blob into /tmp
    const res = await fetch(blobUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "blob_fetch_failed" }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(inputPath, buffer);

    // Run native FFmpeg — ultrafast preset is ~3× faster than "fast" with negligible quality difference
    const ffmpegPath: string = (await import("@ffmpeg-installer/ffmpeg")).default.path;
    await execFileAsync(ffmpegPath, [
      "-i", inputPath,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);

    // Upload transcoded H.264 result to Vercel Blob
    const transcoded = await readFile(outputPath);
    const safeName = fileName.replace(/[^a-zA-Z0-9._\-]/g, "_").replace(/\.[^.]+$/, ".mp4");
    const { url: optimizedUrl } = await put(`silo/transcoded/${id}_${safeName}`, transcoded, {
      access: "public",
      contentType: "video/mp4",
    });

    return NextResponse.json({ optimizedUrl });
  } catch (err) {
    console.error("[silo/transcode] error:", err);
    return NextResponse.json({ error: "transcode_failed" }, { status: 500 });
  } finally {
    // Clean up temp files — best effort
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
