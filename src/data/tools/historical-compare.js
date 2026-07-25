/*
This tool was made to compare 2 historical leaderboard json files locally,
it reports differences in ranks, rank scores, leagues, club tags, third party
IDs (steam,psn,xbox) and players added/removed.

When re-downloading a frozen season archive (e.g. to pick up officialClubName),
every section except "Official Club Names" should be empty — any hit means the
archived content itself changed, not just the new field. officialClubName
differences are reported separately as an informational summary because they
are the EXPECTED outcome of re-downloading with the updated historical-tool.

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
        scoreChanges: [],
        leagueChanges: [],
        clubChanges: [],
        overrideRedecorations: [],
        officialChanges: [],
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

            // Check rank score
            if (oldPlayer.rankScore !== newPlayer.rankScore) {
                report.scoreChanges.push({
                    name: name || 'Unknown',
                    oldScore: oldPlayer.rankScore,
                    newScore: newPlayer.rankScore
                });
            }

            // Check league
            if (oldPlayer.leagueNumber !== newPlayer.leagueNumber) {
                report.leagueChanges.push({
                    name: name || 'Unknown',
                    oldLeague: oldPlayer.leagueNumber,
                    newLeague: newPlayer.leagueNumber
                });
            }

            // Check club tag. A tag change on an entry that is an OFFICIAL club
            // in the new file is Embark re-decorating the frozen row with the
            // club's CURRENT override tag (e.g. TSORG -> TS) — expected on a raw
            // re-download and reported separately: the merge-official tool exists
            // precisely to keep the period-correct tag from the old file.
            if (clean(oldPlayer.clubTag) !== clean(newPlayer.clubTag)) {
                if (clean(newPlayer.officialClubName)) {
                    report.overrideRedecorations.push({
                        name: name || 'Unknown',
                        oldClub: clean(oldPlayer.clubTag) || '(none)',
                        newClub: clean(newPlayer.clubTag) || '(none)',
                        official: clean(newPlayer.officialClubName)
                    });
                } else {
                    report.clubChanges.push({
                        name: name || 'Unknown',
                        oldClub: clean(oldPlayer.clubTag) || '(none)',
                        newClub: clean(newPlayer.clubTag) || '(none)'
                    });
                }
            }

            // Check official club name (expected additions on a re-download)
            if (clean(oldPlayer.officialClubName) !== clean(newPlayer.officialClubName)) {
                report.officialChanges.push({
                    name: name || 'Unknown',
                    clubTag: clean(newPlayer.clubTag) || clean(oldPlayer.clubTag) || '(none)',
                    oldOfficial: clean(oldPlayer.officialClubName) || null,
                    newOfficial: clean(newPlayer.officialClubName) || null
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

    // 5. Rank Score Changes
    console.log(`--- Rank Score Changes (${report.scoreChanges.length}) ---`);
    if (report.scoreChanges.length === 0) {
        console.log('No rank score changes detected.');
    } else {
        hasChanges = true;
        report.scoreChanges.forEach(item => {
            console.log(`${item.name}: ${item.oldScore} -> ${item.newScore}`);
        });
    }
    console.log('');

    // 6. League Changes
    console.log(`--- League Changes (${report.leagueChanges.length}) ---`);
    if (report.leagueChanges.length === 0) {
        console.log('No league changes detected.');
    } else {
        hasChanges = true;
        report.leagueChanges.forEach(item => {
            console.log(`${item.name}: League ${item.oldLeague} -> ${item.newLeague}`);
        });
    }
    console.log('');

    // 7. Club Tag Changes
    console.log(`--- Club Tag Changes (${report.clubChanges.length}) ---`);
    if (report.clubChanges.length === 0) {
        console.log('No club tag changes detected.');
    } else {
        hasChanges = true;
        report.clubChanges.forEach(item => {
            console.log(`${item.name}: ${item.oldClub} -> ${item.newClub}`);
        });
    }
    console.log('');

    // 8. Override Tag Re-decorations (informational — EXPECTED on a raw
    // re-download; Embark stamps the club's CURRENT override tag onto frozen
    // rows; grouped rather than listed per player)
    console.log(`--- Override Tag Re-decorations (${report.overrideRedecorations.length} players affected) ---`);
    if (report.overrideRedecorations.length === 0) {
        console.log('No override re-decorations.');
    } else {
        const groupedRedec = new Map();
        report.overrideRedecorations.forEach(item => {
            const key = `${item.oldClub} -> ${item.newClub} (${item.official})`;
            groupedRedec.set(key, (groupedRedec.get(key) || 0) + 1);
        });
        for (const [desc, count] of groupedRedec) {
            console.log(`${desc} (${count} players)`);
        }
        console.log('Note: expected on a raw re-download. Use merge-official.js to keep the period-correct tags.');
    }
    console.log('');

    // 9. Official Club Names (informational — EXPECTED when re-downloading to
    // pick up the officialClubName field; grouped rather than listed per player)
    console.log(`--- Official Club Names (${report.officialChanges.length} players affected) ---`);
    if (report.officialChanges.length === 0) {
        console.log('No official club name differences.');
    } else {
        const grouped = new Map();
        report.officialChanges.forEach(item => {
            const key = `[${item.clubTag}] ${item.oldOfficial || '(none)'} -> ${item.newOfficial || '(none)'}`;
            grouped.set(key, (grouped.get(key) || 0) + 1);
        });
        for (const [desc, count] of grouped) {
            console.log(`${desc} (${count} players)`);
        }
        console.log('Note: gaining officialClubName is expected on a re-download; it does not count as a data change.');
    }
    console.log('');

    if (!hasChanges) {
        if (report.officialChanges.length > 0 || report.overrideRedecorations.length > 0) {
            console.log('RESULT: Only officialClubName / override re-decoration differences were found — the archive content is otherwise identical.');
            console.log('This is the expected outcome of re-downloading a frozen season with the updated historical-tool.');
        } else {
            console.log('ALERT: No changes were found.');
            console.log('This usually means the two files on your disk contain identical data.');
            console.log('Use: node historical-compare.js <file1> <file2> "PlayerName" to verify.');
        }
    }
}

// Main execution
const data1 = loadJsonFile(oldFilePath);
const data2 = loadJsonFile(newFilePath);

const results = compareLeaderboards(data1, data2);
printReport(results);