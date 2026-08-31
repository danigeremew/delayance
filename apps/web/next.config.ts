import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@delayance/design-system',
    '@delayance/document-model',
    '@delayance/document-engine',
  ],
};

export default nextConfig;
