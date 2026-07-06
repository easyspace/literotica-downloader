# Literotica Downloader V2

Release documentation for Literotica Downloader V2. The current release keeps the restored rollback baseline intact, adds canonical story/chapter ordering, and makes the downloader panel usable on shorter windows and smaller monitors.

## Current release
- Firefox version: `2.1.30`
- Chrome version: `2.1.31`
- Firefox target: Greasemonkey
- Chrome target: Tampermonkey

## Install
- SleazyFork listing: https://sleazyfork.org/en/scripts/577945-literotica-downloader-v2
- Firefox + Greasemonkey local upload file: `dist/literotica-downloader-firefox-greasemonkey.user.js`
- Chrome + Tampermonkey local upload file: `dist/literotica-downloader-chrome-tampermonkey.user.js`
- Firefox maintained local copy: `userscript/literotica-downloader-firefox-greasemonkey.user.js`
- Chrome maintained local copy: `userscript/literotica-downloader-chrome-tampermonkey.user.js`

## Dist naming policy
- Current canonical last-known-good `dist` baselines are:
  - `dist/literotica-downloader-firefox-greasemonkey.user.js` at `2.1.28`
  - `dist/literotica-downloader-chrome-tampermonkey.user.js` at `2.1.29`
- Working-source bug fixing resumes from those restored `dist` baselines.
- Retain backup copies for every version edit for both Firefox and Chrome builds, using incremented versioned filenames such as `2.1.12`, `2.1.13`, and later.
- Keep the unversioned browser-specific filenames in `dist` as the latest working release artifacts unless the release workflow changes deliberately.
- Archived versioned userscripts are stored under `userscript/archive/` and republished back into `dist/` on each build so Vite clean builds do not erase rollback artifacts.

## What it does
- Adds a downloader panel to Literotica author pages and member story listing pages.
- Reads author catalog pages directly from the site when the old API paths are unavailable.
- Lets you search, filter, sort, and bulk-select stories before export.
- Supports `HTML`, `EPUB`, `TXT`, and `ZIP Package` outputs.
- Supports `Combined Files` and `Separate Chapters` export structure.
- Adds Easy Space Studios footer branding to exported reading files.
- Includes a `Stop Download` button to abort a running job cleanly.
- Adds a chapter-aware `Story / Chapter Order` sort mode so multipart titles can be selected and exported in canonical order.
- Adds a compact-height panel mode so the story list stays reachable on resized desktop windows and smaller displays.

## Browser release scope
- Firefox + Greasemonkey is the established release path.
- Chrome + Tampermonkey uses a browser-specific build artifact and should be published as its own listing.
- Local filenames include browser and userscript-manager targets explicitly.

## Usage
1. Open a Literotica author page such as `https://www.literotica.com/authors/<author>/works/stories`.
2. Wait for the panel to load the full catalog.
3. Use search, category, rating, type, and sort filters.
4. Use the selection controls to act on the currently visible results.
5. Choose one content format: `HTML`, `EPUB`, or `TXT`.
6. Optionally leave `ZIP Package` enabled if you want one packaged download.
7. Choose `Combined Files` or `Separate Chapters`.
8. Click `Download`.

## Output behavior
- `HTML`: mobile-friendly reader file that prefers a sanitized rendered story-body fragment when available, with embedded `pageText` retained as a fallback.
- `EPUB`: export-ready ebook that now uses the same sanitized rendered story-body fragment when available, with embedded `pageText` retained as a fallback.
- `TXT`: plain text export with ASCII footer branding.
- `ZIP Package`: package containing selected export formats plus `index.html` and `manifest.json`.
- Panel layout: the story list remains the primary scroll region, while secondary sections can collapse automatically in compact-height mode.

## Notes
- Selection shortcuts like `Select All`, `★ 4.0+`, `Standalones`, and `Series` operate on the filtered/search-visible list.
- At least one content format always remains enabled.
- Download speed depends on story size, page count, and network conditions.
- This script is for personal-use downloading and organization. It does not bypass paywalls.

## Fixture harness
- The app includes a `Fixture Harness` tab for repeatable export regression checks.
- It boots the current userscript template in a hidden iframe and runs the real `HTML`, `TXT`, and `EPUB` builders against deterministic sample story data.
- Use it after changing story extraction, export CSS, text conversion, or EPUB packaging to regenerate known sample files for desktop, Android, and reader-app checks.

## Release docs
- Changelog: [CHANGELOG.md](D:\Desktop\literotica-author-library-downloader\CHANGELOG.md)
- SleazyFork upload notes: [SLEAZYFORK_SUBMISSION.md](D:\Desktop\literotica-author-library-downloader\SLEAZYFORK_SUBMISSION.md)

## Support
- Homepage: https://studios.easyspace.in
- Support: https://studios.easyspace.in

## License
All Rights Reserved. No redistribution or rehosting without explicit permission.
