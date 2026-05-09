/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Dev: webpack eval() fast refresh. Prod: only wasm-unsafe-eval for ffmpeg.wasm.
              isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'" : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com",
              "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
              "connect-src 'self' https://adsapi.snapchat.com https://accounts.snapchat.com https://*.public.blob.vercel-storage.com https://blob.vercel-storage.com https://vercel.com",
              // 'self' for webpack-bundled worker chunk (/_next/static/chunks/), blob: for any blob-URL workers
              "worker-src 'self' blob:",
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
