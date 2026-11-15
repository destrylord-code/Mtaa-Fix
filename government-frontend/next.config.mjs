import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// Server-side API origin. The browser talks to this app on same-origin relative
// paths (/api/*, /uploads/*, /health); Next.js proxies them to the backend here.
// Override in production when the backend lives at a different internal address.
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");

// Next.js blocks cross-origin requests to /_next/* dev resources by default.
// When the app is served behind a dev preview proxy on another host, list that
// host here (comma-separated). Dev-only: ignored by `next build` / `next start`.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      // afterFiles: real filesystem routes (including the local /api/session
      // route handler) are matched first, so they are never shadowed.
      afterFiles: [
        { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
        { source: "/uploads/:path*", destination: `${BACKEND_URL}/uploads/:path*` },
        { source: "/health", destination: `${BACKEND_URL}/health` },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
