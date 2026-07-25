/*
This tool merges officialClubName from a freshly downloaded leaderboard file
into an existing frozen-season archive, WITHOUT adopting any other changes.

Why: Embark's archive pages re-render club TAGS with each club's CURRENT
display override (e.g. Team Secret's club shows [TS] on the Season 9 page
today, even though it wore [TSORG] all season — verified against our own
season_9 database). The bundled archives captured the period-correct tags,
which are the historical truth this site presents. A re-download is therefore
used ONLY as the source of the officialClubName field; every other value
(club tags included) is kept from the existing archive.

Workflow per season (8, 9, 10 — earlier pages lack the field):
  node historical-tool.js s9
  node merge-official.js ../S9/S9-crossplay.json s9.json s9-merged.json
  node historical-compare.js ../S9/S9-crossplay.json s9-merged.json
    (expect ONLY the "Official Club Names" section to report differences)
  then replace the bundled S9-crossplay.json with s9-merged.json

Usage: node merge-official.js <existing_archive> <fresh_download> <output_file>

-- Made by S4N-T0S
*/

import fs from 'fs';
import path from 'path';
import { argv, exit } from 'process';

const args = argv.slice(2);

if (args.length < 3) {
    console.error('Error: Please provide three file paths.');
    console.error('Usage: node merge-official.js <existing_archive> <fresh_download> <output_file>');
    exit(1);
}

const [archivePath, freshPath, outputPath] = args;

// Refuse to clobber either input — the archive is the historical source of
// truth and the fresh download may still be needed for re-runs.
const resolvedOut = path.resolve(outputPath);
if (resolvedOut === path.resolve(archivePath) || resolvedOut === path.resolve(freshPath)) {
    console.error('Error: The output file must not be one of the input files.');
    exit(1);
}

function loadJsonFile(filePath) {
    try {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
            console.error(`Error: File not found at "${filePath}"`);
            exit(1);
        }
        const json = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        if (!json.data || !Array.isArray(json.data)) {
            console.error(`Error: File "${filePath}" does not contain a valid "data" array.`);
            exit(1);
        }
        return json;
    } catch (err) {
        console.error(`Error reading "${filePath}":`, err.message);
        exit(1);
    }
}

const archive = loadJsonFile(archivePath);
const fresh = loadJsonFile(freshPath);

console.log(`Archive records: ${archive.data.length}`);
console.log(`Fresh records:   ${fresh.data.length}`);

const getKey = (p) => (p.name === undefined || p.name === null) ? '' : String(p.name);
const freshByName = new Map(fresh.data.map(p => [getKey(p), p]));

let matched = 0;
let officialAdded = 0;
const unmatchedOld = [];
const grouped = new Map(); // "[oldTag] -> Org Name" -> player count

const mergedData = archive.data.map(entry => {
    const freshEntry = freshByName.get(getKey(entry));
    if (!freshEntry) {
        unmatchedOld.push(getKey(entry) || 'Unknown');
        return entry;
    }
    matched++;
    if (!freshEntry.officialClubName) return entry;

    officialAdded++;
    const label = `[${entry.clubTag || '(none)'}] -> ${freshEntry.officialClubName}`;
    grouped.set(label, (grouped.get(label) || 0) + 1);
    // Archive entry stays byte-identical apart from the appended field.
    return { ...entry, officialClubName: freshEntry.officialClubName };
});

console.log('');
console.log(`Matched by name:            ${matched}`);
console.log(`officialClubName added:     ${officialAdded}`);
console.log(`Archive-only players:       ${unmatchedOld.length}${unmatchedOld.length ? ` (e.g. ${unmatchedOld.slice(0, 5).join(', ')})` : ''}`);
console.log(`Fresh-only players ignored: ${fresh.data.length - matched}`);
console.log('');

if (grouped.size > 0) {
    console.log('--- Official clubs merged (period tag -> organisation) ---');
    for (const [label, count] of grouped) {
        console.log(`${label} (${count} players)`);
    }
    console.log('');
}

// A frozen season should line up almost perfectly; a large mismatch means the
// two files are not the same board/season — bail before writing garbage.
if (matched < archive.data.length * 0.95) {
    console.error('Error: Fewer than 95% of archive players matched the fresh download.');
    console.error('Are these really the same season and board? Nothing was written.');
    exit(1);
}

const output = { ...archive, data: mergedData };
fs.writeFileSync(resolvedOut, JSON.stringify(output));
console.log(`Wrote ${mergedData.length} entries to ${outputPath}`);
console.log('Verify with: node historical-compare.js <existing_archive> <output_file>');
