# Changelog

## 2.1.22 / 2.1.23 - 2026-06-29

This release rolls back the broken `2.1.20 / 2.1.21` raw-markup experiment after it introduced overlapping and garbled text in `HTML` and `EPUB` exports.

### Fixed
- Restored the last non-garbled shared export logic from the pre-regression state.
- Removed the `HTML` and `EPUB` overlap bug introduced by passing too much Literotica page markup directly into offline exports.
- Removed stray site UI contamination from the regressed export path, including cases where non-story controls could bleed into downloaded output.
- Kept `TXT` unchanged on the existing working path.

### Changed
- Published the rollback as new debug versions instead of reusing prior version numbers.
- Deferred any new rendered-markup export path until it can be constrained to semantic story content safely.

## 2.1.20 / 2.1.21 - 2026-06-29

This release removes a stale local patch backup and fixes the mixed formatting path that was flattening page 1 of some multi-page stories in HTML and EPUB while later pages still rendered correctly.

### Fixed
- Removed the stray `backup-2.1.15.patch` workspace file.
- Fixed the shared story fetcher so multi-page stories such as `roofer-can-take-it` no longer export page 1 as a wall of text in `HTML`.
- Fixed the same shared-content regression in `EPUB`, where page 1 could flatten while later pages preserved paragraphs.
- Kept `TXT` on its existing text-oriented path so the working plain-text output stays unchanged.

### Changed
- Stored both rendered story markup and plain-text fallback during page fetches instead of forcing all export formats through one flattened content field.
- Made `HTML` and `EPUB` prefer the rendered story-body markup from the fetched page DOM, while retaining embedded `pageText` as a fallback when rendered markup is unavailable.

## 2.1.12 - 2026-06-20

This release switches story exports to rendered-page markup first, improves the standalone HTML reader on phones, and hardens EPUB generation so malformed story fragments fail fast instead of producing unreadable books.

### Fixed
- Preserved paragraph and line-break structure by extracting rendered story content from the Literotica page before falling back to embedded story markup.
- Fixed the exported HTML "wall of text" regression by keeping story markup as HTML fragments instead of rebuilding from aggressively normalized text.
- Improved mobile HTML readability so exported files open cleanly on narrow screens without desktop-site mode.
- Fixed EPUB generation failures caused by malformed or unsupported story markup by converting export content through an XHTML-safe serializer.
- Added EPUB validation checks for `container.xml`, section XHTML, `content.opf`, and `toc.ncx` before packaging.

### Changed
- Made the rendered story DOM the primary source for exported story content, with embedded `pageText` kept only as a fallback path.
- Updated the HTML reader layout to use a mobile-first paper layout with lighter spacing and safer typography.
- Removed the invalid EPUB cover metadata reference that pointed at a non-image manifest entry.
- Added an in-app fixture harness that generates deterministic sample HTML, TXT, and EPUB outputs from the current userscript builders for repeatable regression testing.

## 2.1.6 - 2026-06-14

This release keeps the Firefox + Greasemonkey path stable and adds the Chrome + Tampermonkey packaging fixes needed for large TXT ZIP exports.

### Fixed
- Replaced broken `/api/3/` author and story retrieval with direct author-page and story-page HTML parsing.
- Restored reliable catalog loading on author story pages where API endpoints were returning `404`.
- Restored reliable story-content downloads for single stories and bulk runs.
- Removed regressions that were causing empty or error-only exported files.
- Fixed large-author catalog undercounting by reading embedded page data when the visible listing stops at the initial loaded set.
- Fixed Chrome + Tampermonkey ZIP packaging hangs for `TXT + ZIP Package` exports by replacing the fragile shared path with a store-only archive writer.
- Fixed packaging progress visibility during ZIP creation so long-running archive builds no longer look frozen.
- Fixed abort handling during ZIP packaging so cancellation can stop archive work cleanly.

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
- Renamed local release artifacts to explicit browser-specific names:
  - `dist/literotica-downloader-firefox-greasemonkey.user.js`
  - `dist/literotica-downloader-chrome-tampermonkey.user.js`
- Renamed maintained userscript copies to explicit browser-specific names:
  - `userscript/literotica-downloader-firefox-greasemonkey.user.js`
  - `userscript/literotica-downloader-chrome-tampermonkey.user.js`
  - `userscript/firefox-greasemonkey.user.js`

### Notes
- Firefox + Greasemonkey and Chrome + Tampermonkey are both validated for this release.
- Firefox is the existing release path; Chrome is ready for a separate SleazyFork listing using the browser-specific artifact.
