// Currently storing club members in a google sheets to reduce pointless commits on GitHub. Could store on KV or a DB but no need for now.
export const CLAN_MEMBERS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9bH84oHf5vPtElxeJyS4n4oHDPe7cm-_zYkFF0aX4ELf2rq37X6G6QEmrRvmnD16Afb7anaB2AVzC/pub?output=csv';

export const fetchClanMembers = async () => {
  try {
    const response = await fetch(CLAN_MEMBERS_URL);
    if (!response.ok) {
      throw new Error('Failed to fetch clan members');
    }
    
    const csvText = await response.text();
    return parseCsvData(csvText);
  } catch (error) {
    console.error('Error fetching clan members:', error);
    return [];
  }
};

const parseCsvData = (csvText) => {
  return csvText
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map(row => {
      const [embarkId, discord, pruby] = row.split(',');
      return {
        embarkId: embarkId?.trim() || null,
        discord: discord?.trim() || null,
        pruby: pruby?.trim()?.toUpperCase() === 'TRUE'
      };
    });
};