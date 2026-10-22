# aiticker on Google Play

The Android app is a Trusted Web Activity (TWA): a small wrapper that opens https://aiticker.site/ full-screen in Chrome. Site deploys update the app instantly. Rebuild and re-upload only if the app shell changes (name, icon, colours, package version).

| | |
|---|---|
| Package name | `io.github.aiidenews.aiticker` (permanent once uploaded) |
| Launch URL | `/?source=twa` (the ad-blocker wall is skipped in the app; see `src/app.js`) |
| Bubblewrap config | `twa/twa-manifest.json` (only this file is committed; the rest of `twa/` is generated) |
| Upload key | `keystore/upload.jks` + `keystore/README-SECRET.txt` (git-ignored, **back these up**) |
| Digital Asset Links | built into `/.well-known/assetlinks.json` from `ANDROID_APP` in `scripts/build.mjs` |
| Store listing | `store/listing.md` + graphics in `store/` |

## 1. One-time Play Console setup
1. Create a developer account at https://play.google.com/console ($25 one-time, identity verification).
2. **Create app** → name `aiticker: AI News & Models`, App, Free, accept declarations.

## 2. Upload the bundle (closed test first)
Personal accounts created after November 2023 must run a **closed test with at least 12 testers for 14 continuous days** before production access.
1. Testing → Closed testing → Create track → Create release.
2. Choose **Google Play App Signing** (default), then upload `release/app-release-bundle.aab`.
3. Add testers by email list or Google Group (12+), roll out, and send them the opt-in link.

## 3. Add Play's signing fingerprint (do not skip)
Play re-signs the app with its own key, so the site must trust that key too, or the app shows a browser address bar.
1. Play Console → Test and release → App integrity → App signing → copy **App signing key certificate, SHA-256**.
2. Add it to `ANDROID_APP.sha256` in `scripts/build.mjs` (next to the upload key) and push.
3. Check https://aiticker.site/.well-known/assetlinks.json lists both fingerprints.

## 4. App content forms (Policy → App content)
- **Privacy policy:** https://aiticker.site/privacy/
- **Ads:** Yes, contains ads (Google AdSense on the web content).
- **App access:** All functionality available without special access.
- **Content rating:** questionnaire → category "Reference, News, or Educational"; answer No to violence, sexual content, profanity, drugs, gambling, user interaction/sharing, and location sharing. Expected rating: Everyone / PEGI 3.
- **Target audience:** 18 and over (keeps it out of the Families policy, which restricts ads).
- **News apps:** declare it's a news app if you chose News & Magazines; publisher = Abdullah ElTiby, sources are listed on each item.
- **Data safety** (ads and analytics run inside the web content, so declare them):
  - Data collected: *Yes*. Shared: *Yes* (with Google for ads).
  - Device or other IDs: collected + shared, purpose *Advertising or marketing*.
  - App interactions: collected, purposes *Analytics*, *Advertising or marketing*.
  - Approximate location (derived from IP): collected + shared, purpose *Advertising or marketing*, *Analytics*.
  - Collection is not optional (part of the site); data is encrypted in transit: *Yes*.
  - Deletion requests: no accounts, so no user data is stored by the developer. Point to the privacy page.
- **Government apps / Financial features / Health:** No.

## 5. Store listing
Paste the text from `store/listing.md` and upload the graphics from `store/`.

## 6. Production
After 14 days of closed testing: Dashboard → Apply for production → answer the testing questionnaire → create a production release with the same bundle.

## Rebuilding the app (new version)
Bump `appVersionCode` (+1) and `appVersionName` in `twa/twa-manifest.json`, then:

```bash
cd play/twa && npx @bubblewrap/cli@1.25.0 update --skipVersionUpgrade
```

Bubblewrap's own `build` step can't start Gradle on this machine (the cmd shell here doesn't search the current folder), so build and sign directly. Run this from a path **without an apostrophe**, e.g. a copy of `play/` in a temp folder:

```bash
gradlew.bat bundleRelease assembleRelease
jarsigner -keystore ../keystore/upload.jks app/build/outputs/bundle/release/app-release.aab upload
```

Copy the signed `.aab` into `release/` and upload it as a new release.
