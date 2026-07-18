# Paddle Pricing — Next.js チェックアウト

3プラン (Starter / Pro / Advanced) × 月額/年額の料金ページ。
Paddle.js のオーバーレイチェックアウト (one-page) で購読を開始し、
成功時に `/welcome` へリダイレクトします。

## セットアップ (Windows PowerShell)

```powershell
cd paddle-pricing
npm install
copy .env.example .env.local
notepad .env.local   # NEXT_PUBLIC_PADDLE_CLIENT_TOKEN に test_... トークンを貼る
npm run dev
```

http://localhost:3000 を開く。

## 必要なもの

1. **クライアントサイドトークン** (`test_...`)
   Paddle Sandbox > Developer Tools > Authentication > Client-side tokens で作成。
   ※ APIキー (`pdl_sdbx_apikey_...`) とは別物。APIキーをここに入れると
   起動時チェックで弾かれます。

2. **デフォルト支払いリンクの設定** (ダッシュボードでのみ設定可能)
   Paddle Sandbox > Checkout > Checkout settings >
   Default payment link に `http://localhost:3000` を設定。
   - Sandbox では localhost でOK。
   - Live では承認済みの実ドメインが必須 (localhost 不可)。未設定/未承認だと
     チェックアウトが失敗します。

## テスト手順 (Sandbox)

1. 料金ページで Monthly / Annual を切り替え、6価格すべて表示されることを確認
2. 任意のプランで Subscribe → オーバーレイが開くことを確認
3. テストカード `4242 4242 4242 4242` (期限: 未来の任意, CVC: 任意の3桁) で完了
4. `/welcome` にリダイレクトされることを確認
5. Paddle ダッシュボード > Subscriptions にトライアル中のサブスクが
   できていることを確認

## 編集ポイント

- プラン内容・Price ID: `lib/tiers.ts` (基本ここだけ)
- 国検出: `app/page.tsx` (Vercel: x-vercel-ip-country / Cloudflare: cf-ipcountry)
- メールのプリフィル: `app/page.tsx` の `customerEmail` に
  認証セッションのメールを渡す

## Webhook (フルフィルメント) — /api/paddle/webhook

決済イベントを受け取り、アクセス権の付与/剥奪を行う受け口。

### Paddle 側の設定

1. Paddle Sandbox > Developer Tools > **Notifications** > New destination
2. URL: `https://<公開URL>/api/paddle/webhook`
   (Paddle は localhost に直接届けられない。下の「ローカルテスト」参照)
3. イベントを選択: `subscription.created` / `subscription.updated` /
   `subscription.canceled` / `transaction.completed`
4. 作成後に表示される **secret key** を `.env.local` の
   `PADDLE_WEBHOOK_SECRET` に設定

### ローカルテスト (トンネルが必要)

```powershell
npm run dev                 # ウィンドウ1
npx cloudflared tunnel --url http://localhost:3000   # ウィンドウ2
```

cloudflared が発行する `https://xxxx.trycloudflare.com` を
Paddle の Destination URL に `/api/paddle/webhook` 付きで設定。
その後 Paddle の Notifications 画面から Simulation を送るか、
実際にテスト決済すると、dev サーバーのコンソールに
`[fulfillment] ...` ログが出る。

### 本番前の TODO (route.ts 内のコメント参照)

- `handleXxx` の console.log を実DB更新に置き換える
- event_id の重複排除を in-memory Set から DB に置き換える
- デプロイ先の環境変数に `PADDLE_WEBHOOK_SECRET` を設定 (Live用は別の値)

## 設計上のルール (変更時も維持すること)

- 価格表示は Paddle の `formattedTotals` をそのまま使う。
  フロントで計算・再フォーマットしない。
- 環境 (`NEXT_PUBLIC_PADDLE_ENV`) は絶対にデフォルトしない。
  未設定なら起動時に失敗する仕様 (lib/paddle-env.ts)。
- サーバーAPIキーはクライアントコード ('use client') に書かない。
- 不明な国コード ('OTHERS' 等のセンチネル) を Paddle に渡さない。
  ヘッダーが無ければ country を渡さず Paddle の自動判定に任せる。
