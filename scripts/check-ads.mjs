// Run after a production build; fail deployment if publisher configuration disappears.
import { readFile } from 'node:fs/promises';
import { validateAdsense } from './adsense.mjs';

const dist = new URL('../dist/', import.meta.url);
validateAdsense({
  client: process.env.ADSENSE_CLIENT || '',
  text: await readFile(new URL('ads.txt', dist), 'utf8'),
  html: await readFile(new URL('index.html', dist), 'utf8'),
});
console.log('AdSense checks passed: ads.txt and homepage use the configured publisher.');
