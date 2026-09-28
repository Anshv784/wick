import type { NextConfig } from "next";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  // Old routes from before perps became the lead product.
  async redirects() {
    return [
      { source: "/markets", destination: "/predict", permanent: false },
      { source: "/market/:key", destination: "/predict/:key", permanent: false },
      { source: "/perps", destination: "/trade", permanent: false },
      { source: "/pool", destination: "/earn", permanent: false },
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
