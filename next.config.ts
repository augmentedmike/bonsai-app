import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["100.73.107.114", "192.168.1.136", "localhost"],
  async redirects() {
    return [
      { source: "/projects", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
