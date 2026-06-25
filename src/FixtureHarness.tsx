import { useEffect, useMemo, useRef, useState } from "react";
import { USERSCRIPT } from "./userscript";

type FixturePage = {
  pageNum: number;
  text: string;
  title: string;
};

type FixtureStory = {
  id: string;
  title: string;
  author: string;
  authorName: string;
  category: string;
  rating: number;
  date: string;
  dateFormatted: string;
  description: string;
  slug: string;
  pageCount: number;
  wordCount: number;
  pages: FixturePage[];
  seriesId?: string;
  seriesTitle?: string;
  seriesIndex?: number;
};

type FixtureGroup = {
  id: string;
  title: string;
  author: string;
  authorName: string;
  category: string;
  rating: number;
  date: string;
  dateFormatted: string;
  description: string;
  slug: string;
  isSeries: boolean;
  stories: FixtureStory[];
};

type HarnessApi = {
  version: string;
  buildStoryHTML: (story: FixtureStory) => string;
  buildCombinedHTML: (group: FixtureGroup) => string;
  buildStoryText: (story: FixtureStory) => string;
  buildCombinedText: (group: FixtureGroup) => string;
  buildEPUBBytes: (
    story: FixtureStory,
    shouldCancel?: () => boolean,
  ) => Promise<Uint8Array>;
  buildCombinedEPUBBytes: (
    group: FixtureGroup,
    shouldCancel?: () => boolean,
  ) => Promise<Uint8Array>;
};

type GeneratedFixture = {
  standaloneHtml: string;
  standaloneTxt: string;
  standaloneEpub: Uint8Array;
  seriesHtml: string;
  seriesTxt: string;
  seriesEpub: Uint8Array;
};

type HarnessState =
  | { status: "booting" }
  | { status: "ready"; api: HarnessApi; version: string }
  | { status: "error"; message: string };

const FIXTURE_STORY: FixtureStory = {
  id: "fixture-standalone",
  title: "Harness Standalone Story",
  author: "fixture_author",
  authorName: "Fixture Author",
  category: "Group Sex",
  rating: 4.52,
  date: "2026-06-20T00:00:00.000Z",
  dateFormatted: "6/20/2026",
  description: "Standalone fixture for deterministic HTML, TXT, and EPUB checks.",
  slug: "harness-standalone-story",
  pageCount: 2,
  wordCount: 2300,
  pages: [
    {
      pageNum: 1,
      title: "Harness Standalone Story",
      text: [
        "<p>The first paragraph stays as a paragraph.</p>",
        "<p>The second paragraph includes <em>emphasis</em>, <strong>strong text</strong>, and a <a href=\"/authors/Clohi/works/stories\">relative link</a>.</p>",
        "<div>A block wrapper should survive without collapsing into a wall of text.<br>So should an intentional line break.</div>",
        "<ul><li>List item one</li><li>List item two</li></ul>",
      ].join(""),
    },
    {
      pageNum: 2,
      title: "Harness Standalone Story - Page 2",
      text: [
        "<p>Page two confirms pagination separators remain readable.</p>",
        "<blockquote>This blockquote should still be present in HTML and EPUB output.</blockquote>",
        "<p>Final paragraph on page two.</p>",
      ].join(""),
    },
  ],
};

const FIXTURE_SERIES_STORIES: FixtureStory[] = [
  {
    id: "fixture-series-1",
    title: "Harness Series Chapter One",
    author: "fixture_author",
    authorName: "Fixture Author",
    category: "Series",
    rating: 4.2,
    date: "2026-06-18T00:00:00.000Z",
    dateFormatted: "6/18/2026",
    description: "First chapter of the fixture series.",
    slug: "harness-series-chapter-one",
    pageCount: 1,
    wordCount: 1200,
    seriesId: "fixture-series",
    seriesTitle: "Harness Series",
    seriesIndex: 1,
    pages: [
      {
        pageNum: 1,
        title: "Harness Series Chapter One",
        text: "<p>Chapter one opens the series fixture.</p><p>Its content is short but structured.</p>",
      },
    ],
  },
  {
    id: "fixture-series-2",
    title: "Harness Series Chapter Two",
    author: "fixture_author",
    authorName: "Fixture Author",
    category: "Series",
    rating: 4.48,
    date: "2026-06-19T00:00:00.000Z",
    dateFormatted: "6/19/2026",
    description: "Second chapter of the fixture series.",
    slug: "harness-series-chapter-two",
    pageCount: 2,
    wordCount: 1800,
    seriesId: "fixture-series",
    seriesTitle: "Harness Series",
    seriesIndex: 2,
    pages: [
      {
        pageNum: 1,
        title: "Harness Series Chapter Two",
        text: "<p>Chapter two starts on page one.</p><p>It includes another clean paragraph break.</p>",
      },
      {
        pageNum: 2,
        title: "Harness Series Chapter Two - Page 2",
        text: "<p>Page two ensures combined-series exports keep the page marker.</p>",
      },
    ],
  },
];

const FIXTURE_GROUP: FixtureGroup = {
  id: "fixture-series",
  title: "Harness Series",
  author: "fixture_author",
  authorName: "Fixture Author",
  category: "Series",
  rating: 4.48,
  date: "2026-06-19T00:00:00.000Z",
  dateFormatted: "6/19/2026",
  description: "Series fixture for combined export checks.",
  slug: "harness-series",
  isSeries: true,
  stories: FIXTURE_SERIES_STORIES,
};

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bytesToBlob(bytes: Uint8Array, mimeType: string) {
  return new Blob([bytes], { type: mimeType });
}

function PreviewCard({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-slate-700/50 px-4 py-3">
        <div>
          <h3 className="text-white font-semibold">{title}</h3>
          <p className="text-slate-500 text-sm">{subtitle}</p>
        </div>
        <button
          onClick={onAction}
          className="rounded-lg border border-violet-500/40 bg-violet-600/20 px-3 py-1.5 text-sm font-medium text-violet-200 hover:bg-violet-600/30"
        >
          {actionLabel}
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function FixtureHarness() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [harness, setHarness] = useState<HarnessState>({ status: "booting" });
  const [generated, setGenerated] = useState<GeneratedFixture | null>(null);
  const [runState, setRunState] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [runMessage, setRunMessage] = useState("Booting fixture runtime...");

  useEffect(() => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Literotica Downloader Fixture Harness");
    iframe.style.display = "none";
    iframe.srcdoc = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>";
    iframeRef.current = iframe;
    document.body.appendChild(iframe);

    const boot = () => {
      try {
        const win = iframe.contentWindow as
          | (Window & {
              __LITDL_HARNESS__?: boolean;
              __LITDL_HARNESS_API__?: HarnessApi;
            })
          | null;
        if (!win) {
          throw new Error("Harness iframe did not expose a window.");
        }

        win.__LITDL_HARNESS__ = true;
        const script = win.document.createElement("script");
        script.text = USERSCRIPT;
        win.document.body.appendChild(script);

        const api = win.__LITDL_HARNESS_API__;
        if (!api) {
          throw new Error("Userscript did not expose the harness API.");
        }

        setHarness({ status: "ready", api, version: api.version });
        setRunMessage("Fixture runtime ready.");
      } catch (error) {
        setHarness({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
        setRunMessage("Fixture runtime failed to boot.");
      }
    };

    iframe.addEventListener("load", boot, { once: true });

    return () => {
      iframe.removeEventListener("load", boot);
      iframe.remove();
      iframeRef.current = null;
    };
  }, []);

  const outputSummary = useMemo(() => {
    if (!generated) return null;
    return [
      { label: "Standalone HTML", value: `${generated.standaloneHtml.length.toLocaleString()} chars` },
      { label: "Standalone TXT", value: `${generated.standaloneTxt.length.toLocaleString()} chars` },
      { label: "Standalone EPUB", value: `${generated.standaloneEpub.length.toLocaleString()} bytes` },
      { label: "Series HTML", value: `${generated.seriesHtml.length.toLocaleString()} chars` },
      { label: "Series TXT", value: `${generated.seriesTxt.length.toLocaleString()} chars` },
      { label: "Series EPUB", value: `${generated.seriesEpub.length.toLocaleString()} bytes` },
    ];
  }, [generated]);

  async function generateFixtures() {
    if (harness.status !== "ready") return;
    setRunState("running");
    setRunMessage("Generating deterministic sample HTML, TXT, and EPUB outputs...");

    try {
      const standaloneHtml = harness.api.buildStoryHTML(FIXTURE_STORY);
      const standaloneTxt = harness.api.buildStoryText(FIXTURE_STORY);
      const seriesHtml = harness.api.buildCombinedHTML(FIXTURE_GROUP);
      const seriesTxt = harness.api.buildCombinedText(FIXTURE_GROUP);
      const standaloneEpub = Uint8Array.from(
        await harness.api.buildEPUBBytes(FIXTURE_STORY, () => false),
      );
      const seriesEpub = Uint8Array.from(
        await harness.api.buildCombinedEPUBBytes(FIXTURE_GROUP, () => false),
      );

      setGenerated({
        standaloneHtml,
        standaloneTxt,
        standaloneEpub,
        seriesHtml,
        seriesTxt,
        seriesEpub,
      });
      setRunState("done");
      setRunMessage("Fixture outputs generated.");
    } catch (error) {
      setGenerated(null);
      setRunState("error");
      setRunMessage(
        error instanceof Error ? error.message : "Fixture generation failed.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-900/10 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Fixture Export Harness</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              This page boots the current userscript template in a hidden iframe and
              runs the real HTML, TXT, and EPUB builders against fixed sample story data.
              Use it to regenerate repeatable outputs after export pipeline changes.
            </p>
          </div>
          <button
            onClick={generateFixtures}
            disabled={harness.status !== "ready" || runState === "running"}
            className="rounded-lg border border-cyan-500/40 bg-cyan-600/20 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-cyan-600/30"
          >
            {runState === "running" ? "Generating..." : "Generate Fixture Outputs"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-slate-700/50 bg-slate-900/50 px-3 py-1 text-slate-300">
            Runtime:{" "}
            {harness.status === "ready"
              ? `ready (userscript ${harness.version})`
              : harness.status}
          </span>
          <span className="rounded-full border border-slate-700/50 bg-slate-900/50 px-3 py-1 text-slate-300">
            Status: {runMessage}
          </span>
        </div>

        {outputSummary && (
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            {outputSummary.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2"
              >
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {item.label}
                </div>
                <div className="text-sm font-medium text-slate-200">{item.value}</div>
              </div>
            ))}
          </div>
        )}

        {harness.status === "error" && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {harness.message}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <h3 className="text-slate-200 font-semibold">Fixture Checklist</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-400">
          <li>Generate outputs after any change to story extraction, HTML CSS, TXT conversion, or EPUB packaging.</li>
          <li>Download the sample HTML files and open them on desktop and Android Firefox Nightly.</li>
          <li>Download the sample EPUB files and open them in the reader apps you actually care about.</li>
          <li>The sample story includes paragraphs, line breaks, lists, blockquotes, links, and multi-page content.</li>
        </ul>
      </div>

      {generated && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <PreviewCard
            title="Standalone HTML Preview"
            subtitle="Single story with two pages and mixed markup."
            actionLabel="Download HTML"
            onAction={() =>
              downloadBlob(
                "fixture-standalone.html",
                new Blob([generated.standaloneHtml], {
                  type: "text/html;charset=utf-8",
                }),
              )
            }
          >
            <iframe
              title="Standalone HTML Fixture"
              className="h-[28rem] w-full rounded-lg border border-slate-700/50 bg-white"
              srcDoc={generated.standaloneHtml}
            />
          </PreviewCard>

          <PreviewCard
            title="Series HTML Preview"
            subtitle="Combined series export with chapter and page separators."
            actionLabel="Download HTML"
            onAction={() =>
              downloadBlob(
                "fixture-series-combined.html",
                new Blob([generated.seriesHtml], {
                  type: "text/html;charset=utf-8",
                }),
              )
            }
          >
            <iframe
              title="Series HTML Fixture"
              className="h-[28rem] w-full rounded-lg border border-slate-700/50 bg-white"
              srcDoc={generated.seriesHtml}
            />
          </PreviewCard>

          <PreviewCard
            title="Standalone TXT"
            subtitle="Plain-text export generated by the current text builder."
            actionLabel="Download TXT"
            onAction={() =>
              downloadBlob(
                "fixture-standalone.txt",
                new Blob([generated.standaloneTxt], {
                  type: "text/plain;charset=utf-8",
                }),
              )
            }
          >
            <pre className="max-h-[28rem] overflow-auto rounded-lg border border-slate-700/50 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
              {generated.standaloneTxt}
            </pre>
          </PreviewCard>

          <PreviewCard
            title="Series TXT"
            subtitle="Combined text export for chapter-order checks."
            actionLabel="Download TXT"
            onAction={() =>
              downloadBlob(
                "fixture-series-combined.txt",
                new Blob([generated.seriesTxt], {
                  type: "text/plain;charset=utf-8",
                }),
              )
            }
          >
            <pre className="max-h-[28rem] overflow-auto rounded-lg border border-slate-700/50 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
              {generated.seriesTxt}
            </pre>
          </PreviewCard>

          <PreviewCard
            title="Standalone EPUB"
            subtitle="Download and open in your EPUB reader of choice."
            actionLabel="Download EPUB"
            onAction={() =>
              downloadBlob(
                "fixture-standalone.epub",
                bytesToBlob(generated.standaloneEpub, "application/epub+zip"),
              )
            }
          >
            <div className="rounded-lg border border-slate-700/50 bg-slate-950/80 p-4 text-sm text-slate-300">
              <p>EPUB size: {generated.standaloneEpub.length.toLocaleString()} bytes</p>
              <p className="mt-2 text-slate-500">
                Use this file to confirm reader compatibility and preserved structure.
              </p>
            </div>
          </PreviewCard>

          <PreviewCard
            title="Series EPUB"
            subtitle="Combined series EPUB for chapter navigation checks."
            actionLabel="Download EPUB"
            onAction={() =>
              downloadBlob(
                "fixture-series-combined.epub",
                bytesToBlob(generated.seriesEpub, "application/epub+zip"),
              )
            }
          >
            <div className="rounded-lg border border-slate-700/50 bg-slate-950/80 p-4 text-sm text-slate-300">
              <p>EPUB size: {generated.seriesEpub.length.toLocaleString()} bytes</p>
              <p className="mt-2 text-slate-500">
                Use this file to verify chapter order, page separators, and reader TOC behavior.
              </p>
            </div>
          </PreviewCard>
        </div>
      )}
    </div>
  );
}
