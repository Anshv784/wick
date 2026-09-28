import type { NextConfig } from "next";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  devIndicators: false,
  // Old routes from before perps became the lead product.
  async redirects() {
    return [
      { source: "/trade", destination: "/perps", permanent: false },
      { source: "/predict", destination: "/predictions", permanent: false },
      { source: "/predict/:key", destination: "/predictions/:key", permanent: false },
      { source: "/markets", destination: "/predictions", permanent: false },
      { source: "/market/:key", destination: "/predictions/:key", permanent: false },
      { source: "/earn", destination: "/liquidity", permanent: false },
      { source: "/pool", destination: "/liquidity", permanent: false },
      { source: "/how", destination: "/docs#settlement", permanent: false },
    ];
  },
  // @arcium-hq/client imports anchor's (missing) default export and node builtins;
  // webpack tolerates both, Turbopack does not.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, os: false, crypto: false };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      "@arcium-hq/client$": require.resolve("@arcium-hq/client").replace(/index\.m?js$/, "index.cjs"),
    };
    return config;
  },
};

export default nextConfig;
