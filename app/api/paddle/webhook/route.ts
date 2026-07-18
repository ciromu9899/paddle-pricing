/**
 * Paddle Webhook 受け口: POST /api/paddle/webhook
 *
 * 設計:
 *   1. 生ボディを読む (署名検証は「パース前の生文字列」に対して行う)
 *   2. Paddle-Signature を検証 → 失敗は 401
 *   3. event_id で重複排除 (Paddle は 200 を返せないと再送してくる)
 *   4. イベント種別ごとにフルフィルメント処理へ振り分け
 *   5. 5秒以内に 200 を返す (重い処理はここでやらない)
 *
 * TODO(本番前):
 *   - handleXxx 内の console.log を実際のDB更新に置き換える
 *   - 重複排除の Set をDBテーブル (processed_events) に置き換える
 *     (サーバー再起動やサーバーレスの複数インスタンスでは Set は共有されない)
 */

import { NextResponse } from 'next/server'
import {
  getWebhookSecret,
  verifyPaddleSignature,
} from '@/lib/paddle-webhook'

export const runtime = 'nodejs' // crypto を使うため Edge ではなく Node で実行

/* --- 簡易重複排除 (開発用。本番はDBで) --- */
const seenEvents = new Set<string>()

interface PaddleEvent {
  event_id: string
  event_type: string
  occurred_at: string
  data: Record<string, unknown> & {
    id?: string
    status?: string
    customer_id?: string
    items?: Array<{ price?: { id?: string } }>
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()

  /* 1-2. 署名検証 */
  let secret: string
  try {
    secret = getWebhookSecret()
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'server not configured' }, { status: 500 })
  }
  const sig = verifyPaddleSignature(
    rawBody,
    req.headers.get('paddle-signature'),
    secret
  )
  if (!sig.ok) {
    console.warn(`[paddle-webhook] rejected: ${sig.reason}`)
    return NextResponse.json({ error: sig.reason }, { status: 401 })
  }

  /* 3. パース + 重複排除 */
  let event: PaddleEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (seenEvents.has(event.event_id)) {
    return NextResponse.json({ ok: true, deduped: true }) // 再送はそのまま200
  }
  seenEvents.add(event.event_id)

  /* 4. 振り分け */
  try {
    switch (event.event_type) {
      case 'subscription.created':
        await handleSubscriptionCreated(event)
        break
      case 'subscription.updated':
        await handleSubscriptionUpdated(event)
        break
      case 'subscription.canceled':
        await handleSubscriptionCanceled(event)
        break
      case 'transaction.completed':
        await handleTransactionCompleted(event)
        break
      default:
        console.log(`[paddle-webhook] unhandled event: ${event.event_type}`)
    }
  } catch (e) {
    // 処理失敗時は 500 を返す → Paddle が後で再送してくれる
    console.error(`[paddle-webhook] handler failed for ${event.event_type}`, e)
    seenEvents.delete(event.event_id) // 再送時に再処理できるよう取り消す
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }

  /* 5. 即200 */
  return NextResponse.json({ ok: true })
}

/* ================= フルフィルメント処理 =================
 * ここが「顧客に何を提供するか」を書く場所。
 * 現状はログ出力のみ。自分のDB/認証基盤ができたら中身を実装する。
 * ======================================================= */

/** トライアル開始 or 新規購読 → アクセス権を付与 */
async function handleSubscriptionCreated(event: PaddleEvent) {
  const sub = event.data
  const priceIds = (sub.items ?? [])
    .map((i) => i.price?.id)
    .filter(Boolean)
  console.log(
    `[fulfillment] GRANT access — subscription=${sub.id} customer=${sub.customer_id} status=${sub.status} prices=${priceIds.join(',')}`
  )
  // TODO: customer_id (または custom_data のユーザーID) をキーに
  //       自社DBのユーザーへ該当プランの権限を付与する
}

/** プラン変更・ステータス変化 → 同期 */
async function handleSubscriptionUpdated(event: PaddleEvent) {
  const sub = event.data
  console.log(
    `[fulfillment] SYNC — subscription=${sub.id} status=${sub.status}`
  )
  // TODO: status が 'past_due' なら支払い失敗の警告表示、
  //       'active' に戻ったら解除。プラン(items)が変わったら権限を更新。
}

/** 解約 → アクセス権を剥奪 */
async function handleSubscriptionCanceled(event: PaddleEvent) {
  const sub = event.data
  console.log(
    `[fulfillment] REVOKE access — subscription=${sub.id} customer=${sub.customer_id}`
  )
  // TODO: 自社DBのユーザーから権限を剥奪。
  //       Paddle は期間終了時に canceled を送るため、即時剥奪でOK。
}

/** 支払い完了 → 記録 (任意) */
async function handleTransactionCompleted(event: PaddleEvent) {
  console.log(`[fulfillment] payment recorded — transaction=${event.data.id}`)
  // TODO: 必要なら自社側の支払い履歴に記録 (領収書はPaddleが送付する)
}
