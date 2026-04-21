import type { NextConfig } from "next";
import pkg from './package.json';

const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_SHA: sha,
  },
};

export default nextConfig;
