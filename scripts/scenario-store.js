#!/usr/bin/env node
// scripts/scenario-store.js
//
// The canonical dataset is one file per scenario under data/scenarios/, named by
// its id. Everything that reads or writes the dataset goes through here, so the
// embed step, the validator and the data tools agree on the layout and the
// formatting, and a change to one mission does not touch the other's file.
//
// A file holds a bare scenario object (the thing SCHEMA.md describes); the rest of
// the pipeline still wants { scenarios: [...] }, which dataset() wraps.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'scenarios');
const INDENT = 1;

function fileFor(id) { return path.join(DIR, id + '.json'); }

function listIds() {
    if (!fs.existsSync(DIR)) return [];
    return fs.readdirSync(DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort();
}

function load(id) { return JSON.parse(fs.readFileSync(fileFor(id), 'utf8')); }
function loadAll() { return listIds().map(load); }

// Menu order: explicit menu_order first (smaller is earlier), then id. The selector
// and the embed step both use this, so renaming a file cannot reorder the menus.
function ordered() {
    return loadAll().sort((a, b) => (a.menu_order || 1e9) - (b.menu_order || 1e9) || a.id.localeCompare(b.id));
}

// The old single-file shape, for code that iterates a dataset.
function dataset() { return { scenarios: ordered() }; }

function save(scenario) {
    if (!scenario || typeof scenario.id !== 'string' || !scenario.id) {
        throw new Error('scenario-store: scenario has no id');
    }
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(fileFor(scenario.id), JSON.stringify(scenario, null, INDENT) + '\n');
    return fileFor(scenario.id);
}

function saveAll(scenarios) { return scenarios.map(save); }

module.exports = { ROOT, DIR, fileFor, listIds, load, loadAll, ordered, dataset, save, saveAll };
