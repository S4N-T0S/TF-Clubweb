// Columnar form of a season snapshot ({ meta, count, data: [rows] }), shared by the build
// plugin (tools/vite-historical-data.js) and the browser loader in historicalDataService.js.
// Absent row keys stay absent: a string column holds '' for a missing value, and the
// rankScore and cashouts columns exist only in seasons whose rows carry them.
const STRING_COLUMNS = ['name', 'steamName', 'psnName', 'xboxName', 'clubTag', 'officialClubName'];

export const encodeSeason = (season) => {
  const rows = season.data;
  const column = { meta: season.meta, count: season.count, n: rows.length };
  for (const key of STRING_COLUMNS) column[key] = rows.map((row) => row[key] ?? '');
  column.rankDelta = rows.map((row, i) => (i ? row.rank - rows[i - 1].rank : row.rank));
  const rle = [];
  let league;
  let run = 0;
  for (const row of rows) {
    if (run && row.leagueNumber === league) {
      run++;
    } else {
      if (run) rle.push(league, run);
      league = row.leagueNumber;
      run = 1;
    }
  }
  if (run) rle.push(league, run);
  column.leagueRle = rle;
  if (rows.some((row) => 'rankScore' in row)) {
    column.rsDelta = rows.map((row, i) => (i ? rows[i - 1].rankScore - row.rankScore : row.rankScore));
  }
  if (rows.some((row) => 'cashouts' in row)) column.cashouts = rows.map((row) => row.cashouts);
  return column;
};

const fail = (seasonKey, detail) => {
  throw new Error(`Historical data for ${seasonKey}: ${detail}`);
};

const readColumn = (source, key, n, seasonKey, isValid) => {
  const values = source[key];
  if (!Array.isArray(values) || values.length !== n) fail(seasonKey, `${key} is not a ${n}-entry array`);
  for (let i = 0; i < n; i++) if (!isValid(values[i])) fail(seasonKey, `${key}[${i}] has an unexpected value`);
  return values;
};

const isInt = Number.isSafeInteger;
const isString = (value) => typeof value === 'string';
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// The blob is network input: every column is checked for shape and type before any row is built.
export const decodeSeason = (source, seasonKey) => {
  if (!source || typeof source !== 'object' || !isInt(source.n) || source.n < 0) fail(seasonKey, 'row count missing');
  const n = source.n;
  if (source.count !== n || !source.meta || typeof source.meta !== 'object') fail(seasonKey, 'count or meta missing');
  const strings = STRING_COLUMNS.map((key) => readColumn(source, key, n, seasonKey, isString));
  const rankDelta = readColumn(source, 'rankDelta', n, seasonKey, isInt);
  const rle = source.leagueRle;
  if (!Array.isArray(rle) || rle.length % 2) fail(seasonKey, 'leagueRle is not a list of pairs');
  let covered = 0;
  for (let i = 0; i < rle.length; i += 2) {
    if (!isInt(rle[i]) || !isInt(rle[i + 1]) || rle[i + 1] < 1) fail(seasonKey, `leagueRle pair ${i / 2} is invalid`);
    covered += rle[i + 1];
  }
  if (covered !== n) fail(seasonKey, 'leagueRle does not cover every row');
  const rsDelta = source.rsDelta === undefined ? null : readColumn(source, 'rsDelta', n, seasonKey, isInt);
  const cashouts = source.cashouts === undefined ? null : readColumn(source, 'cashouts', n, seasonKey, isNumber);

  const rows = new Array(n);
  let rank = 0;
  let score = 0;
  let league = 0;
  let left = 0;
  let pair = 0;
  for (let i = 0; i < n; i++) {
    rank += rankDelta[i];
    if (!left) {
      league = rle[pair];
      left = rle[pair + 1];
      pair += 2;
    }
    left--;
    const row = { rank };
    for (let s = 0; s < STRING_COLUMNS.length; s++) if (strings[s][i]) row[STRING_COLUMNS[s]] = strings[s][i];
    row.leagueNumber = league;
    if (rsDelta) {
      score = i ? score - rsDelta[i] : rsDelta[0];
      row.rankScore = score;
    }
    if (cashouts) row.cashouts = cashouts[i];
    rows[i] = row;
  }
  return { meta: source.meta, count: source.count, data: rows };
};
