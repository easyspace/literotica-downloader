# Changelog

## 2.1.5 - 2026-06-14

This release is the current Firefox-ready restore point and the recommended build for SleazyFork upload.

### Fixed
- Replaced broken `/api/3/` author and story retrieval with direct author-page and story-page HTML parsing.
- Restored reliable catalog loading on author story pages where API endpoints were returning `404`.
- Restored reliable story-content downloads for single stories and bulk runs.
- Removed regressions that were causing empty or error-only exported files.

### Changed
- Added explicit `TXT` export support alongside `HTML` and `EPUB`.
- Kept one content format selected at all times instead of allowing the format controls to reach an invalid state.
- Made `Combined Files` a first-class export structure choice in the UI.
- Updated selection actions so they operate on the currently filtered/search-visible results instead of the full original catalog.
- Added on-panel version visibility through runtime logging and current build versioning.

### Added
- Added branded footer output for `HTML`, `EPUB`, and `TXT` exports.
- Added a lightweight `Stop Download` / abort flow for in-progress downloads.
- Added `TXT` links to packaged ZIP output and package index pages.

### Packaging
- Rebuilt release artifacts:
  - `dist/literotica-downloader-greasemonkey.user.js`
  - `dist/literotica-downloader-tampermonkey.user.js`
- Rebuilt maintained userscript copies in `userscript/`.

### Notes
- Firefox + Greasemonkey is the primary validated path for this release.
- Chrome + Tampermonkey artifact is still generated, but this release package is being documented first for the Firefox path.
