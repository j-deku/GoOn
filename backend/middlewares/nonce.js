// middleware/nonce.js
import crypto from "crypto";

export function nonceMiddleware(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
}
