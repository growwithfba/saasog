import './globals.css'
import { Providers } from '@/store/provider'

export const metadata = {
  title: 'Product Vetting Calculator',
  description: 'Analyze market potential for your products',
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
