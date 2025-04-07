/*
This tool was made to merge multiple json crossplay,steam,xbox,psn files together
it requires editing for each season as for example season 1 had fame points and this used those 
to verify duplicates on steam, also this season 1 has cashouts data where others do not.
I left many comments in the file in case anyone needs this and to edit it.

-- Made by S4N-T0S
*/

import { promises as fs } from 'fs';

async function mergeLeaderboards() {
    let duplicatesRemoved = 0;
    
    try {
        const [crossplayData, steamData, xboxData, psnData] = await Promise.all([
            fs.readFile('crossplay.json', 'utf8'),
            fs.readFile('steam.json', 'utf8'),
            fs.readFile('xbox.json', 'utf8'),
            fs.readFile('psn.json', 'utf8')
        ]);

        // Parse JSON files
        const crossplay = JSON.parse(crossplayData);
        const steam = JSON.parse(steamData);
        const xbox = JSON.parse(xboxData);
        const psn = JSON.parse(psnData);

        // Create a map for Steam players (since Steam names aren't unique)
        // Map structure: steamName => [{fame: number, player: object}]
        const steamPlayers = new Map();
        
        // Create sets for PSN and Xbox players (since these are unique)
        const psnNames = new Set();
        const xboxNames = new Set();

        // Fill reference collections from crossplay data
        crossplay.data.forEach(player => {
            if (player.steamName) {
                if (!steamPlayers.has(player.steamName)) {
                    steamPlayers.set(player.steamName, []);
                }
                steamPlayers.get(player.steamName).push({
                    fame: player.fame, // It's enough to do this check alone, because its highly unlikely 2 players on steam will have exact same name and RS
                    player: player
                });
            }
            if (player.xboxName) xboxNames.add(player.xboxName);
            if (player.psnName) psnNames.add(player.psnName);
        });

        // Initialize merged data with crossplay data
        const mergedOutput = {
            meta: {
                leaderboardVersion: crossplay.meta.leaderboardVersion,
                leaderboardPlatform: "merged"
            },
            data: [...crossplay.data]
        };

        // Helper function to check if Steam player exists with same fame
        function isSteamPlayerDuplicate(playerName, playerFame) {
            if (!steamPlayers.has(playerName)) return false;
            return steamPlayers.get(playerName).some(entry => entry.fame === playerFame);
        }

        // Helper function to process platform-specific data
        function processPlatformData(platformData, platform) {
            platformData.data.forEach(player => {
                let isDuplicate = false;
                
                // Check if this player exists in crossplay data
                switch (platform) {
                    case 'steam':
                        // For Steam, check both name and fame
                        isDuplicate = isSteamPlayerDuplicate(player.name, player.fame);
                        break;
                    case 'xbox':
                        // For Xbox, just check the name as it's unique
                        isDuplicate = xboxNames.has(player.name);
                        break;
                    case 'psn':
                        // For PSN, just check the name as it's unique
                        isDuplicate = psnNames.has(player.name);
                        break;
                }

                if (isDuplicate) {
                    duplicatesRemoved++;
                } else {
                    // Create a new player entry with the correct format
                    const newPlayer = {
                        rank: player.rank,
                        change: player.change,
                        name: "", // Leave the name field empty for platform-specific entries
                        steamName: platform === 'steam' ? player.name : "",
                        xboxName: platform === 'xbox' ? player.name : "",
                        psnName: platform === 'psn' ? player.name : "",
                        leagueNumber: player.leagueNumber,
                        league: player.league,
                        cashouts: player.cashouts,
                        fame: player.fame
                    };
                    mergedOutput.data.push(newPlayer);
                }
            });
        }

        // Process each platform's data
        processPlatformData(steam, 'steam');
        processPlatformData(xbox, 'xbox');
        processPlatformData(psn, 'psn');

        // Update the count
        mergedOutput.count = mergedOutput.data.length;

        // Sort by rank
        mergedOutput.data.sort((a, b) => a.rank - b.rank);

        // Write merged data to file
        await fs.writeFile(
            'merged_leaderboard.json',
            JSON.stringify(mergedOutput, null, 2)
        );

        console.log(`Merge completed successfully!`);
        console.log(`Total players in merged file: ${mergedOutput.data.length}`);
        console.log(`Duplicates removed: ${duplicatesRemoved}`);
        console.log(`Players found in:`);
        console.log(`- Crossplay: ${crossplay.data.length}`);
        console.log(`- Steam: ${steam.data.length} processed`);
        console.log(`- Xbox: ${xbox.data.length} processed`);
        console.log(`- PSN: ${psn.data.length} processed`);

    } catch (error) {
        console.error('Error processing leaderboards:', error);
    }
}

// Run the merge
mergeLeaderboards();