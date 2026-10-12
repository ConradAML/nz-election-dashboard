import { randomUUID } from "node:crypto";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Each upload needs a unique tag so retries cannot select an older version.
const tag = randomUUID();
const wrangler = fileURLToPath(new URL("./node_modules/wrangler/bin/wrangler.js", import.meta.url));

for (const args of [
  ["versions", "upload", "--tag", tag],
  ["versions", "deploy", "--version-tag", `${tag}@100`, "--yes"],
]) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
