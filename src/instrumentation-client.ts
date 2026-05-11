// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const EXTENSION_ORIGIN_RE = /^(chrome|moz|safari-web)-extension:\/\//;
const NOISY_BROWSER_MESSAGES = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured",
];

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend(event, hint) {
    const error = hint?.originalException as Error | undefined;
    const message = error?.message ?? (typeof event.message === "string" ? event.message : "");

    if (error?.name === "AbortError") return null;
    if (NOISY_BROWSER_MESSAGES.some((m) => message.includes(m))) return null;

    const topFrame = event.exception?.values?.[0]?.stacktrace?.frames?.slice(-1)[0]?.filename;
    if (topFrame && EXTENSION_ORIGIN_RE.test(topFrame)) return null;

    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
