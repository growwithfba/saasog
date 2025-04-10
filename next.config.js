/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force case-sensitive paths
  webpack: (config, { dev, isServer }) => {
    // This will make webpack case-sensitive for imports
    if (dev) {
      config.resolve.symlinks = false;
    }
    
    return config;
  }
};

module.exports = nextConfig; 