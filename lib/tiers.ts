/**
 * プラン定義 — 編集するのは基本このファイルだけです。
 *
 * priceId はターミナルのSummary(スクリプト実行結果)から転記しています。
 * スクリーンショット経由の転記のため、チェックアウトで price not found が
 * 出た場合は Paddle ダッシュボード (Catalog > Prices) の実IDに直してください。
 */

export interface Tier {
  name: 'Starter' | 'Pro' | 'Advanced'
  description: string
  features: string[]
  featured?: boolean
  priceId: { month: string; year: string }
}

export const TIERS: Tier[] = [
  {
    name: 'Starter',
    description: 'Essential features for individuals getting started.',
    features: ['Core features', '1 user', 'Email support'],
    priceId: {
      month: 'pri_01kxv4aa7f20httf2vwz7d4jsf',
      year: 'pri_01kxv4aaewrm80x31jpt07rvrr',
    },
  },
  {
    name: 'Pro',
    description: 'Advanced features for growing teams.',
    features: [
      'Everything in Starter',
      'Up to 5 users',
      'Integrations & API access',
      'Priority support',
    ],
    featured: true,
    priceId: {
      month: 'pri_01kxv4aay37khezbznzgpjdtxa',
      year: 'pri_01kxv4ab59ygr7f7rqz5p0g95m',
    },
  },
  {
    name: 'Advanced',
    description: 'Full feature set for teams operating at scale.',
    features: [
      'Everything in Pro',
      'Unlimited users',
      'SSO & advanced security',
      'Dedicated support',
    ],
    priceId: {
      month: 'pri_01kxv4abmyf02fkvy8qms8464c',
      year: 'pri_01kxv4ac1t26f5stfn8ejm22dp',
    },
  },
]

export type BillingCycle = 'month' | 'year'
