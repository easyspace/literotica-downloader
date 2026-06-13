# Literotica Downloader V2

Download complete author libraries from Literotica from author and member listing pages. The current release uses direct site HTML parsing rather than the old `/api/3/` flow and supports filtered selection, combined or separate exports, and branded `HTML`, `EPUB`, `TXT`, and `ZIP` output.

## Current release
- Version: `2.1.5`
- Primary target: Firefox + Greasemonkey
- Secondary target: Chrome + Tampermonkey

## Install
- SleazyFork listing: https://sleazyfork.org/en/scripts/577945-literotica-downloader-v2
- Firefox + Greasemonkey local file: `dist/literotica-downloader-greasemonkey.user.js`
- Chrome + Tampermonkey local file: `dist/literotica-downloader-tampermonkey.user.js`

## What it does
- Adds a downloader panel to Literotica author pages and member story listing pages.
- Reads author catalog pages directly from the site when the old API paths are unavailable.
- Lets you search, filter, sort, and bulk-select stories before export.
- Supports `HTML`, `EPUB`, `TXT`, and `ZIP Package` outputs.
- Supports `Combined Files` and `Separate Chapters` export structure.
- Adds Easy Space Studios footer branding to exported reading files.
- Includes a `Stop Download` button to abort a running job cleanly.

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
- `HTML`: reader-friendly file with title, story content, and Easy Space Studios footer.
- `EPUB`: export-ready ebook with footer branding in the book content.
- `TXT`: plain text export with ASCII footer branding.
- `ZIP Package`: package containing selected export formats plus `index.html` and `manifest.json`.

## Notes
- Selection shortcuts like `Select All`, `★ 4.0+`, `Standalones`, and `Series` operate on the filtered/search-visible list.
- At least one content format always remains enabled.
- Download speed depends on story size, page count, and network conditions.
- This script is for personal-use downloading and organization. It does not bypass paywalls.

## Release docs
- Changelog: [CHANGELOG.md](D:\Desktop\literotica-author-library-downloader\CHANGELOG.md)
- SleazyFork upload notes: [SLEAZYFORK_SUBMISSION.md](D:\Desktop\literotica-author-library-downloader\SLEAZYFORK_SUBMISSION.md)

## Support
- Homepage: https://studios.easyspace.in
- Support: https://studios.easyspace.in

## License
All Rights Reserved. No redistribution or rehosting without explicit permission.
