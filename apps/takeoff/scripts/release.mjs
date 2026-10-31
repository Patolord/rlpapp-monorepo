// Bump the app version everywhere, commit and tag. Push the tag to trigger the release workflow.
// Usage: bun scripts/release.mjs 0.2.0 [--no-commit]
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
const noCommit = process.argv.includes("--no-commit");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: bun scripts/release.mjs <major.minor.patch> [--no-commit]");
  process.exit(1);
}
const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (status && !noCommit) {
  console.error(`Working tree is not clean; commit or stash first:
${status}`);
  process.exit(1);
}

const editJson = (file, mutate) => {
  const json = JSON.parse(readFileSync(file, "utf8"));
  mutate(json);
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
};
editJson("package.json", (j) => {
  j.version = version;
});
editJson("src-tauri/tauri.conf.json", (j) => {
  j.version = version;
});
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").replace(
  /^version = "[^"]+"/m,
  `version = "${version}"`,
);
writeFileSync("src-tauri/Cargo.toml", cargo);
// keep Cargo.lock in step without a network fetch
execSync("cargo update -p tauri-takeoff --offline", {
  cwd: "src-tauri",
  stdio: "ignore",
  env: { ...process.env, PATH: `${process.env.USERPROFILE}\\.cargo\\bin;${process.env.PATH}` },
});

if (noCommit) {
  console.log(`Version set to ${version} (not committed).`);
  process.exit(0);
}
execSync(
  "git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock",
);
execSync(`git commit -q -m "Release ${version}"`);
execSync(`git tag -a v${version} -m "Takeoff ${version}"`);
console.log(
  `Committed and tagged v${version}. Publish with:\n  git push && git push origin v${version}`,
);
