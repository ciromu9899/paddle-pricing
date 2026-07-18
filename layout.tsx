import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Choose your plan — 7-day free trial on all tiers.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
