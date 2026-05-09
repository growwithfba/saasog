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


// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  org: "bloomengine",
  project: "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
