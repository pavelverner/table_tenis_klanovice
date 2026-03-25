// TTC Klánovice – live server
// node server.js
//
// Slouží jako:
//  - statický HTTP server (index.html, style.css, app.js)
//  - /api/data  → aktuální JSON data (z paměti, bez reloadu stránky)
//  - /api/scrape → ruční spuštění scraperu
//  - automatický scraper: každých 10 minut pokud je dnes zápas, jinak 1× denně

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const DIR  = __dirname;

// ── STAV ────────────────────────────────────────────────────
let cachedData   = null;       // parsed CLUB_DATA object
let lastScraped  = null;       // Date
let scrapeRunning = false;

// ── Načtení dat ─────────────────────────────────────────────
function loadData() {
  try {
    const raw = fs.readFileSync(path.join(DIR, 'data.js'), 'utf8');
    // data.js: "const CLUB_DATA = {...};"  – vyloučíme `const CLUB_DATA = ` a koncové `;`
    const json = raw.replace(/^.*?CLUB_DATA\s*=\s*/s, '').replace(/;\s*$/, '');
    cachedData = JSON.parse(json);
    lastScraped = new Date();
    console.log(`[${ts()}] Data načtena – ${cachedData.matches?.length} zápasů`);
  } catch (e) {
    console.error(`[${ts()}] Chyba při načítání data.js:`, e.message);
  }
}

// ── Spuštění scraperu ────────────────────────────────────────
function runScraper(reason) {
  if (scrapeRunning) {
    console.log(`[${ts()}] Scraper běží, přeskakuji (${reason})`);
    return;
  }
  scrapeRunning = true;
  console.log(`[${ts()}] Spouštím scraper (${reason})...`);

  exec('node scrape.js', { cwd: DIR, timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
    scrapeRunning = false;
    if (err) {
      console.error(`[${ts()}] Scraper selhal:`, err.message);
    } else {
      console.log(`[${ts()}] Scraper OK`);
      loadData();  // reload do paměti
    }
  });
}

// ── Zjisti zda je dnes zápas ─────────────────────────────────
function hasTodayMatch() {
  if (!cachedData) return false;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
  return cachedData.matches?.some(m => {
    const d = m.date;
    if (!d) return false;
    // ISO format "2026-03-22" nebo "22.09.2025"
    if (d.includes('-')) return d === today;
    const parts = d.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
    if (!parts) return false;
    return `${parts[3]}-${parts[2]}-${parts[1].padStart(2,'0')}` === today;
  });
}

// ── Automatický reload ───────────────────────────────────────
function scheduleAutoScrape() {
  const cetNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
  const matchToday = hasTodayMatch();
  const hour = cetNow.getHours();

  // Pokud je dnes zápas a je v rozumný čas (16-23), scrape každých 10 minut
  const interval = (matchToday && hour >= 16 && hour <= 23) ? 10 : 60;

  console.log(`[${ts()}] Další scrape za ${interval} minut${matchToday ? ' (zápas dnes!)' : ''}`);

  setTimeout(() => {
    runScraper(matchToday ? 'zápas dnes' : 'pravidelný');
    scheduleAutoScrape();
  }, interval * 60 * 1000);
}

// ── MIME types ───────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
};

function ts() {
  return new Date().toLocaleTimeString('cs-CZ');
}

// ── HTTP server ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // API: data
  if (url === '/api/data') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(JSON.stringify({
      data: cachedData,
      lastScraped: lastScraped?.toISOString(),
      scrapeRunning,
    }));
    return;
  }

  // API: ruční scrape
  if (url === '/api/scrape') {
    runScraper('ruční požadavek');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Scraper spuštěn' }));
    return;
  }

  // API: stav
  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      lastScraped: lastScraped?.toISOString(),
      scrapeRunning,
      matchesToday: hasTodayMatch(),
      teams: cachedData?.teams?.length || 0,
      matches: cachedData?.matches?.length || 0,
    }));
    return;
  }

  // Statické soubory
  let filePath = path.join(DIR, url === '/' ? 'index.html' : url);
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  });
});

// ── Start ────────────────────────────────────────────────────
loadData();
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  TTC Klánovice – Live Server           ║
║  http://localhost:${PORT}                  ║
╚════════════════════════════════════════╝
`);
  scheduleAutoScrape();
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} je obsazený. Zkus: node server.js`);
  } else {
    console.error(e);
  }
});
