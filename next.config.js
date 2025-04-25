// next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...any other Next settings you already have
  webpack(config) {
    // Tell webpack that “@” maps to ./src
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;
