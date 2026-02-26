import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Allow the Tailscale IP and local network to access the dev server without cross-origin warnings.
  // This prevents Next.js from stripping cookies/headers for requests from off-machine browsers.
  allowedDevOrigins: ["100.73.107.114", "192.168.1.136", "localhost"],
};

export default nextConfig;
