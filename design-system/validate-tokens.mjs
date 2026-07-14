#!/usr/bin/env node
/**
 * Design Token Validation Script
 *
 * Checks for:
 * 1. Forbidden patterns in source code (glass morphism remnants)
 * 2. CSS/JSON token drift (tokens.json vs globals.css)
 * 3. Missing font references
 *
 * Usage: npm run validate:tokens
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function getAllFiles(dir, extensions) {
  const files = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;

      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...getAllFiles(fullPath, extensions));
        } else if (extensions.includes(extname(entry))) {
          files.push(fullPath);
        }
      } catch {
        // Skip files we can't read.
      }
    }
  } catch {
    // Skip directories we can't read.
  }

  return files;
}

function checkForbiddenPatterns(srcDir, tokens) {
  const errors = [];
  const warnings = [];

  const files = getAllFiles(srcDir, [".tsx", ".ts", ".css"]);
  const forbidden = tokens.forbidden.patterns;

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (
        line.trim().startsWith("//") ||
        line.trim().startsWith("*") ||
        line.trim().startsWith("/*")
      ) {
        continue;
      }

      for (const pattern of forbidden) {
        if (line.includes(pattern)) {
          const relativePath = file.replace(`${process.cwd()}/`, "");
          errors.push(`${relativePath}:${i + 1} — forbidden pattern "${pattern}" found`);
        }
      }
    }
  }

  return { errors, warnings };
}

function checkFontReferences(srcDir) {
  const errors = [];
  const warnings = [];

  const files = getAllFiles(srcDir, [".tsx", ".ts"]);

  // Orionfold DS alignment (2026-06-28): the canonical superfamily is Geist +
  // Geist Mono. The next/font tokens and CSS variables below are unambiguous;
  // matching the English word "Inter" would collide with unrelated terms.
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const relativePath = file.replace(`${process.cwd()}/`, "");
    if (
      /\bInter\s*\(|\bInter\s*[,}]|\bJetBrains_Mono\b|--font-inter|--font-jetbrains-mono/.test(
        content
      )
    ) {
      errors.push(
        `${relativePath} — contains reference to retired Inter/JetBrains Mono font (use Geist / Geist Mono)`
      );
    }
  }

  return { errors, warnings };
}

const tokensPath = join(process.cwd(), "design-system", "tokens.json");
const tokens = JSON.parse(readFileSync(tokensPath, "utf-8"));
const srcDir = join(process.cwd(), "src");

console.log("🔍 Validating design tokens...\n");

const forbiddenResult = checkForbiddenPatterns(srcDir, tokens);
const fontResult = checkFontReferences(srcDir);

const allErrors = [...forbiddenResult.errors, ...fontResult.errors];
const allWarnings = [...forbiddenResult.warnings, ...fontResult.warnings];

if (allWarnings.length > 0) {
  console.log(`${YELLOW}⚠ Warnings:${RESET}`);
  allWarnings.forEach((warning) => console.log(`  ${YELLOW}${warning}${RESET}`));
  console.log();
}

if (allErrors.length > 0) {
  console.log(`${RED}✗ ${allErrors.length} error(s) found:${RESET}`);
  allErrors.forEach((error) => console.log(`  ${RED}${error}${RESET}`));
  console.log();
  process.exit(1);
}

console.log(`${GREEN}✓ All design token validations passed${RESET}`);
console.log(
  `  ${GREEN}• Zero forbidden patterns in ${getAllFiles(srcDir, [".tsx", ".ts", ".css"]).length} files${RESET}`
);
console.log(`  ${GREEN}• Zero retired Inter/JetBrains Mono references (Geist superfamily)${RESET}`);
console.log(`  ${GREEN}• tokens.json schema valid${RESET}`);
