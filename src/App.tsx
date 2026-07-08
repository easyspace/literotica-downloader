const RELEASES = [
  { browser: "Firefox", manager: "Greasemonkey", version: "2.1.30" },
  { browser: "Chrome", manager: "Tampermonkey", version: "2.1.31" },
];

const INSTALLS = [
  {
    label: "Firefox + Greasemonkey",
    path: "dist/literotica-downloader-firefox-greasemonkey.user.js",
  },
  {
    label: "Chrome + Tampermonkey",
    path: "dist/literotica-downloader-chrome-tampermonkey.user.js",
  },
];

const FEATURES = [
  "Browse an author's catalog and filter stories before export.",
  "Export selected stories as HTML, EPUB, TXT, or a ZIP package.",
  "Choose combined files or separate chapter files.",
  "Keep downloads running even when individual stories fail.",
  "Use a compact panel layout that stays usable on smaller windows.",
];

const USAGE = [
  "Open a Literotica author page or member story listing page.",
  "Wait for the downloader panel to load the catalog.",
  "Filter, sort, and select the stories you want.",
  "Choose your export format and file structure.",
  "Start the download and keep the tab open until it finishes.",
];

const NOTES = [
  "Download speed depends on story size, page count, and network conditions.",
  "Private or deleted stories may fail and will be skipped without stopping the full batch.",
  "This script is for personal-use downloading and organization. It does not bypass paywalls.",
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  );
}

export default function App() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_45%,_#111827_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-slate-950/80 shadow-2xl shadow-cyan-950/20">
          <div className="bg-[linear-gradient(135deg,_rgba(8,145,178,0.25),_rgba(15,23,42,0.95)_55%,_rgba(30,41,59,0.95))] px-6 py-8 sm:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
                Public Release Repository
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Literotica Downloader V2
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Browser userscript for downloading stories from Literotica author
                pages and member story listings in HTML, EPUB, TXT, or ZIP format.
              </p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {RELEASES.map((release) => (
                <div
                  key={release.browser}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-white">
                    {release.browser} + {release.manager}
                  </p>
                  <p className="mt-1 text-sm text-cyan-200">
                    Current version: {release.version}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Section title="Install Files">
            <ul className="space-y-3">
              {INSTALLS.map((install) => (
                <li
                  key={install.label}
                  className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3"
                >
                  <p className="font-medium text-white">{install.label}</p>
                  <code className="mt-1 block break-all text-xs text-cyan-200">
                    {install.path}
                  </code>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              Public listing:{" "}
              <a
                href="https://sleazyfork.org/en/scripts/577945-literotica-downloader-v2"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-300 underline decoration-cyan-500/40 underline-offset-4 hover:text-cyan-200"
              >
                SleazyFork
              </a>
            </p>
          </Section>

          <Section title="Support">
            <p>
              Homepage and support:
              {" "}
              <a
                href="https://studios.easyspace.in"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-300 underline decoration-cyan-500/40 underline-offset-4 hover:text-cyan-200"
              >
                studios.easyspace.in
              </a>
            </p>
            <p className="mt-4">
              License: All Rights Reserved. No redistribution or rehosting without
              explicit permission.
            </p>
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="What It Does">
            <ul className="space-y-2">
              {FEATURES.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1 text-cyan-300">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Basic Usage">
            <ol className="space-y-2">
              {USAGE.map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-xs font-semibold text-cyan-200">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Notes">
            <ul className="space-y-2">
              {NOTES.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1 text-cyan-300">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </main>
  );
}
