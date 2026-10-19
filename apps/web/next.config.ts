import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep the development indicator clear of the assistant's Send button.
  devIndicators: false,
  transpilePackages: [
    '@delayance/design-system',
    '@delayance/document-model',
    '@delayance/document-engine',
  ],
};

export default nextConfig;
