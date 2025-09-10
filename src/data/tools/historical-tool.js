/*
This tool was made to download locally an existing leaderboard from Embark's servers,
storing it to use later for historical purposes. It transforms the data into a more usable format.

-- Made by S4N-T0S
*/

import { promises as fs } from 'fs';

async function fetchEmbarkData() {
  const url = `https://id.embark.games/the-finals/leaderboards/s7`; // Obviously change depending on the season...

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Embark API request failed with status ${response.status}`);
  }
  const html = await response.text();

  const startMarker = '<script id="__NEXT_DATA__" type="application/json">';
  const startIndex = html.indexOf(startMarker) + startMarker.length;
  const endIndex = html.indexOf('</script>', startIndex);

  if (startIndex === startMarker.length - 1) {
    throw new Error('Failed to find json data in Embark response');
  }

  const jsonData = JSON.parse(html.slice(startIndex, endIndex));
  return transformLeaderboardData(jsonData.props.pageProps.entries);
}

function transformLeaderboardData(entries) {
  const len = entries.length;
  const result = new Array(len);

  for (let i = 0; i < len; i++) {
    const entry = entries[i];
    // Map league number to league name
    const leagueNumber = +entry[4];
    const league = getLeagueName(leagueNumber);

    result[i] = {
      rank: +entry[1],
      change: +entry[2],
      name: entry[3] || 'Unknown#0000',
      ...(entry[6] && { steamName: entry[6] }),
      ...(entry[7] && { psnName: entry[7] }),
      ...(entry[8] && { xboxName: entry[8] }),
      ...(entry[12] && { clubTag: entry[12] }),
      leagueNumber: leagueNumber,
      league: league,
      rankScore: +entry[5]
    };
  }
  return result;
}

function getLeagueName(leagueNumber) {
  // Map league numbers to names
  const leagueMap = {
    21: "Ruby",
    20: "Diamond 1",
    19: "Diamond 2",
    18: "Diamond 3",
    17: "Diamond 4",
    16: "Platinum 1",
    15: "Platinum 2",
    14: "Platinum 3",
    13: "Platinum 4",
    12: "Gold 1",
    11: "Gold 2",
    10: "Gold 3",
    9: "Gold 4",
    8: "Silver 1",
    7: "Silver 2",
    6: "Silver 3",
    5: "Silver 4",
    4: "Bronze 1",
    3: "Bronze 2",
    2: "Bronze 3",
    1: "Bronze 4",
    0: "Unranked"
  };

  return leagueMap[leagueNumber] || "Unknown";
}

async function main() {
  try {
    console.log("Fetching leaderboard data...");
    const leaderboardData = await fetchEmbarkData();
    
    // Create the final JSON structure
    const finalData = {
      meta: {
        leaderboardVersion: "s7",
        leaderboardPlatform: "crossplay"
      },
      count: leaderboardData.length,
      data: leaderboardData
    };
    
    // Write to data.json file
    fs.writeFile('data.json', JSON.stringify(finalData));
    console.log(`Successfully saved ${leaderboardData.length} leaderboard entries to data.json`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();