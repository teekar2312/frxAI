#!/usr/bin/env node
/**
 * fresh-setup.js — One-command clean install for frxAI
 *
 * Deletes node_modules, .next, and lockfile, then reinstalls everything.
 * Run with:  node scripts/fresh-setup.js
 *
 * This resolves the Prisma "Cannot find module @prisma/client-xxx" error
 * caused by mismatched Prisma CLI / @prisma/client versions in node_modules.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const dirs = ["node_modules", ".next", "src/generated"];
const files = ["bun.lock", "bun.lockb", "package-lock.json"];

console.log("\n🧹 frxAI Fresh Setup\n");

// 1. Delete stale directories
for (const dir of dirs) {
  const p = path.resolve(dir);
  if (fs.existsSync(p)) {
    console.log(`  Deleting ${dir}/ ...`);
    fs.rmSync(p, { recursive: true, force: true });
  }
}

// 2. Delete stale lockfiles
for (const file of files) {
  const p = path.resolve(file);
  if (fs.existsSync(p)) {
    console.log(`  Deleting ${file} ...`);
    fs.unlinkSync(p);
  }
}

// 3. Detect package manager
const hasBun = fs.existsSync(path.resolve("bun.lockb")) || fs.existsSync(path.resolve("bun.lock"));
const pm = hasBun || process.argv.includes("--bun") ? "bun" : "npm";

console.log(`\n📦 Installing with ${pm} ...`);
execSync(`${pm} install`, { stdio: "inherit", cwd: path.resolve() });

console.log("\n🗄️  Pushing database schema to MySQL ...");
try {
  execSync(`${pm} run db:push`, { stdio: "inherit", cwd: path.resolve() });
} catch (e) {
  console.error("\n❌ db:push failed. Make sure MySQL is running and DATABASE_URL is correct in .env");
  console.error("   Format: mysql://USER:PASSWORD@HOST:3306/DATABASE");
  console.error("   The database must already exist. Create it with: CREATE DATABASE frxai;");
  process.exit(1);
}

console.log("\n✅ Setup complete! Run:  " + pm + " run dev\n");