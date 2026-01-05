import { fetchWithRetry } from './apiService';

// Storing club members in a google sheets to reduce pointless commits on GitHub.
const CLUB_MEMBERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9bH84oHf5vPtElxeJyS4n4oHDPe7cm-_zYkFF0aX4ELf2rq37X6G6QEmrRvmnD16Afb7anaB2AVzC/pub?output=csv';

function parseCsvData(csvText) {
  return csvText
    .split('\n')
    .slice(1) // Skip header row
    .filter(Boolean)
    .map(row => {
      const [embarkId] = row.split(',');
      return {
        embarkId: embarkId?.trim() || null,
        //discord: discord?.trim() || null -- Discord Link Removed.
      };
    })
    .filter(player => player.embarkId !== null && player.embarkId !== ''); // Filter out entries where embarkId is null or empty
};

export async function fetchClubMembers() {
  try {
    const csvText = await fetchWithRetry(CLUB_MEMBERS_CSV_URL);
    return parseCsvData(csvText);
  } catch (error) {
    console.error('Error fetching club members:', error);
    return [];
  }
};