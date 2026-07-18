/**
 * Paddle Webhook 署名検証 (サーバー専用 — クライアントに import しないこと)
 *
 * Paddle は各通知に Paddle-Signature ヘッダーを付ける:
 *   ts=1671552777;h1=eyJhbGciOi...
 *
 * 検証手順 (Paddle 公式仕様):
 *   1. ヘッダーから ts と h1 を取り出す
 *   2. `${ts}:${生のリクエストボディ}` を Webhook シークレットで
 *      HMAC-SHA256 した hex が h1 と一致するか比較 (timingSafeEqual)
 *   3. ts が古すぎるものは拒否 (リプレイ攻撃対策)
 *
 * これを通らないリクエストは 400/401 で捨てる。
 * 署名検証なしでフルフィルメントを行うと、誰でも偽の
 * 「支払い完了」通知でアクセス権を取得できてしまう。
 */

import { createHmac, timingSafeEqual } from 'crypto'

const MAX_AGE_SECONDS = 60 // これより古いタイムスタンプは拒否

export function getWebhookSecret(): string {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error(
      'PADDLE_WEBHOOK_SECRET is not set. ' +
        'Create a notification destination in Paddle > Developer Tools > Notifications ' +
        'and put its secret key in .env.local. Never prefix it with NEXT_PUBLIC_.'
    )
  }
  return secret
}

export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): { ok: true } | { ok: false; reason: string } {
  if (!signatureHeader) return { ok: false, reason: 'missing Paddle-Signature header' }

  const parts = new Map<string, string>()
  for (const kv of signatureHeader.split(';')) {
    const i = kv.indexOf('=')
    if (i > 0) parts.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim())
  }
  const ts = parts.get('ts')
  const h1 = parts.get('h1')
  if (!ts || !h1) return { ok: false, reason: 'malformed Paddle-Signature header' }

  const age = Math.abs(Date.now() / 1000 - Number(ts))
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) {
    return { ok: false, reason: `timestamp too old (${Math.round(age)}s) — possible replay` }
  }

  const expected = createHmac('sha256', secret)
    .update(`${ts}:${rawBody}`)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(h1, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' }
  }
  return { ok: true }
}
