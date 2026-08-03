/** @type {import('next').NextConfig} */
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
          // Content-Security-Policy is NOT here — it lives in src/middleware.ts because
          // script-src now carries a per-request nonce instead of 'unsafe-inline', and
          // headers in this file are static. Do not re-add it: two CSP headers are
          // enforced independently and a script must satisfy both, so a second policy
          // here would silently subtract from the one in the middleware. The reasoning
          // behind each directive (including the SEC-19 'wasm-unsafe-eval' and worker-src
          // blob: removals) moved there with it.
        ],
      },
    ];
  },
};

export default nextConfig;
