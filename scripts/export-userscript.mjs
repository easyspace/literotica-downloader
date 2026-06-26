import fs from "node:fs";
import path from "node:path";

const baseUserscriptPath = path.resolve(
  "userscript",
  "baselines",
  "literotica-downloader-firefox-greasemonkey.user.js",
);
const baseUserscript = fs.readFileSync(baseUserscriptPath, "utf8");
const chromeUserscriptPath = path.resolve(
  "userscript",
  "baselines",
  "literotica-downloader-chrome-tampermonkey.user.js",
);
const chromeUserscript = fs.readFileSync(chromeUserscriptPath, "utf8");

function replaceMeta(userscript, key, value) {
  const lines = userscript.split("\n");
  const matcher = new RegExp("^// @" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s+)");
  const nextLines = lines.map((line) => {
    if (!matcher.test(line)) return line;
    return "// @" + key.padEnd(12, " ") + value;
  });
  return nextLines.join("\n");
}

function insertMetaAfter(userscript, afterKey, lines) {
  const pattern = new RegExp("^(// @" + afterKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*)$", "m");
  return userscript.replace(pattern, (_, line) => line + "\n" + lines.join("\n"));
}

function dedupeMetaLines(userscript) {
  const lines = userscript.split("\n");
  const seen = new Set();
  const output = [];

  for (const line of lines) {
    if (!line.startsWith("// @")) {
      output.push(line);
      continue;
    }

    if (seen.has(line)) continue;
    seen.add(line);
    output.push(line);
  }

  return output.join("\n");
}

function buildFirefoxUserscript() {
  let userscript = baseUserscript;
  userscript = replaceMeta(userscript, "name", "Literotica Downloader for Firefox / Greasemonkey");
  return userscript;
}

function buildChromeUserscript() {
  return chromeUserscript;
}

function extractUserscriptVersion(userscript) {
  const match = userscript.match(/^\/\/ @version\s+(\S+)/m);
  if (!match) {
    throw new Error("Could not locate @version in userscript metadata");
  }
  return match[1];
}

const firefoxOutput = buildFirefoxUserscript();
const chromeOutput = buildChromeUserscript();
const firefoxVersion = extractUserscriptVersion(firefoxOutput);
const chromeVersion = extractUserscriptVersion(chromeOutput);

const outputs = [
  {
    path: path.resolve("dist", "literotica-downloader-firefox-greasemonkey.user.js"),
    content: firefoxOutput,
  },
  {
    path: path.resolve("dist", "literotica-downloader-chrome-tampermonkey.user.js"),
    content: chromeOutput,
  },
  {
    path: path.resolve("dist", `${firefoxVersion} literotica-downloader-firefox-greasemonkey.user.js`),
    content: firefoxOutput,
  },
  {
    path: path.resolve("dist", `${chromeVersion} literotica-downloader-chrome-tampermonkey.user.js`),
    content: chromeOutput,
  },
  {
    path: path.resolve("userscript", "literotica-downloader-firefox-greasemonkey.user.js"),
    content: firefoxOutput,
  },
  {
    path: path.resolve("userscript", "literotica-downloader-chrome-tampermonkey.user.js"),
    content: chromeOutput,
  },
  {
    path: path.resolve("userscript", "firefox-greasemonkey.user.js"),
    content: firefoxOutput,
  },
];

for (const output of outputs) {
  fs.mkdirSync(path.dirname(output.path), { recursive: true });
  fs.writeFileSync(output.path, output.content, "utf8");
  console.log("Generated:", output.path);
}
