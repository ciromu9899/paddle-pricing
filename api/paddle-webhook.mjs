// api/paddle-webhook.js  —  Vercel Node serverless function
// Paddle Billing fulfillment: verify -> identify product -> email a signed, time-limited link.
//
// Required env vars (see README-fulfillment.md):
//   PADDLE_WEBHOOK_SECRET   secret from the Paddle notification destination
//   PADDLE_API_KEY          Paddle API key (used to look up the buyer's email)
//   DOWNLOAD_SECRET         random string used to sign download links
//   RESEND_API_KEY          Resend API key for sending mail
//   FROM_EMAIL              e.g. "ClauseLens <no-reply@gipan-bite.tech>"
//   BASE_URL                e.g. "https://gipan-bite.tech"
// Optional:
//   PRICE_SOLO   (default: live Solo price id)   PRICE_FIRM (default: live Firm price id)
//   LINK_TTL_HOURS (default: 48)
//   PADDLE_API_BASE (default: https://api.paddle.com)

import crypto from "node:crypto";

export const config = { api: { bodyParser: false } };

const PRICE_SOLO = process.env.PRICE_SOLO || "pri_01kxv0v76x1er5chx2hxgm0xqn";
const PRICE_FIRM = process.env.PRICE_FIRM || "pri_01ky03zsp0qs830g7ax77ze33s";
const TTL_HOURS = Number(process.env.LINK_TTL_HOURS || 48);
const PADDLE_API_BASE = process.env.PADDLE_API_BASE || "https://api.paddle.com";

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Paddle-Signature: "ts=1700000000;h1=abcdef..."
function verifyPaddle(rawBody, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(";").map((kv) => kv.split("=")));
  if (!parts.ts || !parts.h1) return false;
  const signed = `${parts.ts}:${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.h1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signLink(product, email) {
  const payload = base64url(JSON.stringify({ p: product, e: email, exp: Date.now() + TTL_HOURS * 3600e3 }));
  const sig = crypto.createHmac("sha256", process.env.DOWNLOAD_SECRET).update(payload).digest("hex");
  return `${process.env.BASE_URL}/api/download?d=${payload}&s=${sig}`;
}

function productFromItems(items = []) {
  const ids = items.map((it) => it?.price?.id).filter(Boolean);
  if (ids.includes(PRICE_FIRM)) return "firm";
  if (ids.includes(PRICE_SOLO)) return "solo";
  return null;
}

async function lookupEmail(customerId) {
  if (!customerId || !process.env.PADDLE_API_KEY) return null;
  const r = await fetch(`${PADDLE_API_BASE}/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}` },
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.data?.email || null;
}

async function sendEmail(to, product, link) {
  const label = product === "firm" ? "ClauseLens Firm" : "ClauseLens Solo";
  const html = `<p>Thank you for your purchase of <strong>${label}</strong>.</p>
<p>Download your copy here (link valid for ${TTL_HOURS} hours):</p>
<p><a href="${link}">${link}</a></p>
<p>Keep this email — you can re-request a fresh link any time by replying.</p>
<p>— ClauseLens</p>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.FROM_EMAIL, to, subject: `Your ${label} download`, html }),
  });
  if (!r.ok) throw new Error(`Resend failed: ${r.status} ${await r.text()}`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");
  try {
    const raw = await readRaw(req);
    if (!verifyPaddle(raw, req.headers["paddle-signature"], process.env.PADDLE_WEBHOOK_SECRET)) {
      return res.status(401).end("Invalid signature");
    }
    const evt = JSON.parse(raw.toString("utf8"));

    // Fulfill only on a completed/paid transaction.
    if (evt.event_type !== "transaction.completed" && evt.event_type !== "transaction.paid") {
      return res.status(200).end("ignored");
    }

    const data = evt.data || {};
    const product = productFromItems(data.items);
    if (!product) return res.status(200).end("no matching product");

    const email = data?.customer?.email || (await lookupEmail(data.customer_id));
    if (!email) {
      console.error("No email resolvable for transaction", data.id);
      return res.status(200).end("no email"); // 200 so Paddle does not retry forever; investigate via logs
    }

    await sendEmail(email, product, signLink(product, email));
    return res.status(200).end("fulfilled");
  } catch (err) {
    console.error("webhook error", err);
    return res.status(500).end("error"); // 5xx -> Paddle will retry
  }
}
