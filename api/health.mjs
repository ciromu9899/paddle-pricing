// api/health.mjs  —  Vercel Node serverless function (ESM)
// Self-check for setup: reports which required env vars are set (never their values).
// Call:  https://gipan-bite.tech/api/health?key=<DOWNLOAD_SECRET>
// If DOWNLOAD_SECRET is set, the key must match; otherwise access is refused.

const REQUIRED = [
  "PADDLE_WEBHOOK_SECRET",
  "PADDLE_API_KEY",
  "DOWNLOAD_SECRET",
  "RESEND_API_KEY",
  "FROM_EMAIL",
  "BASE_URL",
  "FILE_SOLO_URL",
  "FILE_FIRM_URL",
];

export default async function handler(req, res) {
  const key = req.query?.key;
  if (process.env.DOWNLOAD_SECRET && key !== process.env.DOWNLOAD_SECRET) {
    return res.status(403).json({ error: "forbidden — pass ?key=<DOWNLOAD_SECRET>" });
  }

  const set = {};
  for (const k of REQUIRED) set[k] = Boolean(process.env[k]);
  const missing = REQUIRED.filter((k) => !process.env[k]);

  return res.status(200).json({
    ok: missing.length === 0,
    missing,
    set,
    config: {
      PADDLE_API_BASE: process.env.PADDLE_API_BASE || "https://sandbox-api.paddle.com (default)",
      BASE_URL: process.env.BASE_URL || null,
      PRICE_SOLO: process.env.PRICE_SOLO || "pri_01kxvsm2f14d63h3h12tjgxfm7 (default)",
      PRICE_FIRM: process.env.PRICE_FIRM || "pri_01kxvsm2yrdqhas72fj5v2kbd4 (default)",
      LINK_TTL_HOURS: process.env.LINK_TTL_HOURS || "48 (default)",
    },
  });
}
