'use client'

/**
 * 料金テーブル (クライアントコンポーネント)。
 *
 * - 価格表示: Paddle.PricePreview() が返す formattedTotals をそのまま表示。
 *   フロント側で計算・再フォーマットは一切しない (Intl.NumberFormat 不使用)。
 * - チェックアウト: Paddle.Checkout.open() をオーバーレイ + one-page で開く。
 * - このファイルにサーバーAPIキーを書いてはいけない。
 *   使うのはクライアントサイドトークン (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) のみ。
 */

import { useEffect, useMemo, useState } from 'react'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'
import { TIERS, type BillingCycle } from '@/lib/tiers'
import { getPaddleEnv, getPaddleClientToken } from '@/lib/paddle-env'

interface Props {
  /** ISO 3166-1 alpha-2。無ければ Paddle がIPから自動判定する。 */
  country?: string
  /** サインイン済みならメールをプリフィル。 */
  customerEmail?: string
}

export default function PricingTable({ country, customerEmail }: Props) {
  const [paddle, setPaddle] = useState<Paddle>()
  const [billing, setBilling] = useState<BillingCycle>('month')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [currency, setCurrency] = useState<string>()
  const [fatal, setFatal] = useState<string>()

  /* ---- Paddle 初期化 (環境とトークンは env var から。デフォルトなし) ---- */
  useEffect(() => {
    let cancelled = false
    try {
      const environment = getPaddleEnv()
      const token = getPaddleClientToken()
      initializePaddle({ environment, token }).then((p) => {
        if (!cancelled && p) setPaddle(p)
      })
    } catch (e) {
      setFatal(e instanceof Error ? e.message : String(e))
    }
    return () => {
      cancelled = true
    }
  }, [])

  /* ---- ローカライズ価格の取得 ---- */
  useEffect(() => {
    if (!paddle) return
    const items = TIERS.flatMap((t) => [
      { priceId: t.priceId.month, quantity: 1 },
      { priceId: t.priceId.year, quantity: 1 },
    ])
    // country が無いときは address を渡さない → Paddle がIPで自動判定。
    // 'OTHERS' のようなアプリ内センチネルをここに流し込まないこと。
    const request = country
      ? { items, address: { countryCode: country } }
      : { items }

    paddle
      .PricePreview(request)
      .then((result) => {
        const map: Record<string, string> = {}
        for (const li of result.data.details.lineItems) {
          map[li.price.id] = li.formattedTotals.total
        }
        setPrices(map)
        setCurrency(result.data.currencyCode)
      })
      .catch((e) => {
        console.error('PricePreview failed', e)
        setFatal(
          'Failed to load prices from Paddle. Check price IDs in lib/tiers.ts and your client token.'
        )
      })
  }, [paddle, country])

  /* ---- チェックアウト ---- */
  const openCheckout = (priceId: string) => {
    if (!paddle) return
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      settings: {
        displayMode: 'overlay',
        variant: 'one-page',
        successUrl: `${window.location.origin}/welcome`,
      },
      ...(customerEmail ? { customer: { email: customerEmail } } : {}),
    })
  }

  const per = billing === 'month' ? '/month' : '/year'
  const geoNote = useMemo(() => {
    if (!currency || currency === 'USD') return ''
    return `Prices shown in ${currency} based on your location.`
  }, [currency])

  return (
    <>
      <header className="hero wrap">
        <span className="eyebrow">Pricing</span>
        <h1>Simple plans. 7-day free trial on all of them.</h1>
        <p className="sub">
          Start free, cancel anytime during the trial. Prices are shown in your
          local currency at checkout.
        </p>

        <div className="toggle-row">
          <button
            className={`toggle-label ${billing === 'month' ? 'active' : ''}`}
            onClick={() => setBilling('month')}
          >
            Monthly
          </button>
          <button
            className="switch"
            role="switch"
            aria-checked={billing === 'year'}
            aria-label="Toggle annual billing"
            onClick={() => setBilling(billing === 'month' ? 'year' : 'month')}
          />
          <button
            className={`toggle-label ${billing === 'year' ? 'active' : ''}`}
            onClick={() => setBilling('year')}
          >
            Annual
          </button>
          <span className="save-chip">2 months free</span>
        </div>
        <p className="geo-note">{geoNote}</p>
      </header>

      {fatal && (
        <div className="error-banner" role="alert">
          {fatal}
        </div>
      )}

      <main className="wrap">
        <div className="grid">
          {TIERS.map((tier) => {
            const priceId = tier.priceId[billing]
            const label = prices[priceId]
            return (
              <div
                key={tier.name}
                className={`card ${tier.featured ? 'featured' : ''}`}
              >
                {tier.featured && <span className="tag">Most popular</span>}
                <div className="plan-name">{tier.name}</div>
                <p className="plan-desc">{tier.description}</p>
                <div className="price-line">
                  {label ? (
                    <>
                      <span className="price">{label}</span>
                      <span className="per">{per}</span>
                    </>
                  ) : (
                    <span className="price loading">Loading…</span>
                  )}
                </div>
                <ul className="features">
                  {tier.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button
                  className="cta"
                  disabled={!paddle || !label}
                  onClick={() => openCheckout(priceId)}
                >
                  Subscribe
                </button>
                <p className="trial-note">7-day free trial · No charge today</p>
              </div>
            )
          })}
        </div>
      </main>
    </>
  )
}
