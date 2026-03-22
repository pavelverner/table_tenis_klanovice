/* ============================================================
   TTC Klánovice – app.js
   ============================================================ */

// ── State ──────────────────────────────────────────────────
let activeSection  = 'prehled';
let activeMatchTeam = 'all';
let activeStatsTeam = 'all';
let activeTableTeam = 0;
let activeSeason   = null;   // STIS rocnik number (e.g. 2025)
let statsSortCol   = 'str';
let statsSortDir   = 'desc';

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
    });
  });
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchSection(item.dataset.section);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
  document.querySelectorAll('.bottom-nav-item').forEach(item =>
    item.classList.toggle('active', item.dataset.section === sec)
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
  renderUpcoming();
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

    // Zone from league table
    const ourRow = CLUB_DATA.tables[team.id]?.find(r => r.highlight);
    const zone   = ourRow?.zone || 'neutral';
    const zoneClass = zone === 'promotion' ? 'card-promotion'
                    : zone === 'relegation' ? 'card-relegation' : '';
    const zoneBadge = zone === 'promotion'
      ? `<span class="card-zone-badge badge-promo">↑ Postup</span>`
      : zone === 'relegation'
      ? `<span class="card-zone-badge badge-relg">↓ Sestup</span>`
      : '';

    // Last 5 match result dots
    const lastFive = CLUB_DATA.matches
      .filter(m => m.teamId === team.id && m.result)
      .sort((a,b) => (b.date||'').localeCompare(a.date||''))
      .slice(0, 5)
      .reverse();
    const dots = lastFive.map(m =>
      `<span class="result-dot dot-${m.result}" title="${m.result==='W'?'Výhra':m.result==='L'?'Prohra':'Remíza'} (${fmtDate(m.date)})"></span>`
    ).join('');

    return `
    <div class="team-card ${zoneClass}" onclick="goToMatchesForTeam(${team.id})">
      <div class="team-card-header">
        <div>
          <div class="team-name">${team.name} ${zoneBadge}</div>
          <div class="team-division">${team.competition}</div>
        </div>
        <div style="text-align:right">
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
      ${dots ? `<div class="result-dots" title="Posledních ${lastFive.length} zápasů">${dots}</div>` : ''}
    </div>`;
  }).join('');
}

function goToMatchesForTeam(teamId) {
  activeMatchTeam = String(teamId);
  switchSection('vysledky');
}

function renderLatestMatches() {
  const sorted = [...CLUB_DATA.matches]
    .filter(m => !m.future && m.result && m.score)
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
        <div class="mc-teams">
          <span class="mc-team${m.home ? ' mc-our' : ''}">${homeTeam}</span>
          <span class="mc-vs">vs</span>
          <span class="mc-team${!m.home ? ' mc-our' : ''}">${awayTeam}</span>
        </div>
        <div class="match-sub">${fmtDate(m.date)} · ${team.competition}</div>
      </div>
      <div class="match-result">
        <div class="match-score">${scoreHome}<span class="score-sep">:</span>${scoreAway}</div>
        <div class="match-badge ${resultClass(m.result)}">${resultLabel(m.result)}</div>
      </div>
    </div>`;
  }).join('');
}

function renderUpcoming() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // One next match per team
  const upcoming = [];
  for (const team of CLUB_DATA.teams) {
    const next = CLUB_DATA.matches
      .filter(m => m.teamId === team.id && m.future && m.date && m.date >= today)
      .sort((a,b) => (a.date||'').localeCompare(b.date||''))[0];
    if (next) upcoming.push(next);
  }
  upcoming.sort((a,b) => (a.date||'').localeCompare(b.date||''));

  const el = document.getElementById('upcomingMatches');
  const block = document.getElementById('upcomingBlock');
  if (!el) return;

  if (!upcoming.length) { if(block) block.style.display='none'; return; }
  if(block) block.style.display='block';

  el.innerHTML = upcoming.map(m => {
    const team = getTeamById(m.teamId);
    const homeTeam = m.home ? team.name : m.opponent;
    const awayTeam = m.home ? m.opponent : team.name;

    // H2H: last 3 past results vs same opponent – current + up to 2 previous seasons
    function prevH2HMatches(src) {
      if (!src) return [];
      const prevTeamName = (src.teams || []).find(t => {
        const ourTeam = CLUB_DATA.teams.find(ct => ct.id === m.teamId);
        return t.name === ourTeam?.name;
      });
      if (!prevTeamName) return [];
      return (src.matches || []).filter(x => x.teamId === prevTeamName.id && x.opponent === m.opponent && x.result);
    }
    const h2h = [
      ...CLUB_DATA.matches.filter(x => x.teamId === m.teamId && x.opponent === m.opponent && x.result && x.date < today),
      ...prevH2HMatches(window.CLUB_DATA_PREV),
      ...prevH2HMatches(window.CLUB_DATA_PREV2),
    ]
      .sort((a,b) => (b.date||'').localeCompare(a.date||''))
      .slice(0, 3);

    const h2hDots = h2h.length ? `
      <div class="upcoming-h2h">
        <span class="h2h-label">Předchozí vs ${m.opponent.replace('TTC ','').replace('TJ ','').split(' ').slice(0,2).join(' ')}:</span>
        ${h2h.map(x => {
          const hs = x.home ? x.score.home : x.score.away;
          const as = x.home ? x.score.away : x.score.home;
          const yr = x.date ? x.date.slice(0,4) : '';
          return `<span class="h2h-item ${x.result==='W'?'h2h-w':x.result==='L'?'h2h-l':'h2h-d'}" title="${fmtDate(x.date)}">${hs}:${as}<span class="h2h-yr">${yr}</span></span>`;
        }).join('')}
      </div>` : '';

    // Top scorers from last match vs this opponent
    const lastVs = h2h[0];
    let scorers = '';
    if (lastVs?.playerResults?.length) {
      const top = lastVs.playerResults.filter(pr => pr.won).slice(0, 2).map(pr => pr.player.split(' ')[0]).join(', ');
      if (top) scorers = `<span class="upcoming-scorers">Bodovali: ${top}</span>`;
    }

    return `
    <div class="match-row upcoming-row">
      <div class="match-date">${fmtDate(m.date)}${m.time ? `<div style="font-size:12px;font-weight:700;color:var(--c-text)">${m.time}</div>` : ''}</div>
      <div class="match-teams">
        <div class="upcoming-teams-line">
          <span class="team-name${m.home ? ' our-side' : ''}">${homeTeam}</span>
          <span class="upcoming-vs">vs</span>
          <span class="team-name${!m.home ? ' our-side' : ''}">${awayTeam}</span>
        </div>
        <div style="font-size:11px;color:var(--c-muted);margin-top:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>${team.competition}</span>
          <span class="${m.home ? 'venue-home' : 'venue-away'}">${m.home ? '🏠 doma' : '✈️ venku'}</span>
          ${h2h.length ? `<span class="h2h-inline">${h2h.map(x => {
            const hs = x.home ? x.score.home : x.score.away;
            const as = x.home ? x.score.away : x.score.home;
            const yr = x.date ? x.date.slice(2,4) : '';
            return `<span class="h2h-item ${x.result==='W'?'h2h-w':x.result==='L'?'h2h-l':'h2h-d'}" title="${fmtDate(x.date)}">${hs}:${as}<span class="h2h-yr">'${yr}</span></span>`;
          }).join('')}</span>` : ''}
        </div>
      </div>
      <div class="match-badge badge-upcoming">→</div>
    </div>`;
  }).join('');
}

function renderTopPlayers() {
  const merged = getMergedPlayers();
  const minMatches = merged.some(p => p.stats.matches >= 8) ? 8 : 3;
  const sorted = merged
    .filter(p => p.stats.matches >= minMatches)
    .sort((a,b) => b.stats.winPct - a.stats.winPct)
    .slice(0, 6);

  const teamLabel = p => (p.teams||[]).length > 1
    ? (p.teams||[]).map(t => `Tým ${t.team}`).join(', ')
    : `Tým ${p.team}`;

  document.getElementById('topPlayers').innerHTML = sorted.map(p => `
    <div class="player-mini" onclick="openPlayerModal(${p.id})" style="cursor:pointer">
      <div class="player-mini-name">${p.name}</div>
      <div class="player-mini-team">${teamLabel(p)} · ${p.stats.matches} her</div>
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

// ── Shared H2H helper ──────────────────────────────────────
function getH2H(m) {
  const today = new Date().toISOString().split('T')[0];
  function prevMatches(src) {
    if (!src) return [];
    const t = (src.teams || []).find(t => {
      const our = CLUB_DATA.teams.find(ct => ct.id === m.teamId);
      return t.name === our?.name;
    });
    if (!t) return [];
    return (src.matches || []).filter(x => x.teamId === t.id && x.opponent === m.opponent && x.result && x.score);
  }
  return [
    ...CLUB_DATA.matches.filter(x => x.teamId === m.teamId && x.opponent === m.opponent && x.result && x.score && x.date < today),
    ...prevMatches(window.CLUB_DATA_PREV),
    ...prevMatches(window.CLUB_DATA_PREV2),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
}

function h2hHtml(h2h) {
  if (!h2h.length) return '';
  return `<div class="mc-h2h">${h2h.map(x => {
    const s = x.home ? x.score.home : x.score.away;
    const o = x.home ? x.score.away : x.score.home;
    const yr = (x.date || '').slice(2, 4);
    return `<span class="h2h-item ${x.result==='W'?'h2h-w':x.result==='L'?'h2h-l':'h2h-d'}" title="${fmtDate(x.date)}">${s}:${o}<span class="h2h-yr">'${yr}</span></span>`;
  }).join('')}</div>`;
}

// ── 2. ZÁPASY ──────────────────────────────────────────────
function renderFutureCard(m) {
  const team = getTeamById(m.teamId);
  const homeTeam = m.home ? team.name : m.opponent;
  const awayTeam = m.home ? m.opponent : team.name;
  const h2h = getH2H(m);
  const h2hInline = h2h.length ? `<span class="h2h-inline">${h2h.map(x => {
    const s = x.home ? x.score.home : x.score.away;
    const o = x.home ? x.score.away : x.score.home;
    const yr = (x.date || '').slice(2, 4);
    return `<span class="h2h-item ${x.result==='W'?'h2h-w':x.result==='L'?'h2h-l':'h2h-d'}" title="${fmtDate(x.date)}">${s}:${o}<span class="h2h-yr">'${yr}</span></span>`;
  }).join('')}</span>` : '';
  return `
  <div class="match-row upcoming-row">
    <div class="match-date">${fmtDate(m.date)}${m.time ? `<div style="font-size:12px;font-weight:700;color:var(--c-text)">${m.time}</div>` : ''}</div>
    <div class="match-teams">
      <div class="upcoming-teams-line">
        <span class="team-name${m.home ? ' our-side' : ''}">${homeTeam}</span>
        <span class="upcoming-vs">vs</span>
        <span class="team-name${!m.home ? ' our-side' : ''}">${awayTeam}</span>
      </div>
      <div style="font-size:11px;color:var(--c-muted);margin-top:2px;display:flex;align-items:center;gap:8px;flex-wrap:nowrap;overflow:hidden">
        <span style="flex-shrink:0">Kolo ${m.round}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${team.competition}</span>
        <span class="${m.home ? 'venue-home' : 'venue-away'}" style="flex-shrink:0">${m.home ? '🏠 doma' : '✈️ venku'}</span>
        ${h2hInline}
      </div>
    </div>
    <div class="match-badge badge-upcoming">→</div>
  </div>`;
}

// Collect past matches from one data source, resolved with team object + season label
function collectPastMatches(src, teamNameFilter) {
  if (!src) return [];
  const result = [];
  for (const m of (src.matches || [])) {
    if (m.future || !m.result || !m.score) continue;
    const team = (src.teams || []).find(t => t.id === m.teamId);
    if (!team) continue;
    // Only our club's teams (match by name across seasons)
    const ourTeam = CLUB_DATA.teams.find(ct => ct.name === team.name);
    if (!ourTeam) continue;
    // Apply team filter
    if (teamNameFilter && team.name !== teamNameFilter) continue;
    result.push({ ...m, _team: team, _season: src.season || '' });
  }
  return result;
}

function renderVysledky() {
  const tabs = document.getElementById('matchFilterTabs');
  tabs.innerHTML = filterTabsHTML('match');

  const teamFilter = activeMatchTeam !== 'all';
  const filterTeamName = teamFilter
    ? CLUB_DATA.teams.find(t => t.id === parseInt(activeMatchTeam))?.name
    : null;

  // Upcoming (current season only)
  let upcoming;
  if (teamFilter) {
    upcoming = CLUB_DATA.matches
      .filter(m => m.future && m.teamId === parseInt(activeMatchTeam))
      .sort((a,b) => (a.date||'').localeCompare(b.date||''))
      .slice(0, 3);
  } else {
    upcoming = [];
    for (const team of CLUB_DATA.teams) {
      const next = CLUB_DATA.matches
        .filter(m => m.teamId === team.id && m.future)
        .sort((a,b) => (a.date||'').localeCompare(b.date||''))[0];
      if (next) upcoming.push(next);
    }
    upcoming.sort((a,b) => (a.date||'').localeCompare(b.date||''));
  }

  // Past – current season
  const currentPast = collectPastMatches(CLUB_DATA, filterTeamName)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));
  // Past – previous seasons (separate section)
  const prevPast = [
    ...collectPastMatches(window.CLUB_DATA_PREV,  filterTeamName),
    ...collectPastMatches(window.CLUB_DATA_PREV2, filterTeamName),
  ].sort((a,b) => (b.date||'').localeCompare(a.date||''));

  let html = '';
  if (upcoming.length) {
    html += `<div class="matches-section-head">Nadcházející</div>`;
    html += upcoming.map(m => renderFutureCard(m)).join('');
  }
  if (currentPast.length) {
    if (upcoming.length) html += `<div class="matches-section-head" style="margin-top:20px">Odehrané</div>`;
    html += currentPast.map(m => renderMatchCard(m, m._team, m._season)).join('');
  }
  if (prevPast.length) {
    html += `<div class="matches-section-head" style="margin-top:24px">Předchozí sezóny</div>`;
    html += prevPast.map(m => renderMatchCard(m, m._team, m._season)).join('');
  }

  document.getElementById('matchesDetail').innerHTML = html;

  document.querySelectorAll('.match-card-header').forEach(h => {
    h.addEventListener('click', () => {
      if (h.closest('.match-card-future')) return;
      h.closest('.match-card').classList.toggle('open');
    });
  });

  activateFilterTabs('match', tabs);
}

function calcMVP(playerResults) {
  // MVP = our player with most wins; tiebreak by games won
  const our = (playerResults || []).filter(pr => pr.won !== undefined);
  const byPlayer = {};
  for (const pr of our) {
    if (!byPlayer[pr.player]) byPlayer[pr.player] = { wins: 0, gamesW: 0 };
    if (pr.won) byPlayer[pr.player].wins++;
    const [a] = (pr.result || '0:0').split(':').map(Number);
    byPlayer[pr.player].gamesW += a || 0;
  }
  const winners = our.filter(pr => pr.won);
  if (!winners.length) return null;
  return Object.entries(byPlayer)
    .sort((a, b) => b[1].wins - a[1].wins || b[1].gamesW - a[1].gamesW)[0]?.[0] || null;
}

function renderMatchCard(m, teamOverride, seasonLabel) {
  const team      = teamOverride || getTeamById(m.teamId);
  const homeTeam  = m.home ? team.name : m.opponent;
  const awayTeam  = m.home ? m.opponent : team.name;
  const scoreHome = m.home ? m.score.home : m.score.away;
  const scoreAway = m.home ? m.score.away : m.score.home;

  const mvp = calcMVP(m.playerResults);

  // Surprise / upset detection
  const strPairs = (m.playerResults || []).filter(pr => pr.ourStr > 0 && pr.oppStr > 0);
  const avgOurStr = strPairs.length ? Math.round(strPairs.reduce((s,pr) => s + pr.ourStr, 0) / strPairs.length) : 0;
  const avgOppStr = strPairs.length ? Math.round(strPairs.reduce((s,pr) => s + pr.oppStr, 0) / strPairs.length) : 0;
  const strDiff   = avgOppStr - avgOurStr; // positive = opponent stronger
  const isUpset   = strPairs.length > 0 && (
    (strDiff >  50 && m.result === 'W') ||
    (strDiff < -50 && m.result === 'L')
  );

  const playerRows = (m.playerResults || []).map(pr => {
    if (pr.isDoubles) {
      const [a, b] = pr.result.split(':').map(Number);
      const weWin = a > b;
      return `
      <div class="match-player-row doubles-row">
        <div class="player-name-left doubles-label">${pr.player}</div>
        <div class="match-player-score ${weWin ? 'score-w' : 'score-l'}">${pr.result}</div>
        <div class="player-name-right">${pr.opponent}</div>
      </div>`;
    }
    const [a, b] = pr.result.split(':').map(Number);
    const weWin = a > b;
    const isMvp = pr.player === mvp && pr.won;
    const hasStrData = pr.ourStr > 0 && pr.oppStr > 0 && Math.abs(pr.ourStr - pr.oppStr) > 50;
    const upsetWin  = hasStrData && pr.won  && pr.ourStr < pr.oppStr;  // nižší ELO vyhrál
    const upsetLoss = hasStrData && !pr.won && pr.ourStr > pr.oppStr;  // vyšší ELO prohrál
    const upsetIcon = upsetWin ? '<span class="upset-icon upset-win" title="Překvapivá výhra (nižší ELO)">⚡</span>'
                    : upsetLoss ? '<span class="upset-icon upset-loss" title="Překvapivá prohra (vyšší ELO)">💔</span>'
                    : '';
    return `
    <div class="match-player-row${isMvp ? ' mvp-row' : ''}">
      <div class="player-name-left">${isMvp ? '⭐ ' : ''}${pr.player}${upsetIcon}</div>
      <div class="match-player-score ${weWin ? 'score-w' : 'score-l'}">${pr.result}</div>
      <div class="player-name-right">${pr.opponent}</div>
    </div>`;
  }).join('');

  const keyPts = (m.keyPoints || []).map(k => `<li>${k}</li>`).join('');
  const mvpBadge = mvp ? `<span class="mvp-badge">⭐ ${mvp.split(' ')[0]}</span>` : '';

  return `
  <div class="match-card" id="match-${m.id}">
    <div class="match-card-header">
      <div class="mc-meta">
        ${seasonLabel ? `<span class="mc-season">${seasonLabel}</span><span class="mc-sep">·</span>` : ''}
        <span>Kolo ${m.round}</span><span class="mc-sep">·</span>
        <span>${fmtDate(m.date)}</span><span class="mc-sep">·</span>
        <span>${team.competition}</span><span class="mc-sep">·</span>
        <span class="${m.home ? 'venue-home' : 'venue-away'}">${m.home ? '🏠 doma' : '✈️ venku'}</span>
      </div>
      <div class="mc-main">
        <div class="mc-teams">
          <div class="mc-team-side">
            <span class="mc-team${m.home ? ' mc-our' : ''}">${homeTeam}</span>
            ${m.home && mvp ? `<div class="mc-mvp">${mvpBadge}</div>` : ''}
          </div>
          <span class="mc-vs">vs</span>
          <div class="mc-team-side">
            <span class="mc-team${!m.home ? ' mc-our' : ''}">${awayTeam}</span>
            ${!m.home && mvp ? `<div class="mc-mvp">${mvpBadge}</div>` : ''}
          </div>
        </div>
        <div class="mc-right">
          <div class="mc-score-wrap">
            <div class="match-score-big">${scoreHome}<span class="score-separator">:</span>${scoreAway}</div>
            <div class="mc-badges">
              <div class="match-badge ${resultClass(m.result)}">${resultLabel(m.result)}</div>
              ${isUpset ? `<div class="match-badge badge-upset" title="Překvapivý výsledek (ELO rozdíl: ${Math.abs(strDiff)})">⚡</div>` : ''}
            </div>
          </div>
          <div class="expand-icon">▾</div>
        </div>
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
        ${avgOurStr && avgOppStr ? `
        <div class="match-avg-elo">
          Průměr ELO:
          <span class="mc-our-elo">${m.home ? homeTeam : awayTeam} <strong>${avgOurStr}</strong></span>
          <span class="mc-elo-sep">vs</span>
          <span class="mc-opp-elo">${m.home ? awayTeam : homeTeam} <strong>${avgOppStr}</strong></span>
        </div>` : ''}
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
  renderClubSummary();
  renderSeasonProgressChart();
  renderStatsTable();
}

// Club-wide summary: total matches W/D/L, sets, individual games
function renderClubSummary() {
  let el = document.getElementById('clubSummary');
  if (!el) {
    el = document.createElement('div');
    el.id = 'clubSummary';
    el.className = 'section-block';
    document.getElementById('statsTable').parentNode.insertBefore(el, document.getElementById('statsTable'));
  }

  const activeTeam = activeStatsTeam !== 'all'
    ? CLUB_DATA.teams.find(t => t.name.replace('TTC Klánovice ', '') === activeStatsTeam)
    : null;
  const played = CLUB_DATA.matches.filter(m =>
    !m.future && m.result && m.score && (!activeTeam || m.teamId === activeTeam.id)
  );
  let mW=0, mD=0, mL=0, sFor=0, sAg=0, gW=0, gL=0;
  for (const m of played) {
    if (m.result==='W') mW++; else if (m.result==='D') mD++; else mL++;
    const ourSets = m.home ? m.score.home : m.score.away;
    const oppSets = m.home ? m.score.away : m.score.home;
    sFor += ourSets; sAg += oppSets;
    for (const pr of (m.playerResults || [])) {
      if (pr.won) gW++; else gL++;
    }
  }
  const total = mW + mD + mL;
  const mPct  = total > 0 ? Math.round(mW / total * 100) : 0;
  const sDiff = sFor - sAg;
  const gDiff = gW - gL;

  // Average STR per team
  const allStr = CLUB_DATA.players.filter(p=>p.str).map(p=>p.str);
  const maxStr = allStr.length ? Math.max(...allStr) : 1000;
  const minStr = allStr.length ? Math.min(...allStr) : 800;
  const teamStrRows = CLUB_DATA.teams.map(t => {
    const ps = CLUB_DATA.players.filter(p => p.teamId === t.id && p.str);
    if (!ps.length) return '';
    const avg = Math.round(ps.reduce((s,p) => s + p.str, 0) / ps.length);
    const leagueAvg = t.leagueAvgStr || 0;
    const rangeMin = leagueAvg ? Math.min(minStr, leagueAvg) : minStr;
    const rangeMax = leagueAvg ? Math.max(maxStr, leagueAvg) : maxStr;
    const range = rangeMax - rangeMin || 1;
    const pct      = 5 + Math.round((avg        - rangeMin) / range * 85);
    const leaguePct = leagueAvg ? 5 + Math.round((leagueAvg - rangeMin) / range * 85) : 0;
    const teamKey = t.name.replace('TTC Klánovice ', '');
    const dim = activeStatsTeam !== 'all' && teamKey !== activeStatsTeam;
    return `<div class="team-str-row${dim ? ' team-str-row--dim' : ''}">
      <span class="team-str-name">${t.name.replace('TTC Klánovice ','Tým ')}</span>
      <div class="team-str-bar-wrap">
        <div class="team-str-bar" style="width:${pct}%"></div>
        ${leagueAvg ? `<div class="team-str-league-mark" style="left:${leaguePct}%" title="Průměr ligy: ${leagueAvg}"></div>` : ''}
      </div>
      <span class="team-str-val">${avg}${leagueAvg ? `<span class="team-str-league-lbl"> / ${leagueAvg}</span>` : ''}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <h2 class="block-title">Celková bilance${activeTeam ? ` – Tým ${activeTeam.name.replace('TTC Klánovice ', '')}` : ''}</h2>
    <div class="club-summary-grid">
      <div class="cs-card">
        <div class="cs-big stat-w">${mW}</div><div class="cs-lbl">Výher</div>
        <div class="cs-sub">${mD} remíz · ${mL} proher · ${mPct}% úspěšnost</div>
      </div>
      <div class="cs-card">
        <div class="cs-big" style="color:var(--c-primary)">${sFor}</div><div class="cs-lbl">Setů vyhráno</div>
        <div class="cs-sub">Rozdíl <span style="color:${sDiff>=0?'var(--c-green)':'var(--c-red)'}">${sDiff>=0?'+':''}${sDiff}</span> (soupeř ${sAg})</div>
      </div>
      <div class="cs-card">
        <div class="cs-big" style="color:var(--c-accent)">${gW}</div><div class="cs-lbl">Her vyhráno</div>
        <div class="cs-sub">Rozdíl <span style="color:${gDiff>=0?'var(--c-green)':'var(--c-red)'}">${gDiff>=0?'+':''}${gDiff}</span> (soupeř ${gL})</div>
      </div>
    </div>
    ${teamStrRows ? `
    <div class="team-str-section">
      <div class="modal-history-title" style="margin:16px 0 10px">Průměrné STR (Elo) týmů</div>
      ${teamStrRows}
    </div>` : ''}`;
}

// Season progress: cumulative wins per team as SVG polylines
function renderSeasonProgressChart() {
  let el = document.getElementById('seasonProgress');
  if (!el) {
    el = document.createElement('div');
    el.id = 'seasonProgress';
    el.className = 'section-block';
    const clubSummary = document.getElementById('clubSummary');
    clubSummary.parentNode.insertBefore(el, clubSummary.nextSibling);
  }

  const played = CLUB_DATA.matches
    .filter(m => !m.future && m.result && m.date)
    .sort((a,b) => (a.date||'').localeCompare(b.date||''));

  if (played.length < 2) { el.innerHTML = ''; return; }

  // Build running win% per team (chronological, one point per match played)
  const TEAM_COLORS = ['#4f8ef7','#22c55e','#f59e0b','#a78bfa','#ef4444','#06b6d4'];
  const teams = CLUB_DATA.teams;

  const teamLines = teams.map((team, ti) => {
    const teamMatches = played
      .filter(m => m.teamId === team.id)
      .sort((a,b) => (a.date||'').localeCompare(b.date||''));
    let w = 0;
    const points = [{ pct: 50, date: '', n: 0 }]; // neutral start
    for (const m of teamMatches) {
      if (m.result === 'W') w++;
      const n = points.length;
      points.push({ pct: Math.round(w / n * 100), date: m.date, n });
    }
    return { team, color: TEAM_COLORS[ti % TEAM_COLORS.length], points };
  }).filter(l => l.points.length > 1);

  if (!teamLines.length) { el.innerHTML = ''; return; }

  const maxN = Math.max(...teamLines.map(l => l.points.length));
  const W = 560, H = 150, padL = 30, padR = 10, padT = 10, padB = 24;
  const cW = W - padL - padR, cH = H - padT - padB;

  // Y axis: 0%, 25%, 50%, 75%, 100%
  const yLines = [0, 25, 50, 75, 100].map(pct => {
    const y = padT + cH - (pct / 100) * cH;
    return `<line x1="${padL}" x2="${W-padR}" y1="${y}" y2="${y}" stroke="${pct===50?'var(--c-border)':'rgba(46,51,80,.4)'}" stroke-width="${pct===50?1:0.5}" stroke-dasharray="${pct===50?'':'3,3'}"/>
            <text x="${padL-4}" y="${y+3}" font-size="9" fill="var(--c-muted)" text-anchor="end">${pct}%</text>`;
  }).join('');

  const lines = teamLines.map(({ team, color, points }) => {
    const teamKey = team.name.replace('TTC Klánovice ', '');
    const dim = activeStatsTeam !== 'all' && teamKey !== activeStatsTeam;
    const n = points.length;
    const xStep = n > 1 ? cW / (n - 1) : cW;
    const pts = points.map((p, i) => {
      const x = padL + i * xStep;
      const y = padT + cH - (p.pct / 100) * cH;
      return `${x},${y}`;
    }).join(' ');
    // Endpoint label (only for active team)
    const lastP = points[n-1];
    const lx = padL + (n-1) * xStep + 4;
    const ly = padT + cH - (lastP.pct / 100) * cH + 4;
    const label = dim ? '' : `<text x="${Math.min(lx, W-padR-2)}" y="${ly}" font-size="9" fill="${color}" font-weight="600">${lastP.pct}%</text>`;
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${dim ? 1.5 : 2.5}" stroke-linejoin="round" opacity="${dim ? 0.12 : 1}"/>${label}`;
  }).join('');

  const legend = teamLines.map(({ team, color }) => {
    const teamKey = team.name.replace('TTC Klánovice ', '');
    const dim = activeStatsTeam !== 'all' && teamKey !== activeStatsTeam;
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--c-muted);opacity:${dim ? 0.3 : 1}">
      <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke="${color}" stroke-width="2.5"/></svg>
      ${teamKey}
    </span>`;
  }).join('');

  el.innerHTML = `
    <h2 class="block-title">Průběh sezóny – úspěšnost týmů (%)</h2>
    <div style="overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;min-width:260px" xmlns="http://www.w3.org/2000/svg">
        ${yLines}
        ${lines}
      </svg>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:6px">${legend}</div>`;
}

// ── Merge players who appear in multiple teams ──────────────
// Returns deduplicated list; each player has merged stats + `teams` array for detail.
function getMergedPlayers() {
  const byName = {};
  for (const p of CLUB_DATA.players) {
    if (!byName[p.name]) {
      byName[p.name] = {
        ...p,
        teams: [{
          team: p.team, teamId: p.teamId, isRegular: p.isRegular,
          soutezId: p.soutezId, stisId: p.stisId,
          stats: { ...p.stats },
        }],
      };
    } else {
      const base = byName[p.name];
      // Merge stats
      base.stats.wins    += p.stats.wins;
      base.stats.losses  += p.stats.losses;
      base.stats.matches += p.stats.matches;
      const tot = base.stats.wins + base.stats.losses;
      base.stats.winPct = tot > 0 ? Math.round(base.stats.wins / tot * 100) : 0;
      // Use highest STR
      if ((p.str || 0) > (base.str || 0)) {
        base.str = p.str; base.strStab = p.strStab; base.strDelta = p.strDelta;
      }
      // Primary team = isRegular one
      if (p.isRegular && !base.isRegular) {
        base.team = p.team; base.teamId = p.teamId;
        base.isRegular = true; base.stisId = p.stisId; base.soutezId = p.soutezId;
      }
      base.teams.push({
        team: p.team, teamId: p.teamId, isRegular: p.isRegular,
        soutezId: p.soutezId, stisId: p.stisId,
        stats: { ...p.stats },
      });
    }
  }
  return Object.values(byName);
}

const STATS_COLS = [
  { key: null,       label: '#' },
  { key: 'name',     label: 'Hráč' },
  { key: 'team',     label: 'Tým' },
  { key: 'str',      label: 'STR' },
  { key: 'strDelta', label: 'STR±' },
  { key: 'matches',  label: 'Zápasy' },
  { key: 'wins',     label: 'Výhry' },
  { key: 'losses',   label: 'Prohry' },
  { key: 'winPct',   label: 'Úspěšnost' },
];

function sortPlayers(players) {
  return [...players].sort((a, b) => {
    let av, bv;
    switch (statsSortCol) {
      case 'name':     av = a.name;           bv = b.name; break;
      case 'team':     av = a.team;           bv = b.team; break;
      case 'str':      av = a.str || 0;       bv = b.str || 0; break;
      case 'strDelta': av = a.strDelta || 0;  bv = b.strDelta || 0; break;
      case 'matches':  av = a.stats.matches;  bv = b.stats.matches; break;
      case 'wins':     av = a.stats.wins;     bv = b.stats.wins; break;
      case 'losses':   av = a.stats.losses;   bv = b.stats.losses; break;
      case 'winPct':   av = a.stats.winPct;   bv = b.stats.winPct; break;
      default:         av = a.str || 0;       bv = b.str || 0;
    }
    if (typeof av === 'string') return statsSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return statsSortDir === 'asc' ? av - bv : bv - av;
  });
}

function setStatsSort(col) {
  if (statsSortCol === col) statsSortDir = statsSortDir === 'desc' ? 'asc' : 'desc';
  else { statsSortCol = col; statsSortDir = (col === 'name' || col === 'team') ? 'asc' : 'desc'; }
  renderStatsTable();
}

function renderStatsTable() {
  const merged = getMergedPlayers();
  const players = activeStatsTeam === 'all'
    ? merged
    : merged.filter(p =>
        p.team === activeStatsTeam ||
        (p.teams || []).some(t => t.team === activeStatsTeam)
      );

  const sorted = sortPlayers(players);

  const rows = sorted.map((p, i) => {
    const delta = p.strDelta || 0;
    const deltaColor = delta > 0 ? 'var(--c-green)' : delta < 0 ? 'var(--c-red)' : 'var(--c-muted)';
    const deltaStr   = delta > 0 ? `+${delta}` : String(delta);
    return `
    <tr class="player-row" onclick="openPlayerModal(${p.id})" style="cursor:pointer">
      <td class="player-rank">${i+1}</td>
      <td class="player-name-cell">
        <span class="pnc-name">${p.name}${p.isRegular === false ? ' <span class="sub-badge">náhr.</span>' : ''}</span>
        <span class="pnc-team">${(p.teams||[]).length > 1
          ? (p.teams||[]).map(t => `Tým ${t.team}`).join(', ')
          : `Tým ${p.team}`
        }</span>
      </td>
      <td class="col-team">${(p.teams||[]).length > 1
          ? (p.teams||[]).map(t => `<span class="player-team-pill">Tým ${t.team}</span>`).join(' ')
          : `<span class="player-team-pill">Tým ${p.team}</span>`
        }</td>
      <td class="rating-val">${p.str || '–'}</td>
      <td style="color:${deltaColor};font-weight:600;font-size:13px">${p.str ? deltaStr : '–'}</td>
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
    </tr>`;
  }).join('');

  const arrow = key => statsSortCol === key ? (statsSortDir === 'asc' ? ' ↑' : ' ↓') : '';

  document.getElementById('statsTable').innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          ${STATS_COLS.map(c => `<th class="${c.key ? 'sortable' : ''} ${statsSortCol === c.key ? 'sort-active' : ''}"
              ${c.key ? `onclick="setStatsSort('${c.key}')"` : ''}>${c.label}${arrow(c.key)}</th>`).join('')}
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
        <tr class="${r.highlight ? 'our-team' : ''} ${zoneClass}"
            ${r.highlight ? `onclick="goToMatchesForTeam(${team.id})" style="cursor:pointer" title="Zobrazit výsledky"` : ''}>
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

// ── Player Modal ────────────────────────────────────────────
function buildWinChart(history) {
  // Reverse to chronological order
  const chron = [...history].reverse();
  const W = 360, H = 60, pad = 4;
  const n = chron.length;
  const bw = Math.max(4, Math.floor((W - pad * (n + 1)) / n));
  const totalW = (bw + pad) * n + pad;

  const bars = chron.map((h, i) => {
    const x = pad + i * (bw + pad);
    const color = h.won ? 'var(--c-green)' : 'var(--c-red)';
    const bh = h.won ? H - 10 : 20;
    const y = H - bh;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${color}" rx="2" opacity="0.85">
      <title>${fmtDate(h.date)} vs ${h.opponent}: ${h.result}</title>
    </rect>`;
  }).join('');

  // Running win% line
  let cumW = 0;
  const points = chron.map((h, i) => {
    if (h.won) cumW++;
    const pct = cumW / (i + 1);
    const x = pad + i * (bw + pad) + bw / 2;
    const y = H - pct * (H - 10) - 5;
    return `${x},${y}`;
  }).join(' ');

  return `
  <div class="modal-chart-wrap">
    <div class="modal-history-title" style="margin-bottom:6px">Průběh sezóny</div>
    <svg viewBox="0 0 ${totalW} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
      ${bars}
      <polyline points="${points}" fill="none" stroke="var(--c-primary)" stroke-width="1.5" stroke-linejoin="round" opacity="0.8"/>
    </svg>
    <div style="display:flex;gap:14px;margin-top:4px;font-size:11px;color:var(--c-muted)">
      <span><span style="color:var(--c-green)">■</span> výhra</span>
      <span><span style="color:var(--c-red)">■</span> prohra</span>
      <span><span style="color:var(--c-primary)">—</span> průběžná úspěšnost</span>
    </div>
  </div>`;
}

function buildFunFact(matchHistory) {
  if (matchHistory.length < 5) return '';
  const facts = [];

  // Longest winning/losing streak (chronological)
  const chron = [...matchHistory].reverse();
  let maxWS = 0, maxLS = 0, curW = 0, curL = 0;
  for (const h of chron) {
    if (h.won) { curW++; maxWS = Math.max(maxWS, curW); curL = 0; }
    else        { curL++; maxLS = Math.max(maxLS, curL); curW = 0; }
  }
  if (maxWS >= 4) facts.push(`Nejdelší šňůra výher: ${maxWS} zápasů v řadě`);
  if (maxLS >= 4) facts.push(`Nejdelší série proher: ${maxLS} zápasů v řadě`);

  // Opponent win% (min 3 games)
  const oppMap = {};
  for (const h of matchHistory) {
    if (!oppMap[h.opponent]) oppMap[h.opponent] = { w: 0, l: 0 };
    if (h.won) oppMap[h.opponent].w++; else oppMap[h.opponent].l++;
  }
  let bestOpp = null, worstOpp = null;
  for (const [name, s] of Object.entries(oppMap)) {
    const n = s.w + s.l;
    if (n < 3) continue;
    const pct = s.w / n;
    if (!bestOpp  || pct > bestOpp.pct)  bestOpp  = { name, pct, ...s, n };
    if (!worstOpp || pct < worstOpp.pct) worstOpp = { name, pct, ...s, n };
  }
  if (bestOpp && bestOpp.pct >= 0.7)
    facts.push(`Oblíbený soupeř: ${bestOpp.name} – ${bestOpp.w}/${bestOpp.n} výher (${Math.round(bestOpp.pct*100)}%)`);
  if (worstOpp && worstOpp.pct <= 0.3 && worstOpp.name !== bestOpp?.name)
    facts.push(`Nejtěžší soupeř: ${worstOpp.name} – ${worstOpp.w}/${worstOpp.n} výher (${Math.round(worstOpp.pct*100)}%)`);

  // Deciding-set performance (3:2 or 2:3)
  const dec = matchHistory.filter(h => { const [a,b] = (h.result||'').split(':').map(Number); return (a===3&&b===2)||(a===2&&b===3); });
  if (dec.length >= 3) {
    const dW = dec.filter(h => h.won).length;
    const dPct = Math.round(dW / dec.length * 100);
    if (dPct >= 65) facts.push(`V pětisetových bitvách: ${dW}/${dec.length} výher – bojovník! (${dPct}%)`);
    else if (dPct <= 35) facts.push(`V pětisetových bitvách: ${dW}/${dec.length} výher (${dPct}%)`);
  }

  if (!facts.length) return '';
  return `
    <div class="modal-fun-facts">
      ${facts.map(f => `<div class="modal-fun-fact"><span class="fun-fact-icon">💡</span> ${f}</div>`).join('')}
    </div>`;
}

function openPlayerModal(playerId) {
  // Use merged player (may span multiple teams)
  const merged = getMergedPlayers();
  const p = merged.find(x => x.id === playerId)
         || CLUB_DATA.players.find(x => x.id === playerId);
  if (!p) return;

  // Collect all individual match results across ALL teams this player played for
  const playerTeamIds = (p.teams || []).map(t => t.teamId);
  if (!playerTeamIds.includes(p.teamId)) playerTeamIds.push(p.teamId);

  const matchHistory = [];

  // Helper: collect match results for a player from a data source
  function collectHistory(dataSource, seasonLabel) {
    for (const m of (dataSource.matches || [])) {
      if (m.future) continue;
      const teamMatch = (dataSource.teams || []).find(t => t.id === m.teamId);
      // Accept any team if same name (for prev season: team IDs may differ)
      const nameMatch = playerTeamIds.includes(m.teamId)
        || (dataSource !== CLUB_DATA && (dataSource.teams || []).some(t =>
            CLUB_DATA.teams.some(ct => ct.name === t.name) && t.id === m.teamId));
      if (!nameMatch) continue;
      (m.playerResults || []).forEach((pr, ri) => {
        if (pr.player !== p.name) return;
        matchHistory.push({
          date:        m.date,
          matchId:     m.id || 0,
          rowIdx:      ri,
          opponent:    pr.opponent,
          result:      pr.result,
          won:         pr.won,
          competition: teamMatch?.competition || '',
          season:      seasonLabel,
          teamId:      m.teamId,
        });
      });
    }
  }

  collectHistory(CLUB_DATA, CLUB_DATA.season || '');
  if (window.CLUB_DATA_PREV)  collectHistory(window.CLUB_DATA_PREV,  window.CLUB_DATA_PREV.season  || '2024/25');
  if (window.CLUB_DATA_PREV2) collectHistory(window.CLUB_DATA_PREV2, window.CLUB_DATA_PREV2.season || '2023/24');
  matchHistory.sort((a,b) => {
    const dc = (b.date||'').localeCompare(a.date||'');
    if (dc !== 0) return dc;
    const mc = (a.matchId||0) - (b.matchId||0);
    if (mc !== 0) return mc;
    return (a.rowIdx||0) - (b.rowIdx||0);
  });

  // Header stats: current season only (from p.stats, which is aggregated per season)
  const wins   = p.stats.wins;
  const losses = p.stats.losses;
  const total  = p.stats.matches;
  const pct    = p.stats.winPct;
  const delta  = p.strDelta || 0;
  const deltaColor = delta > 0 ? 'var(--c-green)' : delta < 0 ? 'var(--c-red)' : 'var(--c-muted)';
  const rocnik = CLUB_DATA.rocnik || 2025;
  const stisUrl = p.stisId
    ? `https://stis.ping-pong.cz/hrac-${p.stisId}/svaz-420101/rocnik-${rocnik}/soutez-${p.soutezId}`
    : null;

  // Show only current season in the history table (respects the season selector)
  const curSeason = CLUB_DATA.season || '';
  const curHistory = matchHistory.filter(h => !h.season || h.season === curSeason);
  const historyTotal = curHistory.length;

  const historyRows = curHistory.map(h => `
    <tr>
      <td class="modal-match-date">${fmtDate(h.date)}</td>
      <td><span class="result-dot dot-${h.won?'W':'L'}" style="display:inline-block;vertical-align:middle"></span>
          <span style="margin-left:6px;font-weight:600;color:${h.won?'var(--c-green)':'var(--c-red)'}">${h.result}</span></td>
      <td class="modal-opp">${h.opponent}</td>
      <td style="color:var(--c-muted);font-size:12px">${h.competition}</td>
    </tr>`).join('');

  // Per-team breakdown (only shown when player has multiple teams)
  // Derived from curHistory so it matches the current-season filter
  const multiTeams = (p.teams || []).length > 1;
  const teamBreakdown = multiTeams ? `
    <div class="modal-teams-breakdown">
      <div class="modal-history-title" style="margin-bottom:8px">Statistiky po týmech</div>
      ${(p.teams || []).map(t => {
        const th = curHistory.filter(h => h.teamId === t.teamId);
        const tw = th.filter(h => h.won).length;
        const tl = th.filter(h => !h.won).length;
        const tm = tw + tl;
        const tp = tm > 0 ? Math.round(tw / tm * 100) : 0;
        const role = t.isRegular ? 'základní' : 'náhradník';
        return `<div class="modal-team-row">
          <span class="modal-team-pill">Tým ${t.team}</span>
          <span class="modal-team-record">${tw}V / ${tl}P (${tm} zápasů)</span>
          <span class="modal-team-pct">${tp}% · ${role}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  // Team label for header
  const teamLabel = multiTeams
    ? (p.teams || []).map(t => `Tým ${t.team}`).join(', ')
    : `Tým ${p.team}`;

  document.getElementById('playerModalContent').innerHTML = `
    <div class="modal-top-bar">
      ${stisUrl ? `<a href="${stisUrl}" target="_blank" class="modal-stis-link">↗ STIS</a>` : ''}
      <button class="modal-close" onclick="closePlayerModal()">✕</button>
    </div>
    <div class="modal-player-header">
      <div class="modal-player-name">${p.name}</div>
      <div class="modal-player-meta">${teamLabel} · nar. ${p.born || '–'}${!multiTeams && p.isRegular === false ? ' · <span class="sub-badge">náhradník</span>' : ''}</div>
    </div>
    <div class="modal-stats-row">
      <div class="modal-stat"><div class="modal-stat-val rating-val">${p.str || '–'}</div><div class="modal-stat-lbl">STR</div></div>
      <div class="modal-stat"><div class="modal-stat-val" style="color:${deltaColor}">${p.str ? (delta >= 0 ? '+' : '') + delta : '–'}</div><div class="modal-stat-lbl">STR±</div></div>
      <div class="modal-stat"><div class="modal-stat-val stat-w">${wins}</div><div class="modal-stat-lbl">Výhry</div></div>
      <div class="modal-stat"><div class="modal-stat-val stat-l">${losses}</div><div class="modal-stat-lbl">Prohry</div></div>
      <div class="modal-stat"><div class="modal-stat-val" style="color:var(--c-primary)">${pct}%</div><div class="modal-stat-lbl">Úspěšnost</div></div>
    </div>
    <div style="margin:12px 0 20px"><div class="win-pct-bar-bg" style="height:8px"><div class="win-pct-bar-fill" style="width:${pct}%;height:8px"></div></div></div>
    ${teamBreakdown}
    ${buildFunFact(curHistory)}
    ${curHistory.length >= 2 ? buildWinChart(curHistory) : ''}
    ${historyTotal ? `
    <div class="modal-history-title">Zápasová historie (${historyTotal})</div>
    <div class="modal-history-wrap">
      <table class="modal-history-table">
        <thead><tr><th>Datum</th><th>Výsledek</th><th>Soupeř</th><th>Soutěž</th></tr></thead>
        <tbody>${historyRows}</tbody>
      </table>
    </div>` : '<p style="color:var(--c-muted);text-align:center;padding:20px">Žádné zápasy nenalezeny</p>'}
  `;

  document.getElementById('playerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePlayerModal() {
  document.getElementById('playerModal').classList.remove('open');
  document.body.style.overflow = '';
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayerModal(); });

  // Show only prehled initially
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('prehled').classList.add('active');
}

document.addEventListener('DOMContentLoaded', init);
