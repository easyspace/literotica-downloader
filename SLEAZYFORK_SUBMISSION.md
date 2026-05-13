# SleazyFork submission notes (Literotica Downloader V2)

## Upload this file
- `D:\Desktop\literotica-author-library-downloader\dist\greasemonkey.user.js`

## Screenshots to upload (3)
- `D:\Desktop\Main.jpg` (script panel highlighted on an author page)
- `D:\Desktop\01.jpg` (selected stories + enabled download button)
- `D:\Desktop\02.jpg` (another author page example)

## Suggested "Additional info" (Markdown)
### What it does
- Adds a "Literotica Downloader v2" panel to Literotica author pages and member story listing pages.
- Fetches an author's stories using Literotica's `/api/3/` endpoints with retry + rate limiting.
- Lets you filter/select stories and export as:
  - ZIP (HTML files inside)
  - EPUB
  - HTML

### How to use
- Open an author page on Literotica (example: `https://www.literotica.com/authors/...`).
- Use the panel on the right side to:
  - Search/filter (title search, category, rating, type, sort)
  - Select stories (Select All / Deselect All / Series / Standalones, etc.)
  - Choose an export format (HTML / EPUB / ZIP Package)
  - Click the download button (e.g. "Download X Selected")

### Notes / limitations
- Download speed depends on Literotica API rate limits and your network.
- This script is for personal use and does not bypass paywalls.

### Privacy / tracking
- No tracking, ads, miners, or telemetry.

### Support
- Homepage/Support: https://studios.easyspace.in
