import type { NextConfig } from 'next';
const config: NextConfig = { output: 'export', basePath: process.env.TELSTRA_BASE_PATH || '', trailingSlash: true, images: { unoptimized: true } };
export default config;
