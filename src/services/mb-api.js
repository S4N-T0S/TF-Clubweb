// Currently storing club members in a google sheets to reduce pointless commits on GitHub. Could store on KV or a DB but no need for now.
const DEFAULT_OPTIONS = {
  url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9bH84oHf5vPtElxeJyS4n4oHDPe7cm-_zYkFF0aX4ELf2rq37X6G6QEmrRvmnD16Afb7anaB2AVzC/pub?output=csv',
  retryCount: 1,
  retryDelay: 50
};

async function fetchWithRetry(options = {}) {
  const { url, retryCount, retryDelay } = { ...DEFAULT_OPTIONS, ...options };
  
  for (let attempt = 1; attempt <= retryCount + 1; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`, attempt);
      }
      return await response.text();
    } catch (error) {
      if (attempt === retryCount + 1) {
        throw new Error(`Failed to fetch after ${retryCount + 1} attempts: ${error.message}`);
      }
      console.warn(`Attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

export async function fetchClanMembers() {
  try {
    const csvText = await fetchWithRetry();
    return parseCsvData(csvText);
  } catch (error) {
    console.error('Error fetching clan members:', error);
    return [];
  }
};

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
    });
};