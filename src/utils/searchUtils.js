// src/utils/searchUtils.js

/**
 * Parses a search query string to separate the name, club, and search type.
 * This is the single source of truth for all search syntax rules across the application.
 * Handles the following syntax:
 * - `[tag]`: Exact match for the club tag.
 * - `[tag`: Starts-with match for the club tag.
 * - `tag]`: Ends-with match for the club tag.
 * - `[]`: No-club match (`clubQuery` will be `''`).
 * - All syntax can be combined with a name search (e.g., `[tag name`).
 *
 * @param {string} query - The raw search query.
 * @returns {{nameQuery: string, clubQuery: string|null, clubSearchType: string}} An object with the parsed query parts.
 */
export const parseSearchQuery = (query) => {
    const lowerQuery = query.toLowerCase().trim();
    let clubQuery = null;
    let nameQuery = lowerQuery;
    let clubSearchType = 'contains'; // Default type if no brackets are used

    const closedTagMatch = lowerQuery.match(/\[(.*?)\]/);
    const startsWithMatch = lowerQuery.match(/\[(\S+)/);
    const endsWithMatch = lowerQuery.match(/(\S+)\]/);

    if (closedTagMatch) {
        clubSearchType = 'exact';
        clubQuery = closedTagMatch[1];
        nameQuery = lowerQuery.replace(closedTagMatch[0], '').trim();
    } else if (startsWithMatch) {
        clubSearchType = 'startsWith';
        clubQuery = startsWithMatch[1];
        nameQuery = lowerQuery.replace(startsWithMatch[0], '').trim();
    } else if (endsWithMatch) {
        clubSearchType = 'endsWith';
        clubQuery = endsWithMatch[1];
        nameQuery = lowerQuery.replace(endsWithMatch[0], '').trim();
    }
    
    return { nameQuery, clubQuery, clubSearchType };
};

/**
 * The definitive advanced filter function for player objects, using shared parsing logic.
 * Checks for matches against player names, platform names, and club tags.
 *
 * It understands the following syntax from the parser:
 * - `[tag]`: Exactly matches club `tag`.
 * - `[tag`: Matches clubs that START WITH `tag`.
 * - `tag]`: Matches clubs that END WITH `tag`.
 * - `[]`: Matches players with no club.
 * - `name`: Matches if the text is found in the player's Embark ID, Steam Name,
 *           PSN Name, Xbox Name, or their club tag.
 * - Correctly parses all compound queries, e.g., `[tag name`, `name tag]`.
 *
 * @param {object} player - The player object from the leaderboard.
 * @param {string} query - The search query.
 * @returns {boolean} - True if the player matches.
 */
export const filterPlayerByQuery = (player, query) => {
    const { nameQuery, clubQuery, clubSearchType } = parseSearchQuery(query);

    if (!nameQuery && clubQuery === null) return true;

    // 1. Collect all searchable text fields from the player object.
    const playerClub = player.clubTag ? player.clubTag.toLowerCase() : null;
    const searchableNames = [
        player.name?.toLowerCase(),
        player.steamName?.toLowerCase(),
        player.psnName?.toLowerCase(),
        player.xboxName?.toLowerCase()
    ].filter(Boolean);

    // 2. Perform filter checks based on the parsed query.
    const namePasses = !nameQuery ||
        searchableNames.some(n => n.includes(nameQuery)) ||
        (playerClub && playerClub.includes(nameQuery));

    let clubPasses = true;
    if (clubQuery !== null) {
        switch (clubSearchType) {
            case 'exact':
                clubPasses = (playerClub === clubQuery) || (clubQuery === '' && !playerClub);
                break;
            case 'startsWith':
                clubPasses = playerClub && playerClub.startsWith(clubQuery);
                break;
            case 'endsWith':
                clubPasses = playerClub && playerClub.endsWith(clubQuery);
                break;
        }
    }

    return namePasses && clubPasses;
};