/**
 * Paddle 環境設定の読み込み。
 *
 * ルール:
 * - 環境 (sandbox / production) は絶対にデフォルトしない。
 *   未設定なら大声で失敗する — 間違ったPaddleアカウントに対して
 *   動くことを防ぐため。
 * - ここで扱うのはクライアントサイドトークン (test_/live_) のみ。
 *   サーバー用APIキー (pdl_..._apikey_...) はこのアプリのクライアント
 *   コードには一切登場させない。
 *
 * NEXT_PUBLIC_ 変数はビルド時にインライン化されます。
 * .env.local を変更したら dev サーバーを再起動してください。
 */

export type PaddleEnv = 'sandbox' | 'production'

export function getPaddleEnv(): PaddleEnv {
  const env = process.env.NEXT_PUBLIC_PADDLE_ENV
  if (env !== 'sandbox' && env !== 'production') {
    throw new Error(
      'NEXT_PUBLIC_PADDLE_ENV must be exactly "sandbox" or "production". ' +
        `Got: ${JSON.stringify(env)}. Set it in .env.local — never rely on a default.`
    )
  }
  return env
}

export function getPaddleClientToken(): string {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
  if (!token) {
    throw new Error(
      'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set. ' +
        'Create a client-side token in Paddle > Developer Tools > Authentication ' +
        'and put it in .env.local.'
    )
  }
  const env = getPaddleEnv()
  if (env === 'sandbox' && !token.startsWith('test_')) {
    throw new Error(
      'Environment is "sandbox" but the client token does not start with "test_". ' +
        'You are probably using a live token (or the server API key) by mistake.'
    )
  }
  if (env === 'production' && !token.startsWith('live_')) {
    throw new Error(
      'Environment is "production" but the client token does not start with "live_".'
    )
  }
  return token
}
