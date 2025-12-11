/*
This tool converts Season 1 legacy leaderboard data into the standardised format.
It maps text-based leagues to integers, cleans up empty strings, and minifies the output.

Usage: node minify-s1.js <input_file> <output_file>

-- Made by S4N-T0S
*/

import fs from 'fs';
import path from 'path';
import { argv, exit } from 'process';

const args = argv.slice(2);

if (args.length < 2) {
    console.error('Error: Please provide input and output file paths.');
    console.error('Usage: node minify-s1.js <input_file> <output_file>');
    exit(1);
}

const [inputPath, outputPath] = args;

// Mapping derived from your snippet (Text -> ID)
const LEAGUE_TO_ID = {
    "Ruby": 21,
    "Diamond 1": 20,
    "Diamond 2": 19,
    "Diamond 3": 18,
    "Diamond 4": 17,
    "Platinum 1": 16,
    "Platinum 2": 15,
    "Platinum 3": 14,
    "Platinum 4": 13,
    "Gold 1": 12,
    "Gold 2": 11,
    "Gold 3": 10,
    "Gold 4": 9,
    "Silver 1": 8,
    "Silver 2": 7,
    "Silver 3": 6,
    "Silver 4": 5,
    "Bronze 1": 4,
    "Bronze 2": 3,
    "Bronze 3": 2,
    "Bronze 4": 1,
    "Unranked": 0
};

function isValidString(str) {
    return str && typeof str === 'string' && str.trim().length > 0;
}

function processLeaderboard() {
    try {
        // Read input
        const absInput = path.resolve(inputPath);
        if (!fs.existsSync(absInput)) {
            throw new Error(`Input file not found: ${inputPath}`);
        }

        const rawData = fs.readFileSync(absInput, 'utf8');
        const json = JSON.parse(rawData);

        if (!Array.isArray(json.data)) {
            throw new Error('Input JSON must contain a "data" array.');
        }

        console.log(`Processing ${json.data.length} entries...`);

        // Transform data
        const transformedData = json.data.map((entry, _index) => {
            const leagueText = entry.league;

            // Validation: Ensure league exists in our map
            if (LEAGUE_TO_ID[leagueText] === undefined) {
                throw new Error(`Unknown league "${leagueText}" found at Rank ${entry.rank} (Name: ${entry.name || 'Unknown'}).`);
            }

            // Construct new minimal object
            // Note: Mapping 'fame' to 'rankScore' to match modern S3 standards -> If it doesn't exist, no problem (S2 had no rankScore)
            const newEntry = {
                rank: entry.rank,
                leagueNumber: LEAGUE_TO_ID[leagueText],
                rankScore: entry.fame,
                cashouts: entry.cashouts 
            };

            // Only add Name/ID fields if they actually exist
            if (isValidString(entry.name)) newEntry.name = entry.name;
            if (isValidString(entry.steamName)) newEntry.steamName = entry.steamName;
            if (isValidString(entry.psnName)) newEntry.psnName = entry.psnName;
            if (isValidString(entry.xboxName)) newEntry.xboxName = entry.xboxName;
            
            return newEntry;
        });

        // Construct final object
        const finalOutput = {
            meta: json.meta,
            count: transformedData.length,
            data: transformedData
        };

        // Write minified output
        fs.writeFileSync(outputPath, JSON.stringify(finalOutput));
        console.log(`Success! Converted data saved to ${outputPath}`);

    } catch (err) {
        console.error('Processing Failed:', err.message);
        exit(1);
    }
}

processLeaderboard();