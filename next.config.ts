import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/csp";

// VERCEL_ENV is set at build time on Vercel, and headers are fixed when the app is built.
const csp = contentSecurityPolicy({ dev: process.env.NODE_ENV === "development", preview: process.env.VERCEL_ENV === "preview" });

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // The worker file is fetched fresh each time, so a new version is picked up at the next visit.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
