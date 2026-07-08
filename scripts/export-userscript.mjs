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

const firefoxOutput = buildFirefoxUserscript();
const chromeOutput = buildChromeUserscript();
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
    path: path.resolve("userscript", "literotica-downloader-firefox-greasemonkey.user.js"),
    content: firefoxOutput,
  },
  {
    path: path.resolve("userscript", "literotica-downloader-chrome-tampermonkey.user.js"),
    content: chromeOutput,
  },
];

const outputMap = new Map();
for (const output of outputs) {
  outputMap.set(output.path, output.content);
}

for (const [outputPath, content] of outputMap.entries()) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
  console.log("Generated:", outputPath);
}
