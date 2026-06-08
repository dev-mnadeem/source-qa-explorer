import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the runtime image can ship without
  // node_modules. Cuts the production image from ~1.2GB to ~200MB.
  output: "standalone",
};

export default nextConfig;
