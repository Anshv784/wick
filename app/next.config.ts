import type { NextConfig } from "next";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
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
