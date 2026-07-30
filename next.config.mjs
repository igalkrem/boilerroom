/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // SEC-19: 'wasm-unsafe-eval' dropped. It existed for the client-side
              // ffmpeg.wasm transcoder, whose only entry point (transcodeVideoToH264 in
              // silo-utils.ts) has zero callers — /api/silo/transcode does the work
              // server-side with native ffmpeg instead. Verified by call-site count, not
              // by assumption; restore this token if that client path is ever revived.
              //
              // 'unsafe-inline' REMAINS and is the last real weakness here: Next.js
              // injects inline bootstrap scripts, so removing it requires wiring a
              // per-request nonce through the app. Tracked separately — do not simply
              // delete the token, it will break hydration.
              isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com",
              "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
              "connect-src 'self' https://adsapi.snapchat.com https://accounts.snapchat.com https://*.public.blob.vercel-storage.com https://blob.vercel-storage.com https://vercel.com",
              // blob: dropped with the ffmpeg.wasm worker — `new Worker` appears nowhere in
              // src/. The remaining URL.createObjectURL calls are download anchors and
              // <video>/<img> sources, governed by img-src/media-src, not worker-src.
              "worker-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
