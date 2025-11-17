import crypto from 'node:crypto';
import { ENV } from '../env.js';

export function verifyHmac(bodyRaw, providedSignature, secret) {
  if (!providedSignature) return false;
  const h = crypto.createHmac('sha256', secret).update(bodyRaw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(providedSignature));
}

export function isFresh(timestampMs) {
  const skew = ENV.HMAC_SKEW_SECONDS * 1000;
  return Math.abs(Date.now() - Number(timestampMs)) <= skew;
}

