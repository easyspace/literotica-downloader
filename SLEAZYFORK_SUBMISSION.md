# SleazyFork submission notes (Literotica Downloader V2)

## Release target
- Version: `2.1.6`
- Recommended upload order: Firefox + Greasemonkey first, Chrome + Tampermonkey second as a separate listing.

## Upload these files
- Firefox + Greasemonkey: `D:\Desktop\literotica-author-library-downloader\dist\literotica-downloader-firefox-greasemonkey.user.js`
- Chrome + Tampermonkey: `D:\Desktop\literotica-author-library-downloader\dist\literotica-downloader-chrome-tampermonkey.user.js`

## Screenshots to upload (3)
- `D:\Desktop\Main.jpg` (script panel highlighted on an author page)
- `D:\Desktop\01.jpg` (selected stories + enabled download button)
- `D:\Desktop\02.jpg` (another author page example)

## Suggested "Additional info" (Markdown)
### What it does
- Adds a "Literotica Downloader v2" panel to Literotica author pages and member story listing pages.
- Reads author listings and story pages directly from Literotica when API routes are unavailable.
- Lets you filter/select stories and export as:
  - ZIP Package
  - EPUB
  - HTML
  - TXT
- Lets you choose whether exports are generated as combined files or separate chapter files.
- Includes a stop button for cancelling long-running downloads.
- Handles large author catalogs that require embedded page-data parsing beyond the initial visible listing.
- Adds branded Easy Space Studios footer text to exported reading files.

### How to use
- Open an author page on Literotica (example: `https://www.literotica.com/authors/...`).
- Use the panel on the right side to:
  - Search/filter (title search, category, rating, type, sort)
  - Select stories from the visible filtered results (Select All / Deselect All / Series / Standalones / 4.0+, etc.)
  - Choose an export format (HTML / EPUB / TXT / ZIP Package)
  - Choose a file structure (Combined Files / Separate Chapters)
  - Click the download button (e.g. "Download X Selected")

### Notes / limitations
- Download speed depends on story size, page count, and your network.
- This script is for personal use and does not bypass paywalls.

### Privacy / tracking
- No tracking, ads, miners, or telemetry.

### Support
- Homepage/Support: https://studios.easyspace.in
