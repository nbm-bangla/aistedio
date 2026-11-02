import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { cpus: 1 },
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
