import { useState } from "react";
import { USERSCRIPT } from "./userscript";

// ─── Types ────────────────────────────────────────────────────
type Tab = "install" | "script" | "features" | "api" | "changelog";
type CopyState = "idle" | "copied" | "error";

// ─── Constants ────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "install", label: "Install Guide", icon: "🚀" },
  { id: "script", label: "Script Code", icon: "📋" },
  { id: "features", label: "Features", icon: "✨" },
  { id: "api", label: "API Reference", icon: "🔌" },
  { id: "changelog", label: "Changelog", icon: "📜" },
];

const FEATURES = [
  {
    icon: "🔍",
    title: "Smart Author Detection",
    desc: "Automatically detects Literotica author pages from the URL. Supports the modern /authors/username/works/* path structure. Case-sensitive username preservation.",
    badge: "Auto",
  },
  {
    icon: "📡",
    title: "Full Catalog Retrieval",
    desc: "Uses the /api/3/users/{author}/series_and_works endpoint with full pagination. Fetches every story — handles 100+ story authors with ease.",
    badge: "API v3",
  },
  {
    icon: "📚",
    title: "Series Grouping",
    desc: "Stories intelligently grouped into Standalone and Series collections. Chapter order preserved using series index metadata. Per-chapter or whole-series selection.",
    badge: "Smart",
  },
  {
    icon: "🎨",
    title: "Premium UI Panel",
    desc: "Fixed right-side panel with dark elegant theme. Category filter, rating threshold, title search, date/rating/alpha sorting. Fully scrollable with collapsible series.",
    badge: "Polished",
  },
  {
    icon: "📄",
    title: "Clean HTML Export",
    desc: "Archival-quality standalone HTML files. Metadata header, chapter separators, print-friendly CSS, sanitized filenames. Readable offline forever.",
    badge: "Archival",
  },
  {
    icon: "📱",
    title: "Real EPUB Export",
    desc: "Valid EPUB 2.0 structure with OPF manifest, NCX navigation, XHTML chapters, and cover page. Works with Kindle, Calibre, Apple Books, Moon+ Reader.",
    badge: "Valid",
  },
  {
    icon: "🗜️",
    title: "ZIP Package",
    desc: "Complete ZIP containing /html/, /epub/, index.html, manifest.json, errors.log, and optional /omnibus/ combined anthology. Named after the author.",
    badge: "Complete",
  },
  {
    icon: "🔄",
    title: "Retry Engine",
    desc: "Automatic exponential backoff on 429 rate limits, timeouts, and network failures. Max 3 retries. 300–500ms delay between requests. Failure isolation — one bad story never stops the batch.",
    badge: "Robust",
  },
  {
    icon: "💾",
    title: "Persistent Settings",
    desc: "Panel state, filter preferences, format toggles, and last selection saved to browser storage. Restores automatically on next visit. Feels like a real app.",
    badge: "Memory",
  },
  {
    icon: "📊",
    title: "Live Progress & Console",
    desc: "Real-time progress bar with story count labels. Scrollable log console showing all fetches, retries, warnings, errors, and completion summaries.",
    badge: "Transparent",
  },
];

const API_ENDPOINTS = [
  {
    method: "GET",
    path: "/api/3/users/{author}/series_and_works",
    params: '?params={"page":1,"pageSize":500,"type":"story","listType":"expanded"}',
    desc: "Fetch full author story catalog with series grouping. Paginate by incrementing page.",
    response: "Array of story/series objects with metadata",
    color: "#4ade80",
  },
  {
    method: "GET",
    path: "/api/3/users/{author}",
    params: '?params={"withProfile":false}',
    desc: "Author profile with story/poem/illustration counts",
    response: "{ name, username, stories_count, poems_count, ... }",
    color: "#60a5fa",
  },
  {
    method: "GET",
    path: "/api/3/stories/{slug}",
    params: '?params={"page":1}',
    desc: "Fetch story content page by page. Use story.pageText as canonical content.",
    response: "{ pageText: HTML, title, totalPages, ... }",
    color: "#f97316",
  },
];

const CHANGELOG = [
  {
    version: "2.0.0",
    date: "2025",
    type: "major",
    changes: [
      "Complete V2 rebuild — no legacy code",
      "Migrated from HTML scraping to /api/3/ JSON endpoints",
      "Real EPUB 2.0 generation (OPF + NCX + XHTML)",
      "ZIP package builder with /html/, /epub/, /omnibus/ folders",
      "Smart series grouping with chapter-level selection",
      "Exponential backoff retry engine",
      "Persistent settings via GM.setValue/GM.getValue",
      "Premium dark UI panel with filters, sorting, selection tools",
      "Live progress bar and scrollable log console",
      "Failure isolation — batch continues past individual errors",
    ],
  },
  {
    version: "1.x",
    date: "2020–2023",
    type: "legacy",
    changes: [
      "Original HTML scraping approach",
      "Broke when Literotica migrated to React SPA",
      "No longer maintained",
    ],
  },
];

// ─── Components ───────────────────────────────────────────────

function Badge({ text, color = "#7c3aed" }: { text: string; color?: string }) {
  return (
    <span
      style={{ background: color + "22", border: `1px solid ${color}44`, color }}
      className="text-xs px-2 py-0.5 rounded-full font-semibold tracking-wide"
    >
      {text}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "#4ade80",
    POST: "#f97316",
    PUT: "#60a5fa",
    DELETE: "#f87171",
  };
  const color = colors[method] || "#a78bfa";
  return (
    <span
      style={{ background: color + "22", border: `1px solid ${color}44`, color }}
      className="text-xs font-mono font-bold px-2 py-0.5 rounded"
    >
      {method}
    </span>
  );
}

function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
        state === "copied"
          ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
          : state === "error"
          ? "bg-red-500/20 border border-red-500/40 text-red-400"
          : "bg-violet-600/20 border border-violet-500/40 text-violet-300 hover:bg-violet-600/30"
      } ${className}`}
    >
      {state === "copied" ? (
        <>✓ Copied!</>
      ) : state === "error" ? (
        <>✗ Failed</>
      ) : (
        <>{label}</>
      )}
    </button>
  );
}

function InstallStep({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 mb-6">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-violet-300 font-bold text-sm mt-0.5">
        {num}
      </div>
      <div>
        <h3 className="text-white font-semibold mb-1">{title}</h3>
        <div className="text-slate-400 text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function CodeBlock({
  code,
  language = "text",
  copyable = true,
}: {
  code: string;
  language?: string;
  copyable?: boolean;
}) {
  return (
    <div className="relative group rounded-lg bg-slate-900/80 border border-slate-700/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50 bg-slate-800/50">
        <span className="text-slate-500 text-xs font-mono">{language}</span>
        {copyable && (
          <CopyButton text={code} label="📋 Copy" className="text-xs py-1 px-3" />
        )}
      </div>
      <pre className="p-4 overflow-x-auto text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto scrollbar-thin">
        {code}
      </pre>
    </div>
  );
}

// ─── Tab Panels ───────────────────────────────────────────────

function InstallTab() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-900/30 via-indigo-900/20 to-slate-900/30 border border-violet-500/20 p-6">
        <div className="flex items-start gap-4">
          <div className="text-4xl">📥</div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Literotica Downloader V2
            </h2>
            <p className="text-slate-400 leading-relaxed">
              A production-quality Greasemonkey userscript for downloading complete
              author libraries from Literotica. Uses the modern{" "}
              <code className="text-violet-400 bg-slate-800 px-1 rounded">/api/3/</code>{" "}
              JSON endpoints — no brittle HTML scraping.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge text="v2.0.0" color="#7c3aed" />
              <Badge text="Greasemonkey" color="#f97316" />
              <Badge text="API v3" color="#4ade80" />
              <Badge text="ZIP + EPUB + HTML" color="#60a5fa" />
            </div>
          </div>
        </div>
      </div>

      {/* Requirements */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h3 className="text-slate-200 font-semibold mb-3 flex items-center gap-2">
          <span>⚙️</span> Requirements
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              icon: "🐒",
              name: "Greasemonkey",
              desc: "Firefox userscript extension",
              url: "https://addons.mozilla.org/firefox/addon/greasemonkey/",
            },
            {
              icon: "🌐",
              name: "Modern Browser",
              desc: "Firefox 115+ recommended",
              url: null,
            },
            {
              icon: "📖",
              name: "Literotica Account",
              desc: "Not required, but improves rate limits",
              url: null,
            },
          ].map((r) => (
            <div
              key={r.name}
              className="rounded-lg bg-slate-900/50 border border-slate-700/40 p-3"
            >
              <div className="text-xl mb-1">{r.icon}</div>
              <div className="text-white font-medium text-sm">{r.name}</div>
              <div className="text-slate-500 text-xs mt-1">{r.desc}</div>
              {r.url && (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 text-xs hover:underline mt-1 block"
                >
                  Download →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Install Steps */}
      <div>
        <h3 className="text-slate-200 font-semibold mb-5 flex items-center gap-2">
          <span>📋</span> Installation Steps
        </h3>
        <InstallStep num={1} title="Install Greasemonkey">
          Visit{" "}
          <a
            href="https://addons.mozilla.org/firefox/addon/greasemonkey/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:underline"
          >
            Firefox Add-ons (Greasemonkey)
          </a>{" "}
          and install it in Firefox.
        </InstallStep>
        <InstallStep num={2} title="Open Greasemonkey">
          Click the Greasemonkey icon in the Firefox toolbar and open{" "}
          <strong className="text-white">New User Script</strong>.
        </InstallStep>
        <InstallStep num={3} title="Create a New Script">
          Click the{" "}
          <strong className="text-white">+</strong> button (or go to{" "}
          <strong className="text-white">Utilities → New Script</strong>) to open
          the script editor.
        </InstallStep>
        <InstallStep num={4} title="Paste the Script">
          Select and delete all existing content in the editor. Then click the{" "}
          <strong className="text-white">Script Code</strong> tab above, copy the
          entire script, and paste it into the Greasemonkey editor.
        </InstallStep>
        <InstallStep num={5} title="Save the Script">
          Press <kbd className="bg-slate-700 text-white px-1.5 py-0.5 rounded text-xs">Ctrl+S</kbd>{" "}
          (or <kbd className="bg-slate-700 text-white px-1.5 py-0.5 rounded text-xs">⌘S</kbd> on Mac)
          or click <strong className="text-white">File → Save</strong>.
        </InstallStep>
        <InstallStep num={6} title="Navigate to an Author Page">
          Visit any Literotica author page, for example:
          <div className="mt-2">
            <CodeBlock
              code="https://www.literotica.com/authors/Clohi/works/stories/all"
              language="url"
            />
          </div>
          The download panel will appear automatically on the right side.
        </InstallStep>
        <InstallStep num={7} title="Select and Download">
          Use the panel filters to browse stories, select what you want, choose your
          export format (HTML / EPUB / ZIP), then click{" "}
          <strong className="text-white">Download Selected Stories</strong>.
        </InstallStep>
      </div>

      {/* Supported Pages */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h3 className="text-slate-200 font-semibold mb-3">🎯 Supported URLs</h3>
        <div className="space-y-2">
          {[
            "https://www.literotica.com/authors/USERNAME/works/stories/all",
            "https://www.literotica.com/authors/USERNAME/works/series/all",
            "https://www.literotica.com/authors/USERNAME/works/stories",
            "https://www.literotica.com/authors/USERNAME",
            "https://www.literotica.com/stories/memberpage.php?uid=XXXXX",
          ].map((url) => (
            <div
              key={url}
              className="font-mono text-xs bg-slate-900/60 border border-slate-700/40 rounded px-3 py-2 text-slate-400"
            >
              <span className="text-emerald-500">✓</span>{" "}
              <span className="text-violet-300">{url}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <h3 className="text-amber-300 font-semibold mb-3 flex items-center gap-2">
          <span>⚠️</span> Known Limitations & Notes
        </h3>
        <ul className="space-y-2 text-sm text-slate-400">
          {[
            "Rate limiting: Literotica may temporarily block requests from large downloads. The retry engine handles this automatically with exponential backoff.",
            "Private/deleted stories will fail gracefully — the batch continues without them.",
            "EPUB output requires JSZip (loaded via @require). If it fails to load, ZIP generation won't work — check your Greasemonkey grants and network permissions.",
            "The API is undocumented by Literotica. Field names may change without notice. V2 uses flexible fallback field parsing.",
            "Very large libraries (500+ stories) may take several minutes — be patient and don't close the tab.",
            "The script injects a right-side panel. If page layout breaks, use the floating toggle button to collapse it.",
          ].map((note, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-amber-500/60 flex-shrink-0">•</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ScriptTab() {
  const lines = USERSCRIPT.split("\n").length;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <Badge text={`${lines} lines`} color="#7c3aed" />
          <Badge text={`${Math.round(USERSCRIPT.length / 1024)}KB`} color="#4ade80" />
          <Badge text="v2.0.0" color="#f97316" />
          <Badge text="ES2020+" color="#60a5fa" />
          <Badge text="IIFE Pattern" color="#a78bfa" />
        </div>
        <CopyButton
          text={USERSCRIPT}
          label="📋 Copy Entire Script"
          className="text-sm"
        />
      </div>

      {/* Architecture callout */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-900/10 p-5">
        <h3 className="text-violet-300 font-semibold mb-3">🏗 Architecture Modules</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          {[
            { name: "API Layer", desc: "fetchJSON + gmFetch" },
            { name: "Retry Engine", desc: "Exp. backoff, 3x retries" },
            { name: "Logger", desc: "Multi-listener event bus" },
            { name: "Settings", desc: "GM.setValue persistence" },
            { name: "Catalog Fetcher", desc: "Paginated API retrieval" },
            { name: "Series Grouper", desc: "Smart chapter grouping" },
            { name: "Story Fetcher", desc: "pageText extraction" },
            { name: "HTML Builder", desc: "Archival HTML output" },
            { name: "EPUB Builder", desc: "Valid EPUB 2.0 + JSZip" },
            { name: "ZIP Builder", desc: "Full package export" },
            { name: "State Manager", desc: "Reactive + filters" },
            { name: "UI Layer", desc: "Injected panel + events" },
          ].map((m) => (
            <div
              key={m.name}
              className="bg-slate-900/60 border border-slate-700/40 rounded p-2"
            >
              <div className="text-violet-300 font-semibold">{m.name}</div>
              <div className="text-slate-500">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* The full script */}
      <div className="rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/60 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
            </div>
            <span className="text-slate-400 text-xs font-mono">
              literotica-downloader-v2.user.js
            </span>
          </div>
          <CopyButton text={USERSCRIPT} label="Copy" className="text-xs py-1 px-3" />
        </div>
        <div className="bg-slate-950/80">
          <pre className="p-4 overflow-x-auto text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {USERSCRIPT}
          </pre>
        </div>
      </div>

      <div className="text-center">
        <CopyButton
          text={USERSCRIPT}
          label="📋 Copy Full Script to Clipboard"
          className="mx-auto text-sm px-6 py-3"
        />
      </div>
    </div>
  );
}

function FeaturesTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-5 hover:border-violet-500/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="text-white font-semibold">{f.title}</h3>
              </div>
              <Badge text={f.badge} color="#7c3aed" />
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Export formats deep dive */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        <h3 className="text-white font-bold text-lg mb-4">📦 Export Format Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: "🗜️",
              name: "ZIP Package",
              default: true,
              contents: [
                "/html/   — standalone HTML files",
                "/epub/   — EPUB files",
                "/omnibus/ — combined anthology",
                "index.html — browsable catalog",
                "manifest.json — metadata",
                "errors.log — failure report",
              ],
              note: "Default export. Complete collection in one file.",
            },
            {
              icon: "📄",
              name: "Clean HTML",
              default: false,
              contents: [
                "Self-contained single file",
                "Metadata header block",
                "Page separators",
                "Print-friendly CSS",
                "Sanitized filenames",
                "Offline-readable forever",
              ],
              note: "Archival format. Best for long-term storage.",
            },
            {
              icon: "📱",
              name: "EPUB 2.0",
              default: false,
              contents: [
                "Valid OPF package manifest",
                "NCX navigation document",
                "XHTML chapter files",
                "Generated cover page",
                "Embedded metadata",
                "Chapter TOC navigation",
              ],
              note: "Works with Kindle, Calibre, Apple Books, Moon+ Reader.",
            },
          ].map((fmt) => (
            <div
              key={fmt.name}
              className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{fmt.icon}</span>
                <h4 className="text-white font-semibold">{fmt.name}</h4>
                {fmt.default && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                    default
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-xs text-slate-400 font-mono mb-3">
                {fmt.contents.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-violet-500">›</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 italic">{fmt.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Reliability system */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        <h3 className="text-white font-bold text-lg mb-4">🛡 Reliability System</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
          {[
            { icon: "⏱", label: "Request Delay", value: "300–500ms" },
            { icon: "🔁", label: "Max Retries", value: "3 attempts" },
            { icon: "📈", label: "Backoff", value: "Exponential" },
            { icon: "🔒", label: "Failure Mode", value: "Isolated" },
          ].map((r) => (
            <div
              key={r.label}
              className="bg-slate-900/50 border border-slate-700/40 rounded-lg p-3"
            >
              <div className="text-2xl mb-1">{r.icon}</div>
              <div className="text-violet-300 font-bold">{r.value}</div>
              <div className="text-slate-500 text-xs">{r.label}</div>
            </div>
          ))}
        </div>
        <p className="text-slate-400 text-sm mt-4 leading-relaxed">
          Every request goes through the retry engine. Rate limits (HTTP 429) trigger
          exponential backoff starting at 1 second. Network failures retry up to 3
          times. If a story still fails after all retries, it's logged in{" "}
          <code className="text-violet-400 bg-slate-900 px-1 rounded">errors.log</code>{" "}
          and the download continues with the next story. The entire batch never aborts
          due to a single failure.
        </p>
      </div>
    </div>
  );
}

function APITab() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 p-5">
        <h3 className="text-blue-300 font-semibold mb-2 flex items-center gap-2">
          <span>ℹ️</span> About the Literotica API
        </h3>
        <p className="text-slate-400 text-sm leading-relaxed">
          Literotica's <code className="text-blue-300 bg-slate-900 px-1 rounded">/api/3/</code>{" "}
          API is undocumented and intended for internal use. These endpoints were
          reverse-engineered by observing browser network traffic. Field names may
          change without notice. V2 uses flexible fallback parsing to handle
          variations.
        </p>
      </div>

      <div className="space-y-4">
        {API_ENDPOINTS.map((ep) => (
          <div
            key={ep.path}
            className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/40 bg-slate-900/40">
              <MethodBadge method={ep.method} />
              <code className="text-slate-200 text-sm font-mono">{ep.path}</code>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <span className="text-slate-500 text-xs uppercase tracking-wide">
                  Query Parameters
                </span>
                <div className="mt-1 font-mono text-xs bg-slate-900/60 border border-slate-700/40 rounded px-3 py-2 text-violet-300 overflow-x-auto">
                  {ep.params}
                </div>
              </div>
              <div>
                <span className="text-slate-500 text-xs uppercase tracking-wide">
                  Description
                </span>
                <p className="text-slate-300 text-sm mt-1">{ep.desc}</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs uppercase tracking-wide">
                  Response Shape
                </span>
                <div className="mt-1 font-mono text-xs bg-slate-900/60 border border-slate-700/40 rounded px-3 py-2 text-emerald-300">
                  {ep.response}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Story object fields */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h3 className="text-slate-200 font-semibold mb-4">📋 Story Object Fields</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-slate-400 font-medium pb-2 pr-4">Field</th>
                <th className="text-left text-slate-400 font-medium pb-2 pr-4">Type</th>
                <th className="text-left text-slate-400 font-medium pb-2">Description</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {[
                ["url / slug", "string", "Story URL slug used for API fetch"],
                ["title", "string", "Story title"],
                ["description", "string", "Story description/teaser"],
                ["category_info.pageTitle", "string", "Category display name"],
                ["rate", "number", "Average rating (0–5)"],
                ["total_votes", "number", "Total vote count"],
                ["view_count", "number", "Total views"],
                ["date_approve", "timestamp", "Unix timestamp of publication"],
                ["meta_pages", "number", "Total page count"],
                ["series", "object", "Series metadata {id, title}"],
                ["series_number", "number", "Chapter index within series"],
                ["series_works", "array", "Child chapters (series parent only)"],
                ["pageText", "string HTML", "Story page content (from /stories/{slug})"],
                ["author.username", "string", "Author username"],
                ["words", "number", "Word count estimate"],
              ].map(([field, type, desc]) => (
                <tr
                  key={field}
                  className="border-b border-slate-800/60 hover:bg-slate-900/30"
                >
                  <td className="py-2 pr-4 text-violet-300 whitespace-nowrap">
                    {field}
                  </td>
                  <td className="py-2 pr-4 text-amber-300 whitespace-nowrap">{type}</td>
                  <td className="py-2 text-slate-400 font-sans">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage example */}
      <div>
        <h3 className="text-slate-200 font-semibold mb-3">💡 Fetch Example</h3>
        <CodeBlock
          language="javascript"
          code={`// Fetch full author catalog (page 1, 500 stories max)
const params = JSON.stringify({
  page: 1,
  pageSize: 500,
  type: "story",
  listType: "expanded"
});
const url = \`https://literotica.com/api/3/users/\${author}/series_and_works?params=\${encodeURIComponent(params)}\`;
const response = await fetch(url);
const data = await response.json();

// data.submissions = array of story/series objects

// Fetch story content
const storyParams = JSON.stringify({ page: 1 });
const storyUrl = \`https://literotica.com/api/3/stories/\${slug}?params=\${encodeURIComponent(storyParams)}\`;
const storyData = await (await fetch(storyUrl)).json();

// storyData.pageText = HTML content of the story page`}
        />
      </div>

      {/* V3 expansion notes */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h3 className="text-white font-semibold mb-3">🔮 Future V3 Expansion Points</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          {[
            "Add /api/3/users/{author}/poems endpoint for poem downloads",
            "Add /api/3/users/{author}/illustrations for artwork",
            "Add /api/3/users/{author}/audios for audio stories",
            "Implement resume-from-last feature using GM.setValue state checkpointing",
            "Add Calibre-compatible metadata OPF sidecar files",
            "Support batch multi-author downloads via favorites list",
            "Add CBZ/CBR output for illustrated content",
            "Implement story diff detection for re-download on updates",
          ].map((note, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-violet-500 flex-shrink-0">→</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ChangelogTab() {
  return (
    <div className="space-y-6">
      {CHANGELOG.map((entry) => (
        <div
          key={entry.version}
          className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden"
        >
          <div
            className={`flex items-center gap-3 px-5 py-4 border-b border-slate-700/40 ${
              entry.type === "major"
                ? "bg-gradient-to-r from-violet-900/30 to-indigo-900/20"
                : "bg-slate-900/30"
            }`}
          >
            <div className="text-2xl">
              {entry.type === "major" ? "🚀" : "📦"}
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">
                Version {entry.version}
              </h3>
              <p className="text-slate-500 text-sm">{entry.date}</p>
            </div>
            <div className="ml-auto">
              <Badge
                text={entry.type === "major" ? "Current" : "Legacy"}
                color={entry.type === "major" ? "#7c3aed" : "#555"}
              />
            </div>
          </div>
          <ul className="p-5 space-y-2">
            {entry.changes.map((change, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  className={`flex-shrink-0 ${
                    entry.type === "major" ? "text-emerald-500" : "text-slate-600"
                  }`}
                >
                  {entry.type === "major" ? "✓" : "–"}
                </span>
                <span
                  className={
                    entry.type === "major" ? "text-slate-300" : "text-slate-500"
                  }
                >
                  {change}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h3 className="text-white font-semibold mb-3">📌 Why V2 Was Needed</h3>
        <p className="text-slate-400 text-sm leading-relaxed">
          Literotica migrated to a React Single-Page Application (SPA) architecture
          in 2023–2024, breaking all scripts that relied on scraping static HTML DOM
          elements like{" "}
          <code className="text-slate-300 bg-slate-900 px-1 rounded">.b-story-body-x</code>,{" "}
          <code className="text-slate-300 bg-slate-900 px-1 rounded">.contactheader</code>, or
          pagination links. The new React app loads stories dynamically and the old
          HTML structure no longer exists.
        </p>
        <p className="text-slate-400 text-sm leading-relaxed mt-3">
          V2 replaces all scraping with direct calls to Literotica's internal{" "}
          <code className="text-violet-300 bg-slate-900 px-1 rounded">/api/3/</code> JSON
          API — the same endpoints the React frontend uses — making it resilient to
          future frontend refactors and providing structured metadata that was
          impossible to extract from HTML alone.
        </p>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("install");
  const [lineCount] = useState(() => USERSCRIPT.split("\n").length);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-0">
          <div className="flex items-center gap-4 h-14">
            {/* Logo */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-base shadow-lg shadow-violet-900/30">
                📥
              </div>
              <div>
                <span className="text-white font-bold text-sm tracking-tight">
                  Literotica Downloader
                </span>
                <span className="ml-1.5 text-violet-400 text-xs font-semibold bg-violet-900/30 border border-violet-700/30 px-1.5 py-0.5 rounded">
                  V2
                </span>
              </div>
            </div>

            {/* Tab nav */}
            <nav className="flex items-center gap-0.5 ml-4 overflow-x-auto flex-1 scrollbar-none">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-all duration-150 ${
                    activeTab === tab.id
                      ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <span className="font-medium hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* Stats */}
            <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{lineCount} lines</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {activeTab === "install" && <InstallTab />}
        {activeTab === "script" && <ScriptTab />}
        {activeTab === "features" && <FeaturesTab />}
        {activeTab === "api" && <APITab />}
        {activeTab === "changelog" && <ChangelogTab />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 mt-12">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-slate-600 text-sm">
            <span className="text-violet-400 font-semibold">Literotica Downloader V2</span>
            {" "} — Production-quality Greasemonkey userscript
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span>API: /api/3/</span>
            <span>•</span>
            <span>JSZip 3.10</span>
            <span>•</span>
            <span>EPUB 2.0</span>
            <span>•</span>
            <span>FileSaver.js 2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
