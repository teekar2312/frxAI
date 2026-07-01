#!/usr/bin/env node
/**
 * fresh-setup.js — One-command clean install for frxAI
 *
 * Deletes node_modules, .next, and lockfile, then reinstalls everything.
 * Run with:  node scripts/fresh-setup.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const dirs = ["node_modules", ".next"];
const files = ["bun.lock", "bun.lockb", "package-lock.json"];

console.log("\n🧹 frxAI Fresh Setup\n");

for (const dir of dirs) {
  const p = path.resolve(dir);
  if (fs.existsSync(p)) {
    console.log(`  Deleting ${dir}/ ...`);
    fs.rmSync(p, { recursive: true, force: true });
  }
}

for (const file of files) {
  const p = path.resolve(file);
  if (fs.existsSync(p)) {
    console.log(`  Deleting ${file} ...`);
    fs.unlinkSync(p);
  }
}

const hasBun = fs.existsSync(path.resolve("bun.lockb")) || fs.existsSync(path.resolve("bun.lock"));
const pm = hasBun || process.argv.includes("--bun") ? "bun" : "npm";

console.log(`\n📦 Installing with ${pm} ...`);
execSync(`${pm} install`, { stdio: "inherit", cwd: path.resolve() });

console.log("\n✅ Setup complete! Make sure MySQL is running and DATABASE_URL is set in .env");
console.log("   Then run:  " + pm + " run db:push");
console.log("   Then run:  " + pm + " run dev\n");