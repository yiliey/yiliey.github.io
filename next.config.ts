import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.PRISM_DEV_DIST || '.next',
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  /* config options here */
  webpack: (config) => {
    config.module.rules.push({
      test: /\.bib$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
