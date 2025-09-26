import './globals.css'
import { Providers } from '@/store/provider'

export const metadata = {
  title: 'Grow With FBA AI',
  description: 'AI-powered Amazon FBA product analysis and market intelligence',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/GWFai-icon.png', sizes: '32x32', type: 'image/png' },
      { url: '/GWFai-icon.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: { url: '/GWFai-icon.png', sizes: '180x180', type: 'image/png' },
    shortcut: { url: '/GWFai-icon.png', sizes: '192x192', type: 'image/png' },
    other: [
      { url: '/GWFai-icon.png', sizes: '192x192', type: 'image/png' },
      { url: '/GWFai-icon.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
