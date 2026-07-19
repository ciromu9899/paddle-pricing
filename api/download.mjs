// api/download.js  —  Vercel Node serverless function
// Verifies a signed, time-limited token, then streams the private file to the buyer.
//
// Required env vars:
//   DOWNLOAD_SECRET   same secret used by paddle-webhook.js
//   FILE_SOLO_URL     private (unlisted) URL of the Solo build .zip
//   FILE_FIRM_URL     private (unlisted) URL of the Firm build .zip
// Optional:
//   FILE_SOLO_NAME (default ClauseLens-Solo.zip)   FILE_FIRM_NAME (default ClauseLens-Firm.zip)

import crypto from "node:crypto";

function b64urlToBuf(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(s + "=".repeat((4 - (s.length % 4)) % 4), "base64");
}

export default async function handler(req, res) {
  try {
    const { d, s } = req.query;
    if (!d || !s) return res.status(400).end("Missing token");

    const expected = crypto.createHmac("sha256", process.env.DOWNLOAD_SECRET).update(d).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(String(s));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).end("Invalid link");
    }

    const payload = JSON.parse(b64urlToBuf(d).toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) {
      return res.status(410).end("This link has expired. Reply to your purchase email for a fresh one.");
    }

    const isFirm = payload.p === "firm";
    const src = isFirm ? process.env.FILE_FIRM_URL : process.env.FILE_SOLO_URL;
    const name = isFirm
      ? process.env.FILE_FIRM_NAME || "ClauseLens-Firm.zip"
      : process.env.FILE_SOLO_NAME || "ClauseLens-Solo.zip";
    if (!src) return res.status(500).end("File not configured");

    const upstream = await fetch(src);
    if (!upstream.ok || !upstream.body) return res.status(502).end("Upstream file unavailable");

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Cache-Control", "no-store");
    const len = upstream.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);

    // Stream the upstream body to the client (Node 18+ web stream -> Node stream).
    const { Readable } = await import("node:stream");
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error("download error", err);
    return res.status(500).end("error");
  }
}
