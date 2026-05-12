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

const outDir = path.resolve("dist");
fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, "literotica-downloader-greasemonkey.user.js");
fs.writeFileSync(outPath, userscript, "utf8");

console.log("Generated:", outPath);
