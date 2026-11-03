import test from 'node:test';
import assert from 'node:assert/strict';
import { adsenseClient, adsTxt, validateAdsense } from '../scripts/adsense.mjs';

const client = 'ca-pub-1234567890123456';
const text = 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n';
const html = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>`;

test('ad-free builds remain supported and whitespace is normalised', () => {
  assert.equal(adsenseClient(), '');
  assert.equal(adsTxt(''), '');
  assert.equal(adsenseClient(` ${client}\n`), client);
  assert.equal(adsTxt(client), text);
});

test('malformed publisher IDs fail instead of emitting invalid ads.txt', () => {
  for (const value of ['pub-1234567890123456', 'ca-pub-123', 'ca-pub-XXXXXXXXXXXXXXXX', `${client}x`]) {
    assert.throws(() => adsenseClient(value), /ADSENSE_CLIENT/);
  }
});

test('production check accepts matching publisher and a trailing CRLF', () => {
  validateAdsense({ client, text: text.trim() + '\r\n', html });
});

test('production check rejects missing configuration, wrong publisher, HTML and missing loader', () => {
  for (const input of [
    { client: '', text, html },
    { client, text: text.replace('1234567890123456', '9999999999999999'), html },
    { client, text: '<html>Not found</html>', html },
    { client, text, html: html.replace(client, 'ca-pub-9999999999999999') },
    { client, text, html: '<html></html>' },
  ]) assert.throws(() => validateAdsense(input));
});
