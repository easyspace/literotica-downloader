# Changelog

## 2.1.28 / 2.1.29 - 2026-06-30

This release adds canonical story/chapter ordering so the visible list, bulk selection actions, and exported files all follow the same chapter-aware sequence.

### Fixed
- Added a `Story / Chapter Order` sort mode for multipart titles that need chapter sequencing before selection.
- Made download fetch order follow the active canonical sort order instead of rebuilding selection order from the raw grouped catalog.
- Preserved official series chapter order first, while adding title-based fallback sequencing for non-series multipart story families.
- Kept combined and separate exports aligned with the same canonical ordered story list.

### Changed
- Published the chapter-ordering fix as new debug versions `2.1.28` and `2.1.29`.

## 2.1.26 / 2.1.27 - 2026-06-29

This release extends the sanitized story-body fix into EPUB so affected multi-page stories no longer flatten page 1 in ebook exports while HTML and EPUB stay on the same cleaned content source.

### Fixed
- Made `EPUB` prefer the same sanitized rendered story-body fragment already used by the repaired `HTML` export path.
- Fixed page-1 paragraph loss in `EPUB` for affected multi-page stories such as `roofer-can-take-it`.
- Kept stray Literotica layout and UI markup out of EPUB content by reusing the constrained semantic fragment instead of raw page DOM.

### Changed
- Published the EPUB follow-up as new debug versions `2.1.26` and `2.1.27`.
- Kept `TXT` unchanged on its current path.

## 2.1.24 / 2.1.25 - 2026-06-29

This release keeps the restored rollback checkpoint intact and fixes the HTML-only page-1 paragraph loss on affected multi-page stories such as `roofer-can-take-it`.

### Fixed
- Made `HTML` prefer a sanitized rendered story-body fragment from the fetched page when Literotica's embedded `pageText` flattens page 1 into a wall of text.
- Removed layout-bearing attributes and nearby site UI from the HTML story-body extraction path so downloaded files do not pick up report, bookmark, or share artifacts.
- Kept single-story and combined `HTML` exports on the same repaired page-content source.

### Changed
- Left `TXT` and `EPUB` on their existing text-oriented content path for this pass.
- Published the HTML-only repair as new debug versions `2.1.24` and `2.1.25`.

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
