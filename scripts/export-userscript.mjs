import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("src/userscript.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const match = source.match(/export const USERSCRIPT = `([\s\S]*)`;\s*$/);

if (!match) {
  throw new Error("Could not locate USERSCRIPT template literal in src/userscript.ts");
}

const templateBody = match[1];
const userscript = Function("return `" + templateBody + "`;")();

const outputs = [
  path.resolve("dist", "literotica-downloader-greasemonkey.user.js"),
  path.resolve("dist", "literotica-downloader-tampermonkey.user.js"),
  path.resolve("userscript", "literotica-downloader-greasemonkey.user.js"),
  path.resolve("userscript", "literotica-downloader-tampermonkey.user.js"),
  path.resolve("userscript", "greasemonkey.user.js"),
];

for (const outPath of outputs) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, userscript, "utf8");
  console.log("Generated:", outPath);
}
