/*
This tool was made to download locally an existing leaderboard from Embark's servers,
storing it to use later for historical purposes. It transforms the data into a more usable format.
Now with smallest possible file size for archiving - disabled change and league human readable names.

Added support for non-standard modes (e.g. 'orf', 's8tdm').
When these modes are used, the full dataset is preserved without filtering keys.

Usage: node historical-tool.js <season_id>
Examples: 
  node historical-tool.js 3      (Downloads Season 3, minimal format)
  node historical-tool.js s5     (Downloads Season 5, minimal format)
  node historical-tool.js orf    (Downloads ORF, full raw format)
  node historical-tool.js s8tdm  (Downloads S8TDM, full raw format)

-- Made by S4N-T0S
*/

import { promises as fs } from 'fs';
import { argv, exit } from 'process';

// Get season from command line args, defaulting to 's3' if not provided
const args = argv.slice(2);
const rawArg = args[0] || 's3';

const seasonId = /^\d+$/.test(rawArg) ? `s${rawArg}` : rawArg;

// Determine if we should perform minimal filtering or keep full data.
// We assume standard seasons (s1, s2...) use the minimal schema to save space.
// Any other input (orf, s8tdm) is treated as a special mode requiring full data preservation.
const isStandardSeason = /^s\d+$/.test(seasonId);

async function fetchEmbarkData(season, minimalMode) {
  const url = `https://id.embark.games/the-finals/leaderboards/${season}`;

  console.log(`Requesting data from: ${url}`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Embark API request failed with status ${response.status}`);
  }
  
  const html = await response.text();

  // Extract the NEXT.js data blob
  const startMarker = '<script id="__NEXT_DATA__" type="application/json">';
  const startIndex = html.indexOf(startMarker);
  
  if (startIndex === -1) {
    throw new Error('Failed to find JSON data in Embark response');
  }

  const payloadStart = startIndex + startMarker.length;
  const endIndex = html.indexOf('</script>', payloadStart);
  
  const jsonData = JSON.parse(html.slice(payloadStart, endIndex));
  
  // Navigate the Next.js props structure to find the entries
  if (!jsonData.props || !jsonData.props.pageProps || !jsonData.props.pageProps.entries) {
    throw new Error('JSON structure changed, could not find entries.');
  }

  return transformLeaderboardData(jsonData.props.pageProps.entries, minimalMode);
}

function transformLeaderboardData(entries, minimalMode) {
  if (!minimalMode) {
    console.log("Non-standard mode detected. Preserving full dataset.");
    return entries;
  }

  const len = entries.length;
  const result = new Array(len);

  for (let i = 0; i < len; i++) {
    const entry = entries[i];
    
    // Create the minimal object
    const player = {
      rank: +entry[1],
      name: entry[3] || 'Unknown#0000',
      leagueNumber: +entry[4],
      rankScore: +entry[5]
    };

    // Conditionally add third-party IDs only if they contain valid text.
    // This saves disk space by preventing keys like 'steamName': ""
    if (isValidString(entry[6])) player.steamName = entry[6];
    if (isValidString(entry[7])) player.psnName = entry[7];
    if (isValidString(entry[8])) player.xboxName = entry[8];
    if (isValidString(entry[12])) player.clubTag = entry[12];
    //if (isValidString(entry[13])) player.clubUUId = entry[13];

    result[i] = player;
  }
  return result;
}

// Helper to check if a string is not null, not undefined, and not empty whitespace
function isValidString(str) {
  return str && typeof str === 'string' && str.trim().length > 0;
}

async function main() {
  try {
    console.log(`Fetching leaderboard data for ${seasonId}...`);
    
    // Pass the 'isStandardSeason' flag to determine if we should minimise the data
    const leaderboardData = await fetchEmbarkData(seasonId, isStandardSeason);
    
    // Create the final JSON structure
    const finalData = {
      meta: {
        leaderboardVersion: seasonId,
        leaderboardPlatform: "crossplay",
        dataMode: isStandardSeason ? "minimal" : "full"
      },
      count: leaderboardData.length,
      data: leaderboardData
    };
    
    const fileName = `${seasonId}.json`;
    
    // Writing with no indentation to ensure smallest possible file size
    await fs.writeFile(fileName, JSON.stringify(finalData));
    
    console.log(`Successfully saved ${leaderboardData.length} entries to ${fileName}`);
    
  } catch (error) {
    console.error("Error:", error.message);
    exit(1);
  }
}

main();