import './globals.css'
import { Providers } from '@/store/provider'
import * as Sentry from '@sentry/nextjs'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import MetaPixelTracker from './MetaPixelTracker'

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export function generateMetadata(): Metadata {
  return {
    title: 'BloomEngine',
    description: 'AI-powered Amazon FBA product analysis and market intelligence',
    icons: {
      icon: [
        { url: '/BloomEngine-Icon-Final-LightMode.png', sizes: 'any' },
        { url: '/BloomEngine-Icon-Final-LightMode.png', sizes: '32x32', type: 'image/png' },
        { url: '/BloomEngine-Icon-Final-LightMode.png', sizes: '16x16', type: 'image/png' },
      ],
      apple: { url: '/BloomEngine-Icon-Final-LightMode.png', sizes: '180x180', type: 'image/png' },
      shortcut: { url: '/BloomEngine-Icon-Final-LightMode.png', sizes: '192x192', type: 'image/png' },
      other: [
        { url: '/BloomEngine-Icon-Final-LightMode.png', sizes: '192x192', type: 'image/png' },
        { url: '/BloomEngine-Icon-Final-LightMode.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    other: {
      ...Sentry.getTraceData(),
    },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning style={{ backgroundColor: 'rgb(15, 23, 42)' }} className="dark">
      <head>
        <style dangerouslySetInnerHTML={{
          __html: `
            html { background-color: rgb(15, 23, 42) !important; }
            body { background: linear-gradient(to bottom right, rgb(15, 23, 42), rgb(30, 41, 59)) !important; min-height: 100vh; margin: 0; padding: 0; }
            #__next { background-color: transparent !important; }
          `
        }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'dark';
                  const root = document.documentElement;
                  if (theme === 'dark') {
                    root.classList.add('dark');
                    root.style.backgroundColor = 'rgb(15, 23, 42)';
                    document.body.style.background = 'linear-gradient(to bottom right, rgb(15, 23, 42), rgb(30, 41, 59))';
                  } else {
                    root.classList.remove('dark');
                    root.style.backgroundColor = 'rgb(249, 250, 251)';
                    document.body.style.background = 'linear-gradient(to bottom right, rgb(249, 250, 251), rgb(243, 244, 246))';
                  }
                } catch (e) {
                  document.documentElement.style.backgroundColor = 'rgb(15, 23, 42)';
                }
              })();
            `,
          }}
        />
        {/* Meta Pixel base code — fires PageView on initial load. SPA route
            changes are caught by <MetaPixelTracker> mounted below. */}
        {META_PIXEL_ID && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
                fbq('init', '${META_PIXEL_ID}');
              `,
            }}
          />
        )}
      </head>
      <body style={{ backgroundColor: 'rgb(15, 23, 42)', background: 'linear-gradient(to bottom right, rgb(15, 23, 42), rgb(30, 41, 59))', minHeight: '100vh', margin: 0, padding: 0 }}>
        {/* Noscript fallback — fires a PageView image beacon for browsers
            without JS. Wrapped in conditional so it only renders when the
            Pixel ID env var is set (e.g. previews without env). */}
        {META_PIXEL_ID && (
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        )}
        {/* App Router navigation-aware PageView tracker. Suspense is required
            because MetaPixelTracker uses useSearchParams(). */}
        <Suspense fallback={null}>
          <MetaPixelTracker />
        </Suspense>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
