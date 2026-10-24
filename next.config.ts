import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  devIndicators: false,
  // Allows a production build alongside a running dev server (see README).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["three"],
};

export default nextConfig;
