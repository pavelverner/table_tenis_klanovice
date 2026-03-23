/* ============================================================
   TTC Klánovice – db.js
   Supabase data layer – read-only, public anon key
   ============================================================ */

const DB_URL = 'https://iyfciumheechxkfrsrii.supabase.co/rest/v1';
const DB_KEY = 'sb_publishable_0-k20pPJn9MXu2kD_OD95g__ZGVF1mp';

async function dbFetch(path) {
  const r = await fetch(`${DB_URL}/${path}`, {
    headers: {
      'apikey': DB_KEY,
      'Authorization': `Bearer ${DB_KEY}`,
      'Accept': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`DB ${r.status}: ${path}`);
  return r.json();
}

// ── Games ────────────────────────────────────────────────────
// Individual rubbers for one match, ordered by rubber_num
function dbGetGames(matchId) {
  return dbFetch(`games?match_id=eq.${matchId}&order=rubber_num.asc`);
}

// All games played by a player (our_player field), optionally filtered by season
function dbGetPlayerGames(playerName, rocnik = null) {
  const enc  = encodeURIComponent(playerName);
  const rFilter = rocnik ? `&matches.rocnik=eq.${rocnik}` : '';
  return dbFetch(
    `games?our_player=eq.${enc}` +
    `&select=*,matches(id,date,opponent,home,result,score_home,score_away,team_id,rocnik)` +
    `&order=rubber_num.asc` +
    rFilter
  );
}

// ── Players ──────────────────────────────────────────────────
// STR snapshots across seasons for one player
function dbGetPlayerStrHistory(playerName) {
  const enc = encodeURIComponent(playerName);
  return dbFetch(
    `player_seasons?select=rocnik,str,str_stab,str_delta,soupiska_pos,team_id,scraped_at` +
    `&players.name=eq.${enc}` +
    `&select=*,players!inner(name)` +
    `&order=rocnik.asc,scraped_at.asc`
  );
}

// ── Helpers ──────────────────────────────────────────────────
// Render set scores for one rubber as compact pills
// setScores = [[home, away], ...]  (home perspective)
function renderSetScores(setScores, weAreHome) {
  if (!setScores || !setScores.length) return '';
  return setScores.map(([h, a]) => {
    const ourScore  = weAreHome ? h : a;
    const oppScore  = weAreHome ? a : h;
    const weWon     = ourScore > oppScore;
    return `<span class="set-pill ${weWon ? 'set-w' : 'set-l'}">${ourScore}:${oppScore}</span>`;
  }).join('');
}

// Load and inject set scores into an already-rendered match card
const _gamesCache = {};

async function loadMatchSetScores(matchId, weAreHome) {
  const container = document.getElementById(`set-scores-${matchId}`);
  if (!container || container.dataset.loaded) return;
  container.dataset.loaded = '1';
  container.innerHTML = '<span class="set-scores-loading">načítám…</span>';

  try {
    const games = _gamesCache[matchId] || await dbGetGames(matchId);
    _gamesCache[matchId] = games;

    if (!games.length) { container.innerHTML = ''; return; }

    const rows = games.map(g => {
      const sets = renderSetScores(g.set_scores, weAreHome);
      const resultClass = g.won ? 'score-w' : g.won === false ? 'score-l' : '';
      const doublesLabel = g.is_doubles ? '<span class="set-doubles-badge">4H</span>' : '';
      return `
        <div class="set-scores-row">
          <span class="set-scores-num">${g.rubber_num}.</span>
          <span class="set-scores-player">${g.our_player}${doublesLabel}</span>
          <span class="set-scores-result ${resultClass}">${g.sets_won}:${g.sets_lost}</span>
          <span class="set-scores-sets">${sets}</span>
          <span class="set-scores-opp">${g.opp_player}</span>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="set-scores-title">Set scores</div>
      <div class="set-scores-list">${rows}</div>`;
  } catch (e) {
    container.innerHTML = '<span class="set-scores-loading" style="color:var(--c-red)">chyba načítání</span>';
    console.error('loadMatchSetScores', e);
  }
}
