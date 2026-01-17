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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme') || 'dark';
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
