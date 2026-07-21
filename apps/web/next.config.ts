import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@delayance/design-system',
    '@delayance/document-model',
    '@delayance/document-engine',
    '@delayance/editor-schema',
  ],
};

export default nextConfig;
