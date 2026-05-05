import type { AssetMediaType } from "@/types/silo";

// ── Video transcoding (ffmpeg.wasm) ──────────────────────────────────────────
// Singleton + sequential lock: FFmpeg doesn't support concurrent exec() on one instance.
// The core (~31 MB) is lazy-loaded from CDN on first use.

type FFmpegModule = import("@ffmpeg/ffmpeg").FFmpeg;
let _ffmpegInstance: FFmpegModule | null = null;
let _ffmpegLoadPromise: Promise<FFmpegModule> | null = null;
let _ffmpegLock: Promise<void> = Promise.resolve();

async function loadFFmpeg(): Promise<FFmpegModule> {
  if (_ffmpegInstance) return _ffmpegInstance;
  if (_ffmpegLoadPromise) return _ffmpegLoadPromise;
  _ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ffmpeg = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    _ffmpegInstance = ffmpeg;
    return ffmpeg;
  })().catch((e) => { _ffmpegLoadPromise = null; throw e; });
  return _ffmpegLoadPromise;
}

export async function transcodeVideoToH264(
  file: File,
  onProgress?: (msg: string) => void
): Promise<File> {
  // Acquire the sequential lock — only one transcode runs at a time.
  let release!: () => void;
  const myTurn = new Promise<void>((resolve) => { release = resolve; });
  const prevLock = _ffmpegLock;
  _ffmpegLock = myTurn;
  await prevLock;

  try {
    onProgress?.("Loading transcoder…");
    const ffmpeg = await loadFFmpeg();
    const { fetchFile } = await import("@ffmpeg/util");

    const stamp = Date.now();
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const inputName = `in_${stamp}.${ext}`;
    const outputName = `out_${stamp}.mp4`;

    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress?.(`Transcoding… ${Math.min(99, Math.round(progress * 100))}%`);
    };
    ffmpeg.on("progress", progressHandler);
    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      const exitCode = await ffmpeg.exec([
        "-i", inputName,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        outputName,
      ]);
      if (exitCode !== 0) throw new Error(`ffmpeg exited with code ${exitCode}`);
      const raw = await ffmpeg.readFile(outputName) as Uint8Array;
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
      // Uint8Array.from() copies into a plain ArrayBuffer (not SharedArrayBuffer),
      // which is required by the File/Blob constructors.
      const outName = file.name.replace(/\.[^.]+$/, ".mp4");
      return new File([Uint8Array.from(raw).buffer], outName, { type: "video/mp4" });
    } finally {
      ffmpeg.off("progress", progressHandler);
    }
  } finally {
    release();
  }
}

export async function computeHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Identical resize logic to the wizard's resizeImageForSnap — extracts it as a shared utility.
export async function optimizeImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const W = 1080, H = 1920;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const scale = Math.min(W / img.width, H / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Canvas resize failed")); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
    img.src = objectUrl;
  });
}

export async function generateThumbnail(file: File, mediaType: AssetMediaType): Promise<Blob> {
  const TW = 300, TH = 533;
  const canvas = document.createElement("canvas");
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, TW, TH);

  if (mediaType === "VIDEO") {
    await new Promise<void>((resolve, reject) => {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      video.onloadeddata = () => {
        video.currentTime = Math.min(1, video.duration / 2);
      };
      video.onseeked = () => {
        const scale = Math.min(TW / video.videoWidth, TH / video.videoHeight);
        const sw = video.videoWidth * scale;
        const sh = video.videoHeight * scale;
        ctx.drawImage(video, (TW - sw) / 2, (TH - sh) / 2, sw, sh);
        URL.revokeObjectURL(objectUrl);
        resolve();
      };
      video.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Video load failed")); };
      video.src = objectUrl;
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(TW / img.width, TH / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img, (TW - sw) / 2, (TH - sh) / 2, sw, sh);
        URL.revokeObjectURL(objectUrl);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
      img.src = objectUrl;
    });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("Thumbnail generation failed")); return; }
        resolve(blob);
      },
      "image/jpeg",
      0.85
    );
  });
}

export async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };
    video.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not read video duration")); };
    video.src = objectUrl;
  });
}

export async function getImageResolution(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(`${img.width}x${img.height}`);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not read image resolution")); };
    img.src = objectUrl;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
