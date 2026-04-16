import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Faster builds + smaller bundles
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Optimize package imports — only bundles what's used
  experimental: {
    optimizePackageImports: ["lucide-react", "@heroicons/react", "framer-motion"],
  },
};

export default nextConfig;
