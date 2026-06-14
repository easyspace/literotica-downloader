import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("src/userscript.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const match = source.match(/export const USERSCRIPT = `([\s\S]*)`;\s*$/);

if (!match) {
  throw new Error("Could not locate USERSCRIPT template literal in src/userscript.ts");
}

const templateBody = match[1];
const baseUserscript = Function("return `" + templateBody + "`;")();

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
  let userscript = baseUserscript;
  userscript = replaceMeta(userscript, "name", "Literotica Downloader for Chrome / Tampermonkey");
  userscript = replaceMeta(userscript, "run-at", "document-idle");
  userscript = insertMetaAfter(userscript, "grant", [
    "// @grant        GM_getValue",
    "// @grant        GM_setValue",
    "// @grant        GM.xmlHttpRequest",
    "// @grant        GM_xmlhttpRequest",
  ]);
  userscript = insertMetaAfter(userscript, "run-at", [
    "// @inject-into  content",
  ]);
  userscript = dedupeMetaLines(userscript);
  return userscript;
}

const outputs = [
  {
    path: path.resolve("dist", "literotica-downloader-firefox-greasemonkey.user.js"),
    content: buildFirefoxUserscript(),
  },
  {
    path: path.resolve("dist", "literotica-downloader-chrome-tampermonkey.user.js"),
    content: buildChromeUserscript(),
  },
  {
    path: path.resolve("userscript", "literotica-downloader-firefox-greasemonkey.user.js"),
    content: buildFirefoxUserscript(),
  },
  {
    path: path.resolve("userscript", "literotica-downloader-chrome-tampermonkey.user.js"),
    content: buildChromeUserscript(),
  },
  {
    path: path.resolve("userscript", "firefox-greasemonkey.user.js"),
    content: buildFirefoxUserscript(),
  },
];

for (const output of outputs) {
  fs.mkdirSync(path.dirname(output.path), { recursive: true });
  fs.writeFileSync(output.path, output.content, "utf8");
  console.log("Generated:", output.path);
}
