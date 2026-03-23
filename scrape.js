// TTC Klánovice – STIS full scraper v5
// node scrape.js [rocnik] [outfile]  →  generuje data.js (nebo jiný soubor)
// Příklady:
//   node scrape.js                       (auto-detekce nejnovějšího ročníku → data.js)
//   node scrape.js 2025                  (ročník 2024/25 → data.js)
//   node scrape.js 2024 data_prev.js     (předchozí sezóna → data_prev.js)

const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://stis.ping-pong.cz';
const SVAZ = '420101';
const ODDIL = '420109007';

// Ročník z argumentu nebo auto-detekce.
// STIS používá rok ZAHÁJENÍ sezóny: rocnik-2025 = sezóna 2025/26 (podzim 2025 – jaro 2026)
const ROCNIK   = process.argv[2] || String(new Date().getFullYear() - (new Date().getMonth() < 7 ? 1 : 0));
const OUT_FILE = process.argv[3] || 'data.js';
const VAR_NAME = OUT_FILE.includes('prev2') ? 'CLUB_DATA_PREV2' : OUT_FILE.includes('prev') ? 'CLUB_DATA_PREV' : 'CLUB_DATA';

const TEAM_SUFFIX = { 63401: 'A', 63402: 'B', 63403: 'C', 63404: 'D', 63405: 'E' };
const KNOWN_IDS   = new Set(Object.keys(TEAM_SUFFIX).map(Number));

// ── Browser ───────────────────────────────────────────────
async function makePage(browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  await p.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  return p;
}

async function goto(page, url, extraWait = 600) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(extraWait);
}

// ── Auto-discovery of team soutezIds for a given rocnik ──
async function discoverTeams(page, rocnik) {
  console.log(`[discover] Hledám týmy pro ročník ${rocnik}...`);
  await page.goto(`${BASE}/oddil-${ODDIL}/svaz-${SVAZ}/rocnik-${rocnik}`, { waitUntil: 'domcontentloaded' });
  // Wait until team links appear (druzstvo links render after Angular hydration)
  await page.waitForFunction(
    () => document.querySelectorAll('a[href*="druzstvo"]').length > 0,
    { timeout: 15000 }
  ).catch(() => {});
  await page.waitForTimeout(1000);

  const teams = await page.evaluate(() => {
    const seen = {};
    document.querySelectorAll('a[href*="druzstvo"]').forEach(a => {
      // URL format: /druzstvo-63401/svaz-420101/rocnik-2025/soutez-6274
      const m = a.href.match(/druzstvo-(\d+).*soutez-(\d+)/);
      if (!m) return;
      const drustvoId = m[1];
      const soutezId  = m[2];
      // All teams listed on the club page belong to our club – no ID filter needed
      if (!seen[drustvoId]) seen[drustvoId] = { soutezId, drustvoId, label: a.textContent.trim() };
    });
    return Object.values(seen);
  });

  // Assign team letter: sort by druzstvoId, label A/B/C/D/E in order
  const LETTERS = ['A','B','C','D','E','F'];
  return teams
    .sort((a, b) => Number(a.drustvoId) - Number(b.drustvoId))
    .map((t, i) => ({
      id:        Number(t.drustvoId),
      name:      `TTC Klánovice ${TEAM_SUFFIX[Number(t.drustvoId)] || LETTERS[i] || String(i+1)}`,
      soutezId:  t.soutezId,
      drustvoId: t.drustvoId,
    }));
}

// ── Parse match record ────────────────────────────────────
async function parseMatch(page, url, round) {
  await goto(page, url, 700);

  return page.evaluate(({ url, round }) => {
    // ── Header ──
    const hdrTable = document.querySelector('table.zapis_H');
    let homeTeam = '', awayTeam = '', date = '', competition = '';
    let scoreHome = 0, scoreAway = 0;

    if (hdrTable) {
      Array.from(hdrTable.querySelectorAll('tr')).forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.textContent.trim());
        if (cells[0]?.startsWith('POŘÁDAJÍCÍ')) homeTeam = cells[1] || '';
        if (cells[0]?.startsWith('HOSTUJÍCÍ'))  awayTeam = cells[1] || '';
        if (cells[0]?.startsWith('Datum dle')) {
          const m = cells[1]?.match(/(\d{1,2}\.\s*\d{2}\.\s*\d{4})/);
          if (m) date = m[1].replace(/\s/g, '');
        }
        if (cells[0]?.includes('Název soutěže') || cells[0]?.includes('Název')) {
          const cmp = cells.find((c, i) => i > 0 && c && !c.includes('Kolo') && !c.includes('Kategorie'));
          if (cmp) competition = cmp.replace('Název soutěže:\n\n','').split('\n')[0].trim();
        }
        // Score row ["10",":",  "6", ...]
        if (/^\d+$/.test(cells[0]) && cells[1] === ':' && /^\d+$/.test(cells[2])) {
          scoreHome = parseInt(cells[0]);
          scoreAway = parseInt(cells[2]);
        }
      });
    }

    // ── Extract competition from special cell ──
    if (!competition) {
      const cell = hdrTable?.querySelector('td');
      const full = cell?.textContent || '';
      const m = full.match(/\n\n(.+?)\n/);
      if (m) competition = m[1].trim();
    }

    // ── Results table ──
    const resTable = document.querySelector('table.zapis:not(.zapis_H):not(.statistika)');
    const matchResults = [];

    if (resTable) {
      Array.from(resTable.querySelectorAll('tr')).forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length < 8) return;
        const numText = cells[0]?.textContent.trim().replace('.', '');
        if (!/^\d+$/.test(numText)) return;

        // Extract player names from <a> tags within the cell
        const getPlayers = (cell) => Array.from(cell?.querySelectorAll('a') || []).map(a => a.textContent.trim()).filter(Boolean);
        const homePlayers = getPlayers(cells[1]);
        const awayPlayers = getPlayers(cells[3]);

        // Detect doubles: either side has more than one player, or cell[2] is '..'
        const isDoubles = homePlayers.length > 1 || awayPlayers.length > 1 || cells[2]?.textContent.trim() === '..';
        // Fallback: split textContent by known newlines
        const fallbackSplit = (cell) => {
          const t = cell?.textContent.trim() || '';
          return t ? [t] : [];
        };

        // Set values: cells[5..N-4], last 4 = sadyH, sadyA, bodyH, bodyA
        const scoreCells = Array.from(tr.querySelectorAll('td')).slice(5)
          .map(c => c.textContent.trim())
          .filter(v => v !== '');

        let sadyH = null, sadyA = null;
        const sets = [];

        if (scoreCells.length >= 4) {
          sadyH = parseInt(scoreCells[scoreCells.length - 4]);
          sadyA = parseInt(scoreCells[scoreCells.length - 3]);
          scoreCells.slice(0, scoreCells.length - 4).forEach(v => {
            const n = parseInt(v);
            if (!isNaN(n)) sets.push(n);
          });
        } else if (scoreCells.length >= 2) {
          sadyH = parseInt(scoreCells[scoreCells.length - 2]);
          sadyA = parseInt(scoreCells[scoreCells.length - 1]);
        }

        matchResults.push({
          num: parseInt(numText),
          isDoubles,
          homePlayers: homePlayers.length ? homePlayers : fallbackSplit(cells[1]),
          awayPlayers: awayPlayers.length ? awayPlayers : fallbackSplit(cells[3]),
          sets,           // positive = home won set (opponent's score), negative = home lost set (home's score)
          sadyH,
          sadyA,
          homeWon: (sadyH !== null && sadyA !== null && sadyH !== sadyA) ? sadyH > sadyA : null,
        });
      });
    }

    // ── Stats table ──
    const statTable = document.querySelector('table.zapis.statistika');
    const playerStats = {};  // name → {wins, losses}

    if (statTable) {
      Array.from(statTable.querySelectorAll('tr')).forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(c => c.textContent.trim());
        // [name, wins, losses, name2, wins2, losses2]
        const tryParse = (name, w, l) => {
          if (name && !isNaN(parseInt(w)) && !isNaN(parseInt(l))) {
            playerStats[name] = { wins: parseInt(w), losses: parseInt(l) };
          }
        };
        if (cells.length >= 3) tryParse(cells[0], cells[1], cells[2]);
        if (cells.length >= 6) tryParse(cells[3], cells[4], cells[5]);
      });
    }

    return { url, round, homeTeam, awayTeam, date, competition, scoreHome, scoreAway, matchResults, playerStats };
  }, { url, round });
}

// ── Parse los ─────────────────────────────────────────────
async function parseLos(page, soutezId, drustvoId) {
  await goto(page, `${BASE}/los-vse/svaz-${SVAZ}/rocnik-${ROCNIK}/soutez-${soutezId}/druzstvo-${drustvoId}`);

  return page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return { rows: [], links: [], future: [] };

    const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('td,th')).map(c => c.textContent.trim())
    ).filter(r => r.some(c => c));

    // Played matches (have utkani link)
    const links = Array.from(table.querySelectorAll('a[href*="utkani"]')).map(a => ({
      href: a.href,
      round: parseInt(a.closest('tr')?.querySelector('td')?.textContent.trim()) || 0
    }));

    // Future matches: rows that have a date but NO utkani link
    const playedRounds = new Set(links.map(l => l.round));
    const future = [];
    Array.from(table.querySelectorAll('tr')).forEach(tr => {
      const cells = Array.from(tr.querySelectorAll('td')).map(c => c.textContent.trim());
      if (cells.length < 4) return;
      const round = parseInt(cells[0]);
      if (!round || playedRounds.has(round)) return;
      // Has a date-like value and team names; optionally followed by time "18:00"
      const dateMatch = cells[1]?.match(/(\d{1,2}\.\d{2}\.\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
      if (!dateMatch) return;
      future.push({
        round,
        date: dateMatch[1],
        time: dateMatch[2] || '',
        home: cells[2] || '',
        away: cells[3] || '',
      });
    });

    return { rows, links, future };
  });
}

// ── Parse league table (from body text) ──────────────────
async function parseTabulka(page, soutezId) {
  await goto(page, `${BASE}/tabulka/svaz-${SVAZ}/rocnik-${ROCNIK}/soutez-${soutezId}`, 2000);
  await page.waitForFunction(
    () => document.body.innerText.includes('CELKOVĚ'),
    { timeout: 8000 }
  ).catch(() => {});

  // Extract real promotion/relegation counts from embedded JSON in page HTML.
  // The data is in a <head> <script> tag with backslash-escaped quotes: \"postup\":\"1\"
  const zones = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    // Match both "postup":"1" and \"postup\":\"1\" forms
    const m = html.match(/\\?"postup\\?"\s*:\s*\\?"(\d+)\\?"[^{}]*\\?"sestup\\?"\s*:\s*\\?"(\d+)/);
    if (m) return { promotionCount: parseInt(m[1]), relegationCount: parseInt(m[2]) };
    return { promotionCount: null, relegationCount: null };
  });

  const bodyText = await page.evaluate(() => document.body.innerText);

  // Find CELKOVĚ section
  const startIdx = bodyText.indexOf('CELKOVĚ');
  if (startIdx === -1) return [];

  const section = bodyText.substring(startIdx);
  const lines = section.split('\n').map(l => l.trim()).filter(Boolean);

  const SKIP = new Set(['CELKOVĚ','DOMÁCÍ','VENKOVNÍ','PU','V','R','P','K','Skóre','Body','Poslední utkání','HRÁLO SE','BUDE SE HRÁT','Předchozí','Další']);
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const l = lines[i];
    // Hard stop at match results section
    if (l === 'Utkání soutěže') break;
    if (SKIP.has(l) || l === '') { i++; continue; }

    if (/^\d+$/.test(l) && parseInt(l) >= 1 && parseInt(l) <= 20) {
      const pos  = parseInt(l);
      const team = lines[i+1] || '';
      const pu   = parseInt(lines[i+2]) || 0;
      const w    = parseInt(lines[i+3]) || 0;
      const d    = parseInt(lines[i+4]) || 0;
      const lv   = parseInt(lines[i+5]) || 0;
      const scoreStr = lines[i+7] || '0:0';
      const pts  = parseInt(lines[i+8]) || 0;
      const [sf, sa] = scoreStr.split(':').map(n => parseInt(n) || 0);

      // Validate: team name must look like a real club name (has letters, not a date/code)
      const looksLikeClub = team.length > 3 && /[a-záčďéěíňóřšůúýž]/i.test(team) && !/^\d/.test(team) && !team.includes('kolo') && !team.includes('BT ');
      if (looksLikeClub && !SKIP.has(team)) {
        result.push({ pos, team, z: pu, w, d, l: lv, sf, sa, pts, highlight: team.includes('Klánovice') });
        i += 9;
        while (i < lines.length && /^[VRP]$/.test(lines[i])) i++;
        continue;
      }
    }
    i++;
  }
  // Attach zone counts to the array as hidden properties
  if (zones.promotionCount !== null) result._promotionCount = zones.promotionCount;
  if (zones.relegationCount !== null) result._relegationCount = zones.relegationCount;
  return result;
}

// ── Parse player success table ────────────────────────────
async function parseUspesnost(page, soutezId) {
  await goto(page, `${BASE}/uspesnost-dvouhry/svaz-${SVAZ}/rocnik-${ROCNIK}/soutez-${soutezId}`, 800);

  return page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    return Array.from(table.querySelectorAll('tr')).map(tr => {
      const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.textContent.trim());
      return cells;
    }).filter(r => r.length >= 5);
  });
}

// ── Parse team roster page (/druzstvo-XXXXX) ──────────────
// Soupiska = základní sestava, ostatní = náhradníci z nižší soutěže
async function parseOddil(page, soutezId, drustvoId) {
  await goto(page, `${BASE}/druzstvo-${drustvoId}/svaz-${SVAZ}/rocnik-${ROCNIK}/soutez-${soutezId}`, 1500);
  await page.waitForFunction(
    () => document.querySelector('table.soupisky') !== null || document.body.innerText.includes('Soupiska'),
    { timeout: 10000 }
  ).catch(() => {});

  return page.evaluate(() => {
    const players = [];

    // Parse "Soupiska" text block to get regular squad names
    // Format: "Hráč Jméno (dvouhry, čtyřhry)\n..."
    // Ends at "Hráči, kteří již nejsou..."
    const bodyText = document.body.innerText;
    const soupStart = bodyText.indexOf('Soupiska(');
    const soupEnd   = bodyText.indexOf('Hráči, kteří', soupStart > -1 ? soupStart : 0);
    const regularNames = new Set();
    if (soupStart > -1) {
      const block = bodyText.substring(soupStart, soupEnd > -1 ? soupEnd : soupStart + 2000);
      block.split('\n').forEach(line => {
        // "Verner Pavel (41:21, 10:6)" → extract name before "("
        const m = line.match(/^([A-ZÁČĎÉĚÍŇÓŘŠŮÚÝŽ][a-záčďéěíňóřšůúýž]+ [A-ZÁČĎÉĚÍŇÓŘŠŮÚÝŽ][a-záčďéěíňóřšůúýž]+(?:\s+[a-z]+\.?)?)\s+\(/);
        if (m) regularNames.add(m[1].trim());
      });
    }

    // Parse table.soupisky for full player details
    // Cols: (empty), P.č., Hráč(link), Nar., Žebříček, STR, STRstab, STR+-, Bilance, Zápasy, Utkání
    const table = document.querySelector('table.soupisky');
    if (table) {
      Array.from(table.querySelectorAll('tbody tr')).forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(c => c.textContent.trim());
        if (cells.length < 5) return;
        const nameLink = tr.querySelector('td:nth-child(3) a[href*="hrac"]');
        const name = nameLink?.textContent.trim() || cells[2];
        if (!name || name.length < 3 || name === 'Hráč') return;
        const stisHref = nameLink?.getAttribute('href') || '';
        const stisId   = parseInt(stisHref.match(/hrac-(\d+)/)?.[1] || '0') || null;
        const soupiskaPos = parseInt(cells[1]) || 999;  // P.č. = pořadí na soupisce
        const str      = parseFloat((cells[5] || '0').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
        const strStab  = parseFloat((cells[6] || '0').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
        const strDelta = parseInt((cells[7] || '0').replace(/[^\d-]/g, '')) || 0;
        players.push({
          name, born: cells[3] || '', soupiskaPos, str, strStab, strDelta, stisId,
          isRegular: regularNames.size > 0 ? regularNames.has(name) : true,
        });
      });
    }

    return { players };
  });
}

// ── Helpers ───────────────────────────────────────────────
function isoDate(s) {
  if (!s) return '';
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return s;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

function parseUspesnostRow(row) {
  // Cols: rank, name, born, club, STR_stab, P.U.(team matches), wins, ":losses", "xx%"
  // wins/losses are INDIVIDUAL game wins/losses across all team matches
  if (row.length < 7) return null;
  const name = row[1];
  if (!name || name === 'Hráč' || name.length < 3) return null;
  const teamMatches = parseInt(row[5]) || 0;
  const wins   = parseInt(row[6]) || 0;
  const losses = parseInt((row[7] || '').replace(':', '')) || 0;
  const total  = wins + losses;
  if (total === 0) return null;
  const str = parseInt(row[4]) || 0;
  return {
    name,
    str,
    teamMatches,
    matches: total,   // individual games played
    wins,
    losses,
    sets: [0, 0],
    winPct: Math.round(wins / total * 100),
  };
}

function buildPlayerResults(matchData, weAreHome, uspMap) {
  return matchData.matchResults
    .filter(r => r.sadyH !== null && r.sadyA !== null && r.sadyH <= 4 && r.sadyA <= 4)
    .map(r => {
      const ourPlayers   = weAreHome ? r.homePlayers : r.awayPlayers;
      const theirPlayers = weAreHome ? r.awayPlayers : r.homePlayers;
      const ourSady  = weAreHome ? r.sadyH : r.sadyA;
      const theirSady = weAreHome ? r.sadyA : r.sadyH;
      const ourStr  = ourPlayers.length === 1  ? ((uspMap || {})[ourPlayers[0]]?.str  || 0) : 0;
      const oppStr  = theirPlayers.length === 1 ? ((uspMap || {})[theirPlayers[0]]?.str || 0) : 0;
      return {
        player:    ourPlayers.join(' / '),
        opponent:  theirPlayers.join(' / '),
        result:    `${ourSady}:${theirSady}`,
        won:       ourSady > theirSady,
        isDoubles: r.isDoubles || false,
        ourStr,
        oppStr,
      };
    });
}

function genKeyPoints(matchData, weAreHome, matchStats) {
  const ourScore   = weAreHome ? matchData.scoreHome : matchData.scoreAway;
  const theirScore = weAreHome ? matchData.scoreAway : matchData.scoreHome;
  const result     = ourScore > theirScore ? 'W' : ourScore < theirScore ? 'L' : 'D';
  const pts = [];

  // Best performer from stats table (already filtered to home/away side)
  // matchStats = the playerStats from the match record (includes both sides)
  // We need to figure out which players are ours
  const ourPlayerNames = new Set(
    matchData.matchResults
      .filter(r => !r.isDoubles)
      .flatMap(r => weAreHome ? r.homePlayers : r.awayPlayers)
  );

  const ourStats = Object.entries(matchStats)
    .filter(([name]) => ourPlayerNames.has(name))
    .sort((a, b) => (b[1].wins - b[1].losses) - (a[1].wins - a[1].losses));

  if (ourStats.length) {
    const [best, bs] = ourStats[0];
    const total = bs.wins + bs.losses;
    if (total >= 2) {
      const firstName = best.split(' ')[0];
      if (bs.wins >= total) pts.push(`${firstName} – perfektní výkon ${bs.wins}/${total}`);
      else if (bs.wins > bs.losses) pts.push(`${firstName} táhl tým – ${bs.wins}/${total} bodů`);
    }
    const [worst, ws] = ourStats[ourStats.length - 1];
    if (ourStats.length > 1 && ws.losses > ws.wins) {
      const total2 = ws.wins + ws.losses;
      if (total2 >= 2) pts.push(`${worst.split(' ')[0]} pod formou – ${ws.wins}/${total2}`);
    }
  }

  if (result === 'W') {
    if (ourScore >= 10 && theirScore <= 2) pts.push(`Drtivá výhra ${ourScore}:${theirScore}`);
    else if (!weAreHome)                   pts.push(`Výjezdní výhra ${ourScore}:${theirScore}`);
    else                                   pts.push(`Domácí výhra ${ourScore}:${theirScore}`);
  } else if (result === 'L') {
    if (!weAreHome) pts.push(`Prohra venku ${ourScore}:${theirScore}`);
    else            pts.push(`Domácí prohra ${ourScore}:${theirScore}`);
  } else {
    pts.push(`Remíza ${ourScore}:${theirScore}`);
  }

  // Doubles
  const dbl = matchData.matchResults?.find(r => r.isDoubles);
  if (dbl && dbl.homeWon !== null) {
    const dblWon  = weAreHome ? dbl.homeWon : !dbl.homeWon;
    const names   = (weAreHome ? dbl.homePlayers : dbl.awayPlayers).join(' / ');
    pts.push(`Čtyřhra ${names}: ${dblWon ? '✓ výhra' : '✗ prohra'}`);
  }

  return pts.slice(0, 3);
}

// ── Season label helper ───────────────────────────────────
function seasonLabel(rocnik) {
  // STIS rocnik = rok zahájení sezóny
  // rocnik-2025 → "2025/26", rocnik-2024 → "2024/25"
  const yr = parseInt(rocnik);
  return `${yr}/${String(yr + 1).slice(2)}`;
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log(`🏓 TTC Klánovice – STIS scraper v5 (ročník ${ROCNIK})\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await makePage(browser);

  // Auto-discover team soutezIds for this season
  const TEAMS_CONFIG = await discoverTeams(page, ROCNIK);
  if (!TEAMS_CONFIG.length) {
    console.error(`Nenalezeny žádné týmy pro ročník ${ROCNIK}. Zkontroluj připojení nebo číslo ročníku.`);
    await browser.close();
    process.exit(1);
  }
  console.log(`Nalezeno ${TEAMS_CONFIG.length} týmů: ${TEAMS_CONFIG.map(t => t.name).join(', ')}\n`);

  const clubData = {
    name: 'TTC Klánovice',
    shortName: 'Klánovice',
    city: 'Praha – Klánovice',
    stisUrl: `${BASE}/oddil-${ODDIL}/svaz-${SVAZ}/rocnik-${ROCNIK}`,
    rocnik: parseInt(ROCNIK),
    season: seasonLabel(ROCNIK),
    lastUpdate: new Date().toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }),
    teams: [],
    tables: {},
    players: [],
    matches: [],
  };

  for (const teamCfg of TEAMS_CONFIG) {
    console.log(`\n═══ ${teamCfg.name} ═══`);

    // 1. Los
    process.stdout.write('  Los... ');
    const los = await parseLos(page, teamCfg.soutezId, teamCfg.drustvoId);
    const matchLinks = los.links.filter(l => l.href.includes('utkani'));
    console.log(`${matchLinks.length} zápasů`);

    const scheduleMap = {};
    for (const row of los.rows) {
      if (/^\d+\./.test(row[0] || '')) {
        const rnd = parseInt(row[0]);
        const d = row[1]?.match(/(\d{1,2}\.\d{2}\.\d{4})/)?.[1] || '';
        scheduleMap[rnd] = { date: isoDate(d) };
      }
    }

    // Future matches
    for (const f of (los.future || [])) {
      const weAreHome = f.home.includes('Klánovice');
      const opponent  = weAreHome ? f.away : f.home;
      clubData.matches.push({
        id:       teamCfg.id * 1000 + f.round,  // synthetic id
        teamId:   teamCfg.id,
        home:     weAreHome,
        round:    f.round,
        date:     isoDate(f.date),
        time:     f.time || '',
        opponent,
        score:    null,
        result:   null,   // null = not played yet
        playerResults: [],
        keyPoints: [],
        future:   true,
      });
    }

    // 2. Match records
    console.log('  Match records:');
    const rawMatches = [];
    let competition = '';
    for (let i = 0; i < matchLinks.length; i++) {
      const { href, round } = matchLinks[i];
      const m = await parseMatch(page, href, round);
      if (i === 0 && m.competition) competition = m.competition;
      m._scheduleDate = scheduleMap[round]?.date || '';
      rawMatches.push(m);
      const we = m.homeTeam.includes('Klánovice') ? m.scoreHome : m.scoreAway;
      const they = m.homeTeam.includes('Klánovice') ? m.scoreAway : m.scoreHome;
      console.log(`    [${i+1}/${matchLinks.length}] R${round}: ${m.homeTeam} ${m.scoreHome}:${m.scoreAway} ${m.awayTeam}  (nás: ${we}:${they})`);
    }

    // 3. Tabulka
    process.stdout.write('  Tabulka... ');
    const tabulka = await parseTabulka(page, teamCfg.soutezId);
    console.log(`${tabulka.length} týmů`);

    // 4. Uspesnost
    process.stdout.write('  Uspesnost... ');
    const uspRaw = await parseUspesnost(page, teamCfg.soutezId);
    const uspMap = {};
    for (const row of uspRaw) {
      const parsed = parseUspesnostRow(row);
      if (parsed) uspMap[parsed.name] = parsed;
    }
    const leagueStrs = Object.values(uspMap).map(u => u.str).filter(s => s > 0);
    const leagueAvgStr = leagueStrs.length ? Math.round(leagueStrs.reduce((a,b)=>a+b,0)/leagueStrs.length) : 0;
    console.log(`${Object.keys(uspMap).length} hráčů, liga avg STR: ${leagueAvgStr}`);

    // 5. Oddil (roster stránka konkrétního týmu)
    process.stdout.write('  Roster... ');
    const oddil = await parseOddil(page, teamCfg.soutezId, teamCfg.drustvoId);
    console.log(`${oddil.players.length} hráčů (${oddil.players.filter(p=>p.isRegular).length} základní)`);

    // ── Aggregate player stats from match stats tables (OUR side only) ──
    const aggregated = {};
    for (const m of rawMatches) {
      const weAreHome = m.homeTeam.includes('Klánovice');
      const ourNames = new Set(
        (m.matchResults || []).flatMap(r => weAreHome ? (r.homePlayers || []) : (r.awayPlayers || []))
      );
      for (const [name, s] of Object.entries(m.playerStats || {})) {
        if (!name || name === 'čtyřhry') continue;
        if (!ourNames.has(name)) continue;  // skip opponent players
        if (!aggregated[name]) aggregated[name] = { wins: 0, losses: 0, matchCount: 0 };
        aggregated[name].wins      += s.wins  || 0;
        aggregated[name].losses    += s.losses || 0;
        aggregated[name].matchCount += 1;   // team matches (utkání) this player appeared in
      }
    }

    // ── Process matches ──────────────────────────────────
    const teamMatches = [];
    for (const m of rawMatches) {
      const weAreHome = m.homeTeam.includes('Klánovice');
      const opponent  = weAreHome ? m.awayTeam : m.homeTeam;
      const ourScore  = weAreHome ? m.scoreHome : m.scoreAway;
      const theirScore = weAreHome ? m.scoreAway : m.scoreHome;
      const result    = ourScore > theirScore ? 'W' : ourScore < theirScore ? 'L' : 'D';
      const date      = isoDate(m.date) || m._scheduleDate || '';

      const playerResults = buildPlayerResults(m, weAreHome, uspMap);
      const keyPoints     = genKeyPoints(m, weAreHome, m.playerStats || {});

      const matchObj = {
        id: parseInt(m.url.match(/utkani-(\d+)/)?.[1] || '0'),
        teamId: teamCfg.id,
        home: weAreHome,
        round: m.round,
        date,
        opponent,
        score: { home: ourScore, away: theirScore },
        result,
        playerResults,
        keyPoints,
        _playerStats: m.playerStats,
      };
      teamMatches.push(matchObj);
      clubData.matches.push(matchObj);
    }

    // ── Team standing ────────────────────────────────────
    const ourRow = tabulka.find(r => r.highlight);
    const wins   = teamMatches.filter(m => m.result === 'W').length;
    const losses = teamMatches.filter(m => m.result === 'L').length;
    const draws  = teamMatches.filter(m => m.result === 'D').length;
    const setsFor     = teamMatches.reduce((s,m) => s + m.score.home, 0);
    const setsAgainst = teamMatches.reduce((s,m) => s + m.score.away, 0);

    clubData.teams.push({
      id: teamCfg.id,
      name: teamCfg.name,
      competition,
      division: competition,
      leagueAvgStr,
      standing: {
        pos: ourRow?.pos || '?',
        wins: ourRow?.w ?? wins,
        losses: ourRow?.l ?? losses,
        draws: ourRow?.d ?? draws,
        points: ourRow?.pts ?? (wins*2 + draws),
        setsFor: ourRow?.sf ?? setsFor,
        setsAgainst: ourRow?.sa ?? setsAgainst,
      },
    });

    // Promotion/relegation zones — real values from STIS page JSON
    const total = tabulka.length;
    const pCount = tabulka._promotionCount ?? (total >= 10 ? 2 : 1);
    const rCount = tabulka._relegationCount ?? (total >= 12 ? 3 : 2);
    tabulka.forEach(r => {
      r.zone = r.pos <= pCount ? 'promotion'
             : r.pos > total - rCount ? 'relegation'
             : 'neutral';
    });
    clubData.tables[teamCfg.id] = tabulka;

    // ── Players ──────────────────────────────────────────
    // Primary source: players seen on OUR side in match records (guaranteed to be our players).
    // uspMap contains ALL clubs in the league — use it only for stats lookup, not for discovery.
    // oddil (druzstvo page) gives the full approved roster with STR, used for enrichment.
    const teamPlayerNames = new Set();

    // From match records — only our side
    for (const m of rawMatches) {
      const weAreHome = m.homeTeam.includes('Klánovice');
      for (const r of m.matchResults || []) {
        const ourPlayers = weAreHome ? (r.homePlayers || []) : (r.awayPlayers || []);
        ourPlayers.forEach(n => { if (n) teamPlayerNames.add(n); });
      }
    }

    // Also add players from the approved roster (they may have 0 games but still part of team)
    for (const p of oddil.players) {
      if (p.name) teamPlayerNames.add(p.name);
    }

    for (const playerName of teamPlayerNames) {
      // No duplicates per team
      if (clubData.players.find(x => x.name === playerName && x.teamId === teamCfg.id)) continue;
      const oddilPlayer = oddil.players.find(p => p.name === playerName);
      const usp = uspMap[playerName] || null;
      const agg = aggregated[playerName] || { wins: 0, losses: 0, matchCount: 0 };
      // Use aggregated (from actual match records = current season only) as primary source.
      // Fall back to uspMap only when aggregated has nothing (player in roster but no matches scraped yet).
      const w   = (agg.wins  > 0 || agg.losses > 0) ? agg.wins   : (usp?.wins   ?? 0);
      const l   = (agg.wins  > 0 || agg.losses > 0) ? agg.losses : (usp?.losses ?? 0);
      const m   = w + l;  // individual singles games (dvouhry) played this season
      if (m === 0 && !oddilPlayer) continue;  // skip ghost names
      clubData.players.push({
        id:        clubData.players.length + 1,
        name:      playerName,
        team:      teamCfg.name.replace('TTC Klánovice ', ''),
        teamId:    teamCfg.id,
        isRegular: oddilPlayer?.isRegular ?? true,
        stisId:    oddilPlayer?.stisId   || null,
        soutezId:  teamCfg.soutezId,
        born:         oddilPlayer?.born         || '',
        soupiskaPos:  oddilPlayer?.soupiskaPos  || 999,
        str:       oddilPlayer?.str     || 0,
        strStab:   oddilPlayer?.strStab  || 0,
        strDelta:  oddilPlayer?.strDelta ?? 0,
        stats: {
          matches: m,
          wins: w,
          losses: l,
          sets: usp?.sets || [0, 0],
          winPct: (w + l) > 0 ? Math.round(w / (w + l) * 100) : 0,
        },
      });
    }

    const s = clubData.teams[clubData.teams.length - 1].standing;
    console.log(`  ✓ Tým ${teamCfg.name}: pos=${s.pos} | ${s.wins}V ${s.losses}P ${s.draws}R = ${s.points}b`);
  }

  await browser.close();

  // Clean up internal fields
  clubData.matches.forEach(m => { delete m._playerStats; delete m._scheduleDate; });

  fs.writeFileSync('scraped_full.json', JSON.stringify(clubData, null, 2));
  console.log('\n✅ scraped_full.json');

  const dataJs = `// TTC Klánovice – ${OUT_FILE} (${new Date().toLocaleDateString('cs-CZ')})\n// Zdroj: ${clubData.stisUrl}\n\nconst ${VAR_NAME} = ${JSON.stringify(clubData, null, 2)};\n`;
  fs.writeFileSync(OUT_FILE, dataJs);
  console.log(`✅ ${OUT_FILE}\n`);

  console.log('─── SUMMARY ───');
  clubData.teams.forEach(t => {
    const s = t.standing;
    console.log(`${t.name}: ${s.pos}. místo | ${s.wins}V ${s.losses}P ${s.draws}R = ${s.points}b | sety ${s.setsFor}:${s.setsAgainst}`);
  });
  console.log(`Zápasy: ${clubData.matches.length} | Hráči: ${clubData.players.length}`);
  console.log('\nTop hráči (dle agregovaných statistik):');
  clubData.players
    .filter(p => p.stats.matches >= 5)
    .sort((a, b) => b.stats.winPct - a.stats.winPct)
    .slice(0, 8)
    .forEach(p => console.log(`  ${p.name} (${p.team}): ${p.stats.wins}V/${p.stats.losses}P = ${p.stats.winPct}% | STR ${p.str}`));
}

main().catch(e => { console.error(e); process.exit(1); });
