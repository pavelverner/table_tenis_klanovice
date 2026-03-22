/* ============================================================
   TTC Klánovice – app.js
   ============================================================ */

// ── State ──────────────────────────────────────────────────
let activeSection  = 'prehled';
let activeMatchTeam = 'all';
let activeStatsTeam = 'all';
let activeTableTeam = 0;
let activeSeason   = null;   // STIS rocnik number (e.g. 2025)

// ── Available seasons ──────────────────────────────────────
// STIS rocnik = rok zahájení sezóny: rocnik-2025 = sezóna 2025/26
const SEASONS = [
  { rocnik: 2025, label: '2025 / 26' },
  { rocnik: 2024, label: '2024 / 25' },
  { rocnik: 2023, label: '2023 / 24' },
  { rocnik: 2022, label: '2022 / 23' },
  { rocnik: 2021, label: '2021 / 22' },
];

// ── Navigation ─────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchSection(link.dataset.section);
      document.getElementById('nav').classList.remove('open');
    });
  });
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('nav').classList.toggle('open');
  });
}

function switchSection(sec) {
  activeSection = sec;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(sec).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l =>
    l.classList.toggle('active', l.dataset.section === sec)
  );
  renderSection(sec);
}

// ── Season selector ────────────────────────────────────────
function initSeasonSelect() {
  const sel = document.getElementById('seasonSelect');
  // Determine current season from data (prefer explicit rocnik field, fallback to URL)
  const currentRocnik = CLUB_DATA.rocnik
    || parseInt(CLUB_DATA.stisUrl?.match(/rocnik-(\d+)/)?.[1] || '2025');
  activeSeason = currentRocnik;

  sel.innerHTML = SEASONS.map(s =>
    `<option value="${s.rocnik}" ${s.rocnik === currentRocnik ? 'selected' : ''}>${s.label}</option>`
  ).join('');

  sel.addEventListener('change', () => {
    const chosen = parseInt(sel.value);
    if (chosen === currentRocnik) {
      renderPrehled();
      return;
    }
    // For other seasons: open STIS in new tab and show toast
    const stisUrl = `https://stis.ping-pong.cz/oddil-420109007/svaz-420101/rocnik-${chosen}`;
    showToast(`Sezóna ${SEASONS.find(s=>s.rocnik===chosen)?.label} není načtena. Otevírám STIS…`, 4000);
    setTimeout(() => window.open(stisUrl, '_blank'), 1200);
    // Reset selector back to current
    setTimeout(() => { sel.value = currentRocnik; }, 100);
  });
}

function showToast(msg, duration = 3000) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Helpers ────────────────────────────────────────────────
function fmt(n) { return n > 0 ? `+${n}` : String(n); }

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${parseInt(day)}. ${parseInt(m)}. ${y}`;
}

function resultClass(r) {
  return r === 'W' ? 'badge-W' : r === 'L' ? 'badge-L' : 'badge-D';
}
function resultLabel(r) {
  return r === 'W' ? 'V' : r === 'L' ? 'P' : 'R';
}

function getTeamById(id) {
  return CLUB_DATA.teams.find(t => t.id === id);
}

// ── Live match detection ───────────────────────────────────
function getTodayMatches() {
  const now   = new Date();
  const today = now.toISOString().split('T')[0]; // "2026-03-22"

  return CLUB_DATA.matches.filter(m => {
    if (!m.date) return false;
    const mDate = m.date.includes('.') ? parseStisDate(m.date) : m.date;
    return mDate === today;
  });
}

function parseStisDate(s) {
  // "22.09.2025" → "2025-09-22"
  const m = s.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
  if (!m) return s;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

function isMatchLive(m) {
  const now  = new Date();
  const mDate = m.date.includes('.') ? parseStisDate(m.date) : m.date;
  const today = now.toISOString().split('T')[0];
  if (mDate !== today) return false;
  // Consider live if current time is within 4 hours of midnight (rough heuristic for evening matches)
  const hour = now.getHours();
  return hour >= 17 && hour <= 23;
}

// ── 1. PŘEHLED ─────────────────────────────────────────────
function renderPrehled() {
  // Season title
  const seasonLabel = SEASONS.find(s => s.rocnik === activeSeason)?.label || CLUB_DATA.season || '';
  document.getElementById('prehledTitle').innerHTML =
    `Přehled sezóny <span class="season-badge">${seasonLabel}</span>`;

  // Last update footer
  const lu = document.getElementById('lastUpdate');
  if (lu) lu.textContent = CLUB_DATA.lastUpdate || '–';

  renderLiveBlock();
  renderTeamCards();
  renderLatestMatches();
  renderTopPlayers();
}

function renderLiveBlock() {
  const todayMatches = getTodayMatches();
  const liveBlock = document.getElementById('liveBlock');
  const liveContainer = document.getElementById('liveMatches');

  if (!todayMatches.length) {
    liveBlock.style.display = 'none';
    return;
  }

  liveBlock.style.display = 'block';

  liveContainer.innerHTML = todayMatches.map(m => {
    const team    = getTeamById(m.teamId);
    const isLive  = isMatchLive(m);
    const played  = m.result !== undefined && m.score.home + m.score.away > 0;
    const homeTeamName = m.home ? team.name : m.opponent;
    const awayTeamName = m.home ? m.opponent : team.name;
    const homeScore = m.home ? m.score.home : m.score.away;
    const awayScore = m.home ? m.score.away : m.score.home;

    return `
    <div class="live-match-card ${isLive && !played ? 'live-pulsing' : ''}">
      <div class="live-match-meta">
        <span class="live-tag ${isLive && !played ? 'live-active' : 'live-today'}">
          ${isLive && !played ? '● LIVE' : 'DNES'}
        </span>
        <span class="live-competition">${team.competition}</span>
        <span class="live-venue">${m.home ? '🏠 doma' : '✈️ venku'}</span>
      </div>
      <div class="live-match-teams">
        <span class="live-team ${m.home ? 'our-side' : ''}">${homeTeamName}</span>
        <span class="live-score-box">
          ${played
            ? `<span class="live-score-val">${homeScore}<span class="live-colon">:</span>${awayScore}</span>
               <span class="match-badge ${resultClass(m.result)}">${resultLabel(m.result)}</span>`
            : `<span class="live-time">${fmtDate(m.date.includes('.') ? parseStisDate(m.date).split('T')[0] : m.date)}</span>`
          }
        </span>
        <span class="live-team ${!m.home ? 'our-side' : ''}">${awayTeamName}</span>
      </div>
      ${played && m.keyPoints?.length ? `
      <div class="live-keypoints">
        ${m.keyPoints.map(k => `<span class="live-kp">▶ ${k}</span>`).join('')}
      </div>` : ''}
    </div>`;
  }).join('');
}

function renderTeamCards() {
  const grid = document.getElementById('teamsGrid');
  grid.innerHTML = CLUB_DATA.teams.map(team => {
    const s    = team.standing;
    const diff = s.setsFor - s.setsAgainst;
    const played = s.wins + s.losses + s.draws;
    const pct  = played > 0 ? Math.round(s.wins / played * 100) : 0;
    return `
    <div class="team-card" onclick="goToMatchesForTeam(${team.id})">
      <div class="team-card-header">
        <div>
          <div class="team-name">${team.name}</div>
          <div class="team-division">${team.competition}</div>
        </div>
        <div>
          <div class="team-pos">${s.pos}.</div>
          <div class="team-pos-label">místo</div>
        </div>
      </div>
      <div class="team-stats">
        <div class="team-stat">
          <span class="team-stat-val stat-w">${s.wins}</span>
          <span class="team-stat-lbl">Výhry</span>
        </div>
        <div class="team-stat">
          <span class="team-stat-val stat-l">${s.losses}</span>
          <span class="team-stat-lbl">Prohry</span>
        </div>
        <div class="team-stat">
          <span class="team-stat-val stat-d">${s.draws}</span>
          <span class="team-stat-lbl">Remízy</span>
        </div>
        <div class="team-stat">
          <span class="team-stat-val stat-pts">${s.points}</span>
          <span class="team-stat-lbl">Body</span>
        </div>
        <div class="team-stat">
          <span class="team-stat-val" style="color:${diff>=0?'var(--c-green)':'var(--c-red)'}">${fmt(diff)}</span>
          <span class="team-stat-lbl">Sety ±</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function goToMatchesForTeam(teamId) {
  activeMatchTeam = String(teamId);
  switchSection('vysledky');
}

function renderLatestMatches() {
  const sorted = [...CLUB_DATA.matches]
    .sort((a,b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 6);

  document.getElementById('latestMatches').innerHTML = sorted.map(m => {
    const team      = getTeamById(m.teamId);
    const homeTeam  = m.home ? team.name : m.opponent;
    const awayTeam  = m.home ? m.opponent : team.name;
    const scoreHome = m.home ? m.score.home : m.score.away;
    const scoreAway = m.home ? m.score.away : m.score.home;
    return `
    <div class="match-row" onclick="goToMatch(${m.id})" style="cursor:pointer">
      <div class="match-date">${fmtDate(m.date)}</div>
      <div class="match-teams">
        <strong>${homeTeam}</strong> vs ${awayTeam}
        <div style="font-size:11px;color:var(--c-muted);margin-top:1px">${team.competition}</div>
      </div>
      <div class="match-score">${scoreHome}<span style="color:var(--c-muted);font-weight:400">:</span>${scoreAway}</div>
      <div class="match-badge ${resultClass(m.result)}">${resultLabel(m.result)}</div>
    </div>`;
  }).join('');
}

function renderTopPlayers() {
  const sorted = [...CLUB_DATA.players]
    .filter(p => p.stats.matches >= 8)
    .sort((a,b) => b.stats.winPct - a.stats.winPct)
    .slice(0, 6);

  document.getElementById('topPlayers').innerHTML = sorted.map(p => `
    <div class="player-mini">
      <div class="player-mini-name">${p.name}</div>
      <div class="player-mini-team">Tým ${p.team} · ${p.stats.matches} her</div>
      <div class="player-mini-bar-wrap">
        <div class="player-mini-bar-bg">
          <div class="player-mini-bar" style="width:${p.stats.winPct}%"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="player-mini-pct">${p.stats.winPct}%</span>
        <span class="player-mini-record">${p.stats.wins}V / ${p.stats.losses}P</span>
      </div>
    </div>
  `).join('');
}

// ── 2. VÝSLEDKY ────────────────────────────────────────────
function renderVysledky() {
  const tabs = document.getElementById('matchFilterTabs');
  tabs.innerHTML = filterTabsHTML('match');

  const matches = activeMatchTeam === 'all'
    ? CLUB_DATA.matches
    : CLUB_DATA.matches.filter(m => m.teamId === parseInt(activeMatchTeam));

  const sorted = [...matches].sort((a,b) => (b.date||'').localeCompare(a.date||''));

  document.getElementById('matchesDetail').innerHTML =
    sorted.map(m => renderMatchCard(m)).join('');

  document.querySelectorAll('.match-card-header').forEach(h => {
    h.addEventListener('click', () => h.closest('.match-card').classList.toggle('open'));
  });

  activateFilterTabs('match', tabs);
}

function renderMatchCard(m) {
  const team      = getTeamById(m.teamId);
  const homeTeam  = m.home ? team.name : m.opponent;
  const awayTeam  = m.home ? m.opponent : team.name;
  const scoreHome = m.home ? m.score.home : m.score.away;
  const scoreAway = m.home ? m.score.away : m.score.home;

  const playerRows = (m.playerResults || []).map(pr => {
    const [a, b] = pr.result.split(':').map(Number);
    const weWin = a > b;
    return `
    <div class="match-player-row">
      <div class="player-name-left">${pr.player}</div>
      <div class="match-player-score ${weWin ? 'score-w' : 'score-l'}">${pr.result}</div>
      <div class="player-name-right">${pr.opponent}</div>
    </div>`;
  }).join('');

  const keyPts = (m.keyPoints || []).map(k => `<li>${k}</li>`).join('');

  return `
  <div class="match-card" id="match-${m.id}">
    <div class="match-card-header">
      <div class="match-card-left">
        <div class="match-round">Kolo ${m.round} · ${fmtDate(m.date)}</div>
        <div class="match-card-title">${homeTeam} vs ${awayTeam}</div>
        <div class="match-card-comp">${team.competition}
          <span class="match-venue ${m.home ? 'venue-home' : 'venue-away'}">
            · ${m.home ? '🏠 doma' : '✈️ venku'}
          </span>
        </div>
      </div>
      <div class="match-card-right">
        <div class="match-score-big">
          ${scoreHome}<span class="score-separator">:</span>${scoreAway}
        </div>
        <div class="match-badge ${resultClass(m.result)}">${resultLabel(m.result)}</div>
        <div class="expand-icon">▾</div>
      </div>
    </div>
    <div class="match-card-body">
      ${keyPts ? `
      <div class="keypoints">
        <div class="keypoints-title">Klíčové momenty</div>
        <ul class="keypoints-list">${keyPts}</ul>
      </div>` : ''}
      <div>
        <div class="keypoints-title" style="margin-bottom:8px">Výsledky hráčů</div>
        <div class="match-players">${playerRows}</div>
      </div>
    </div>
  </div>`;
}

function goToMatch(id) {
  activeMatchTeam = 'all';
  switchSection('vysledky');
  setTimeout(() => {
    const el = document.getElementById(`match-${id}`);
    if (el) {
      el.classList.add('open');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 50);
}

// ── 3. STATISTIKY ──────────────────────────────────────────
function renderStatistiky() {
  const tabs = document.getElementById('statsFilterTabs');
  tabs.innerHTML = filterTabsHTML('stats');
  activateFilterTabs('stats', tabs);
  renderStatsTable();
}

function renderStatsTable() {
  const players = activeStatsTeam === 'all'
    ? CLUB_DATA.players
    : CLUB_DATA.players.filter(p => p.team === activeStatsTeam);

  const sorted = [...players].sort((a,b) => b.stats.winPct - a.stats.winPct);

  const rows = sorted.map((p, i) => `
    <tr>
      <td class="player-rank">${i+1}</td>
      <td class="player-name-cell">
        ${p.name}${p.isRegular === false ? ' <span class="sub-badge">náhr.</span>' : ''}
      </td>
      <td><span class="player-team-pill">Tým ${p.team}</span></td>
      <td class="rating-val">${p.str || '–'}</td>
      <td>${p.stats.matches}</td>
      <td style="color:var(--c-green);font-weight:600">${p.stats.wins}</td>
      <td style="color:var(--c-red);font-weight:600">${p.stats.losses}</td>
      <td>
        <div class="win-pct-bar-wrap">
          <div class="win-pct-bar-bg">
            <div class="win-pct-bar-fill" style="width:${p.stats.winPct}%"></div>
          </div>
          <span class="win-pct-cell">${p.stats.winPct}%</span>
        </div>
      </td>
    </tr>
  `).join('');

  document.getElementById('statsTable').innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Hráč</th>
          <th>Tým</th>
          <th>STR</th>
          <th>Zápasy</th>
          <th>Výhry</th>
          <th>Prohry</th>
          <th>Úspěšnost</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── 4. TABULKY ─────────────────────────────────────────────
function renderTabulky() {
  const teamsWithTables = CLUB_DATA.teams.filter(t => CLUB_DATA.tables[t.id]?.length);
  const tabs = document.getElementById('tableFilterTabs');

  tabs.innerHTML = teamsWithTables.map(t => `
    <div class="filter-tab ${activeTableTeam === t.id ? 'active' : ''}"
         data-tableteam="${t.id}">${t.name.replace('TTC Klánovice ', '')}</div>
  `).join('');

  tabs.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTableTeam = parseInt(tab.dataset.tableteam);
      renderTabulky();
    });
  });

  if (!activeTableTeam && teamsWithTables.length) {
    activeTableTeam = teamsWithTables[0].id;
    renderTabulky();
    return;
  }

  const container = document.getElementById('leagueTables');
  container.innerHTML = '';

  teamsWithTables
    .filter(t => t.id === activeTableTeam)
    .forEach(team => {
      const rows = CLUB_DATA.tables[team.id];
      if (!rows?.length) return;

      const total = rows.length;
      const tableRows = rows.map(r => {
        const zone      = r.zone || 'neutral';
        const posClass  = r.pos === 1 ? 'pos-1' : r.pos === 2 ? 'pos-2' : r.pos === 3 ? 'pos-3' : '';
        const zoneClass = zone === 'promotion' ? 'zone-promotion'
                        : zone === 'relegation' ? 'zone-relegation' : '';
        const zoneIndicator = zone === 'promotion'
          ? '<span class="zone-arrow up" title="Postup">↑</span>'
          : zone === 'relegation'
          ? '<span class="zone-arrow down" title="Sestup">↓</span>'
          : '';
        return `
        <tr class="${r.highlight ? 'our-team' : ''} ${zoneClass}">
          <td class="pos-cell ${posClass}">${r.pos}</td>
          <td class="team-name-cell">
            ${r.team}${r.highlight ? ' <span class="us-badge">MY</span>' : ''}
            ${zoneIndicator}
          </td>
          <td>${r.z}</td>
          <td class="w-cell">${r.w}</td>
          <td class="l-cell">${r.l}</td>
          <td style="color:var(--c-orange)">${r.d}</td>
          <td>${r.sf}</td>
          <td>${r.sa}</td>
          <td style="color:${r.sf-r.sa>=0?'var(--c-green)':'var(--c-red)'}">${fmt(r.sf-r.sa)}</td>
          <td class="pts-cell">${r.pts}</td>
        </tr>`;
      }).join('');

      // Zone separator lines annotation
      const promotionCount  = rows.filter(r => r.zone === 'promotion').length;
      const relegationStart = total - rows.filter(r => r.zone === 'relegation').length + 1;

      container.innerHTML += `
      <div class="league-table-wrap">
        <div class="league-table-title">
          ${team.name}
          <span class="league-table-subtitle">${team.competition}</span>
        </div>
        <table class="league-table">
          <thead>
            <tr>
              <th>#</th><th>Tým</th><th>Z</th>
              <th>V</th><th>P</th><th>R</th>
              <th>SF</th><th>SA</th><th>S±</th><th>Body</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="table-zone-note">
          <span class="znote promotion">↑ Top ${promotionCount} – postup</span>
          <span class="znote relegation">↓ Od ${relegationStart}. místa – sestup</span>
        </div>
      </div>`;
    });
}

// ── Filter tabs ─────────────────────────────────────────────
function filterTabsHTML(type) {
  const activeVal = type === 'match' ? activeMatchTeam : activeStatsTeam;
  let html = `<div class="filter-tab ${activeVal === 'all' ? 'active' : ''}" data-${type}team="all">Všechny týmy</div>`;
  html += CLUB_DATA.teams.map(t => {
    const val = type === 'match' ? String(t.id) : t.name.replace('TTC Klánovice ', '');
    return `<div class="filter-tab ${activeVal === val ? 'active' : ''}" data-${type}team="${val}">${t.name.replace('TTC Klánovice ', '')}</div>`;
  }).join('');
  return html;
}

function activateFilterTabs(type, container) {
  container.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (type === 'match') {
        activeMatchTeam = tab.dataset.matchteam;
        renderVysledky();
      } else {
        activeStatsTeam = tab.dataset.statsteam;
        renderStatistiky();
      }
    });
  });
}

// ── Section dispatcher ──────────────────────────────────────
function renderSection(sec) {
  if (sec === 'prehled')    renderPrehled();
  if (sec === 'vysledky')   renderVysledky();
  if (sec === 'statistiky') renderStatistiky();
  if (sec === 'tabulky')    renderTabulky();
}

// ── Live refresh (checks for today's matches every 5 min) ──
function startLiveRefresh() {
  const todayMatches = getTodayMatches();
  if (!todayMatches.length) return;

  const now = new Date();
  const hour = now.getHours();
  if (hour < 16 || hour > 24) return;  // only refresh during likely match hours

  console.log('Live refresh started – match today detected');
  setInterval(() => {
    if (activeSection === 'prehled') renderLiveBlock();
  }, 5 * 60 * 1000);  // every 5 minutes
}

// ── Server polling (fetches fresh data from /api/data) ─────
let _pollInterval = null;

async function fetchFreshData() {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    if (!json.data) return;

    // Update global CLUB_DATA in-place so all renderers see new data
    Object.assign(CLUB_DATA, json.data);

    // Update footer timestamp
    const lu = document.getElementById('lastUpdate');
    if (lu && json.lastScraped) {
      const d = new Date(json.lastScraped);
      lu.textContent = d.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
        + (json.scrapeRunning ? ' ↻' : '');
    }

    // Re-render active section with fresh data
    renderSection(activeSection);

    console.log('[poll] Data updated –', CLUB_DATA.matches?.length, 'zápasů');
  } catch (e) {
    // Running as plain file:// or server down — silently skip
  }
}

function startPolling() {
  // Only poll when served from our Node server (not file://)
  if (!window.location.protocol.startsWith('http')) return;

  const POLL_MS = 60 * 1000;  // every 60 s normally
  const todayMatch = getTodayMatches().length > 0;
  const hour = new Date().getHours();
  const fastPoll = todayMatch && hour >= 16 && hour <= 23;

  const interval = fastPoll ? 15 * 1000 : POLL_MS;  // 15 s on match day evening

  console.log(`[poll] Starting – interval ${interval / 1000}s${fastPoll ? ' (zápas dnes!)' : ''}`);
  _pollInterval = setInterval(fetchFreshData, interval);
}

// ── Init ───────────────────────────────────────────────────
function init() {
  initNav();
  initSeasonSelect();
  renderPrehled();
  renderVysledky();
  renderStatistiky();
  renderTabulky();
  startLiveRefresh();
  startPolling();

  // Show only prehled initially
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('prehled').classList.add('active');
}

document.addEventListener('DOMContentLoaded', init);
