import crypto from 'node:crypto';

export function buildIdKey({ provider, externalRef, rawText, occurredAtIso }) {
  if (externalRef && externalRef.length > 0) {
    return `${provider}:${externalRef}`;
  }
  const base = `${provider}|${rawText}|${occurredAtIso}`;
  const hash = crypto.createHash('sha256').update(base).digest('hex');
  return hash;
}

