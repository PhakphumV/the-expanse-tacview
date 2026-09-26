#!/usr/bin/env node
// scripts/browser-smoke.js
//
// Static-analysis smoke test for browser compatibility. Scans every JS
// module for modern features that may not work in the oldest supported
// browser (Safari 14, Chrome 90, Firefox 90).
//
// Exit 0 if no issues found, 1 otherwise.
//
// Usage:  node scripts/browser-smoke.js

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const modulesDir = path.join(repoRoot, 'js');

// Patterns that flag features needing a browser newer than our minimums.
// Each pattern targets a specific syntax form.
const PATTERNS = [
    {
        name: 'private class field',
        // `#name = ...` or `#name(...)` inside a class body.
        re: /^\s*#[A-Za-z_$][\w$]*\s*[=(]/,
        docs: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_class_fields',
        minVersion: 'Safari 14.1, Chrome 74, Firefox 90',
    },
    {
        name: 'top-level await',
        // `await` outside an async function at module top level.
        // We only check for `await` at indentation level 0.
        re: /^await\s/,
        docs: 'https://caniuse.com/mdn-javascript_operators_await_top_level',
        minVersion: 'Safari 15, Chrome 89, Firefox 89',
    },
];

let errorCount = 0;

for (const fname of fs.readdirSync(modulesDir).sort()) {
    if (!fname.endsWith('.js')) continue;
    const filePath = path.join(modulesDir, fname);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const [i, line] of lines.entries()) {
        // Skip comment lines.
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        for (const p of PATTERNS) {
            if (p.re.test(line)) {
                console.error(`${fname}:${i + 1} [${p.name}] ${trimmed.slice(0, 80)}`);
                console.error(`    needs: ${p.minVersion}`);
                console.error(`    docs:  ${p.docs}`);
                errorCount++;
            }
        }
    }
}

if (errorCount === 0) {
    console.log('browser-smoke: no compatibility issues found');
    process.exit(0);
} else {
    console.error(`\nbrowser-smoke: ${errorCount} potential issue(s)`);
    process.exit(1);
}
