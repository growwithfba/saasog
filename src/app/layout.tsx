import './globals.css'
import { Providers } from '@/store/provider'

export const metadata = {
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
      </head>
      <body style={{ backgroundColor: 'rgb(15, 23, 42)', background: 'linear-gradient(to bottom right, rgb(15, 23, 42), rgb(30, 41, 59))', minHeight: '100vh', margin: 0, padding: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
