import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import releaseConfig from "./release.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.resolve(__dirname, "package.json");
const packageName = JSON.parse(readFileSync(packageJsonPath, "utf8")).name;
console.log(`✔ Package: ${packageName}`);

const changelogPath = path.resolve(__dirname, "CHANGELOG.md");

export default releaseConfig(packageName, packageJsonPath, changelogPath);
