import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['telegram', 'node-telegram-bot-api'],
};

export default nextConfig;
