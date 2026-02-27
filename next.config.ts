import type { NextConfig } from "next";

// Separate build output dirs so bonsai-dev (next dev) doesn't clobber
// the production build when it restarts. bonsai-prod runs next start
// from .next/, bonsai-dev writes to .next-dev/.
const isDev = process.env.BONSAI_ENV === "dev";

const nextConfig: NextConfig = {
  distDir: isDev ? ".next-dev" : ".next",
  reactCompiler: true,
  allowedDevOrigins: ["100.73.107.114", "192.168.1.136", "localhost"],
  async redirects() {
    return [
      { source: "/projects", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
