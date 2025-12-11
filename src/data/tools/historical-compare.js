/*
This tool was made to compare 2 historical leaderboard json files locally,
it reports differences in ranks, third party IDs (steam,psn,xbox) and players added/removed.

Usage: node historical-compare.js <old_file_path> <new_file_path> [optional_player_name_to_debug]

-- Made by S4N-T0S
*/

import fs from 'fs';
import path from 'path';
import { argv, exit } from 'process';

// Check for correct number of arguments
const args = argv.slice(2);

if (args.length < 2) {
    console.error('Error: Please provide two file paths.');
    console.error('Usage: node historical-compare.js <old_file_path> <new_file_path> [optional_player_name_to_debug]');
    exit(1);
}

const [oldFilePath, newFilePath, debugPlayerName] = args;

// Load and validate JSON file
function loadJsonFile(filePath) {
    try {
        const absolutePath = path.resolve(filePath);
        
        if (!fs.existsSync(absolutePath)) {
            console.error(`Error: File not found at "${filePath}"`);
            exit(1);
        }

        const rawData = fs.readFileSync(absolutePath, 'utf8');
        const json = JSON.parse(rawData);

        // Ensure the JSON contains the data array
        if (!json.data || !Array.isArray(json.data)) {
            console.error(`Error: File "${filePath}" does not contain a valid "data" array.`);
            exit(1);
        }

        return json.data;
    } catch (err) {
        console.error(`Error reading "${filePath}":`, err.message);
        exit(1);
    }
}

// Compare data between the two files
function compareLeaderboards(oldData, newData) {
    console.log(`Comparing files...`);
    console.log(`File 1 records: ${oldData.length}`);
    console.log(`File 2 records: ${newData.length}`);
    console.log('');

    // Helper to normalise names for keys (treat undefined/null as empty string)
    const getKey = (p) => (p.name === undefined || p.name === null) ? '' : String(p.name);

    // Debug Mode: If a specific player was requested, print their raw data from both files and exit
    if (debugPlayerName) {
        console.log(`--- DEBUG: Inspecting "${debugPlayerName}" ---`);
        const p1 = oldData.find(p => getKey(p) === debugPlayerName);
        const p2 = newData.find(p => getKey(p) === debugPlayerName);

        console.log('\n[File 1 Data]:');
        console.log(p1 || 'Player not found in File 1');
        
        console.log('\n[File 2 Data]:');
        console.log(p2 || 'Player not found in File 2');
        
        console.log('\nExiting debug mode.');
        exit(0);
    }

    // Use Maps for efficient lookup by normalised name
    const oldMap = new Map(oldData.map(p => [getKey(p), p]));
    const newMap = new Map(newData.map(p => [getKey(p), p]));

    const report = {
        idChanges: [],
        rankChanges: [],
        removed: [],
        added: []
    };

    // Normalise string to handle null or undefined for properties
    const clean = (str) => (!str) ? '' : String(str).trim();

    // Iterate through old data to find changes or removals
    for (const [name, oldPlayer] of oldMap) {
        if (newMap.has(name)) {
            const newPlayer = newMap.get(name);

            // Check third party usernames
            const idTypes = ['steamName', 'psnName', 'xboxName'];
            const currentIdChanges = [];

            idTypes.forEach(type => {
                const oldVal = clean(oldPlayer[type]);
                const newVal = clean(newPlayer[type]);

                if (oldVal !== newVal) {
                    currentIdChanges.push(`${type}: "${oldVal || '(empty)'}" -> "${newVal || '(empty)'}"`);
                }
            });

            if (currentIdChanges.length > 0) {
                report.idChanges.push({ name: name || 'Unknown', changes: currentIdChanges });
            }

            // Check rank
            if (oldPlayer.rank !== newPlayer.rank) {
                report.rankChanges.push({
                    name: name || 'Unknown',
                    oldRank: oldPlayer.rank,
                    newRank: newPlayer.rank
                });
            }

            // Remove from map to isolate new players later
            newMap.delete(name);

        } else {
            // Player exists in old file but not new
            report.removed.push({ name: name || 'Unknown', rank: oldPlayer.rank });
        }
    }

    // Remaining items in newMap are additions
    for (const [name, newPlayer] of newMap) {
        report.added.push({ name: name || 'Unknown', rank: newPlayer.rank });
    }

    return report;
}

// Format and print the results
function printReport(report) {
    let hasChanges = false;

    // 1. Third Party ID Changes
    console.log('--- Third Party ID Changes ---');
    if (report.idChanges.length === 0) {
        console.log('No ID changes detected.');
    } else {
        hasChanges = true;
        report.idChanges.forEach(item => {
            console.log(`Player: ${item.name}`);
            item.changes.forEach(c => console.log(`  ${c}`));
        });
    }
    console.log('');

    // 2. Players Removed
    console.log(`--- Players Removed (${report.removed.length}) ---`);
    if (report.removed.length === 0) {
        console.log('No players left the leaderboard.');
    } else {
        hasChanges = true;
        report.removed.forEach(item => {
            console.log(`- ${item.name} (Previous Rank: ${item.rank})`);
        });
    }
    console.log('');

    // 3. Players Added
    console.log(`--- Players Added (${report.added.length}) ---`);
    if (report.added.length === 0) {
        console.log('No new players found.');
    } else {
        hasChanges = true;
        report.added.forEach(item => {
            console.log(`+ ${item.name} (Current Rank: ${item.rank})`);
        });
    }
    console.log('');

    // 4. Rank Changes
    console.log(`--- Rank Changes (${report.rankChanges.length}) ---`);
    if (report.rankChanges.length === 0) {
        console.log('No rank changes detected.');
    } else {
        hasChanges = true;
        report.rankChanges.forEach(item => {
            console.log(`${item.name}: Rank ${item.oldRank} -> ${item.newRank}`);
        });
    }
    console.log('');

    if (!hasChanges) {
        console.log('ALERT: No changes were found.');
        console.log('This usually means the two files on your disk contain identical data.');
        console.log('Use: node historical-compare.js <file1> <file2> "PlayerName" to verify.');
    }
}

// Main execution
const data1 = loadJsonFile(oldFilePath);
const data2 = loadJsonFile(newFilePath);

const results = compareLeaderboards(data1, data2);
printReport(results);