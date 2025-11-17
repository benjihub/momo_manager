// Template connector which polls a REST API and normalizes records.
// For demos, if config.baseUrl starts with "mock:", it returns synthetic data.

export const key = 'generic-rest';

export async function fetchSince({ config, sinceIso, untilIso }) {
  const baseUrl = config?.baseUrl || '';
  const apiKey = config?.apiKey || '';

  // Demo mode
  if (baseUrl.startsWith('mock:')) {
    const now = new Date();
    return [
      {
        provider: 'EXT_GENERIC',
        direction: 'deposit',
        amount: 10000,
        currency: 'UGX',
        from_msisdn: '+256700000001',
        to_msisdn: '+256700000009',
        external_ref: `DEMO-${now.getTime()}`,
        occurred_at: now.toISOString(),
        raw_text: 'Mock deposit'
      }
    ];
  }

  // Real implementation (placeholder safe call): only proceed if baseUrl provided
  if (!baseUrl) return [];

  const url = new URL('/transactions', baseUrl);
  url.searchParams.set('since', sinceIso);
  url.searchParams.set('until', untilIso);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Connector HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((it) => ({
    provider: it.provider || 'EXT_GENERIC',
    direction: it.direction,
    amount: Number(it.amount),
    currency: it.currency || 'UGX',
    from_msisdn: it.from || it.from_msisdn,
    to_msisdn: it.to || it.to_msisdn,
    external_ref: it.external_ref || it.id,
    occurred_at: it.occurred_at || it.timestamp,
    raw_text: it.raw_text || JSON.stringify(it)
  }));
}

export async function testConnection(config) {
  // In demo, always ok
  if ((config?.baseUrl || '').startsWith('mock:')) return { ok: true };
  if (!config?.baseUrl) return { ok: false, error: 'Missing baseUrl' };
  try {
    const res = await fetch(config.baseUrl, { method: 'HEAD' });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export default { key, fetchSince, testConnection };

