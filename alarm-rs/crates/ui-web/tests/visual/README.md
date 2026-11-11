# ui-web visual and widget tests

```bash
npm install                # playwright 1.65 (WebKit), pixelmatch, pngjs
npx playwright install webkit
node run.mjs --build       # trunk build, then 36 screens + widget checks; exit 1 on failure
node run.mjs --only 03,16  # some screens
node run.mjs --no-shim     # without the backdrop-filter shim (see below)
node make-fixtures.mjs     # regenerate ../../fixtures/*.json
```

- Headless WebKit, 1100×820, scale 2, UTC, frozen clock (`&now=`), fake daemon (`?fixture=`).
- Masked: the toolbar clock, the big time on the ringing screen, and in 30/36 everything from
  RELIABILITY down (differs from the web reference on purpose); 30/36 compare the first 1100×820 window.
- Headless WebKit does not paint `backdrop-filter` into screenshots; `&shim=backdrop` blurs the
  content behind an overlay with `filter` instead (CSS in `styles/animations.css`, test-only).
- Output: `out/actual`, `out/diff`, `out/other-theme`, `out/gallery.png`.
