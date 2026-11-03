// Shared build-time validation; an unset client is allowed for ad-free local builds.
import assert from 'node:assert/strict';

export function adsenseClient(value = '') {
  const client = value.trim();
  if (client && !/^ca-pub-\d{16}$/.test(client)) {
    throw new Error('ADSENSE_CLIENT must be ca-pub- followed by exactly 16 digits');
  }
  return client;
}

export function adsTxt(client) {
  client = adsenseClient(client);
  return client ? `google.com, ${client.slice(3)}, DIRECT, f08c47fec0942fa0\n` : '';
}

export function validateAdsense({ client, text, html }) {
  client = adsenseClient(client);
  assert.ok(client, 'ADSENSE_CLIENT is required for the production AdSense check');
  assert.equal(text.trim(), adsTxt(client).trim(), 'ads.txt must authorise the configured publisher');
  assert.ok(html.includes(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}"`),
    'homepage must load AdSense with the same publisher as ads.txt');
}
