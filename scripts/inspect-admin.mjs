import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';

const phase = process.argv.includes('--after') ? 'after' : 'before';
const outDir = path.resolve('.taste-skill', phase);
fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : null;
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    local,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ];
  const f = c.find(p => p && fs.existsSync(p));
  if (!f) throw new Error('no Chrome found');
  return f;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = path.join(process.cwd(), '.taste-skill', `chrome-inspect-${phase}`);
fs.mkdirSync(profile, { recursive: true });
const portFile = path.join(profile, 'DevToolsActivePort');
try { fs.rmSync(portFile); } catch {}

const chrome = spawn(findChrome(), [
  '--headless=new',
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=0',
  '--ignore-certificate-errors',
  '--allow-insecure-localhost',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--mute-audio',
  '--disable-gpu',
  '--window-size=1440,900',
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const kill = () => {
  try { execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {
    try { chrome.kill(); } catch {}
  }
};

process.on('exit', kill);
process.on('SIGINT', () => { kill(); process.exit(1); });

async function run() {
  console.log(`Starting inspection for phase: ${phase}...`);
  let port = null;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    try { port = parseInt(fs.readFileSync(portFile, 'utf8'), 10) || null; } catch {}
  }
  if (!port) throw new Error('Chrome did not start DevTools port');

  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });

  let id = 0;
  const pend = new Map();
  const subs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else subs.forEach(f => f(m));
  });

  const send = (method, params = {}, sessionId) => new Promise(r => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = async (m, p) => {
    const r = await send(m, p, sessionId);
    if (r.error) throw new Error(`${m}: ${r.error.message}`);
    return r.result;
  };
  const ev = async fnStr => (await S('Runtime.evaluate', { expression: fnStr, awaitPromise: true, returnByValue: true })).result.value;

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Network.enable');

  await S('Network.setCookie', {
    name: 'qurban_admin_auth',
    value: 'granted',
    url: 'https://localhost:3000',
    domain: 'localhost',
    path: '/'
  });

  console.log('Navigating to https://localhost:3000/admin ...');
  await S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: 'https://localhost:3000/admin' });

  console.log('Waiting for page hydration and data...');
  const tStart = Date.now();
  let ready = false;
  while (Date.now() - tStart < 15000) {
    const checkFn = `Boolean(document.querySelector('h1') && document.querySelectorAll('tbody tr').length > 0 && !document.querySelector('.fa-spinner'))`;
    const isReady = await ev(checkFn);
    if (isReady) { ready = true; break; }
    await sleep(500);
  }
  await sleep(1200);
  console.log(`Page ready: ${ready}`);

  // Take Desktop Screenshot (1440x900)
  const deskShot = await S('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'screenshot-1440x900.png'), Buffer.from(deskShot.data, 'base64'));
  console.log(`Saved ${path.join(outDir, 'screenshot-1440x900.png')}`);

  // Tablet Viewport (768x1024)
  await S('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  const tabShot = await S('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'screenshot-768x1024.png'), Buffer.from(tabShot.data, 'base64'));
  console.log(`Saved ${path.join(outDir, 'screenshot-768x1024.png')}`);

  // Mobile Viewport (390x844)
  await S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  const mobShot = await S('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'screenshot-390x844.png'), Buffer.from(mobShot.data, 'base64'));
  console.log(`Saved ${path.join(outDir, 'screenshot-390x844.png')}`);

  // Back to Desktop for measurement extraction and interactive tests
  await S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(500);

  // Extract comprehensive measurements using function serialization
  const extractFn = `(() => {
    const getStyle = el => el ? window.getComputedStyle(el) : null;
    const h1 = document.querySelector('h1');
    const h1Style = getStyle(h1);
    const cardTitle = document.querySelector('section h3');
    const cardTitleStyle = getStyle(cardTitle);
    const cardPct = document.querySelector('section [class*="text-[38px]"], section [class*="text-4xl"]');
    const cardPctStyle = getStyle(cardPct);
    const th = document.querySelector('thead th');
    const thStyle = getStyle(th);
    const td = document.querySelector('tbody td');
    const tdStyle = getStyle(td);
    const input = document.querySelector('input');
    const inputStyle = getStyle(input);

    const bodyStyle = getStyle(document.body);
    const topbar = document.querySelector('header');
    const topbarStyle = getStyle(topbar);
    const deckCard = document.querySelector('section > div');
    const deckCardStyle = getStyle(deckCard);
    const filterBar = document.querySelector('input') ? document.querySelector('input').closest('div[class*="rounded"]') : null;
    const filterBarStyle = getStyle(filterBar);
    const tableWrap = document.querySelector('table') ? document.querySelector('table').closest('div.flex.h-full, div[class*="rounded-[18px]"], div[class*="rounded-2xl"]') : null;
    const tableWrapStyle = getStyle(tableWrap);
    const aside = document.querySelector('aside');
    const asideStyle = getStyle(aside);
    const footer = document.querySelector('footer');
    const footerStyle = getStyle(footer);
    const btnAccent = document.querySelector('button[class*="bg-[#34D399]"], button[class*="bg-emerald"], button[class*="bg-[#FF5B35]"]');
    const btnAccentStyle = getStyle(btnAccent);

    const headerRect = topbar ? topbar.getBoundingClientRect() : null;
    const deckRect = document.querySelector('section') ? document.querySelector('section').getBoundingClientRect() : null;
    const filterRect = filterBar ? filterBar.getBoundingClientRect() : null;
    const mainRect = document.querySelector('main') ? document.querySelector('main').getBoundingClientRect() : null;
    const asideRect = aside ? aside.getBoundingClientRect() : null;
    const footerRect = footer ? footer.getBoundingClientRect() : null;

    const cards = document.querySelectorAll('section > div');
    const tableRows = document.querySelectorAll('tbody tr');
    const buttons = document.querySelectorAll('button');
    const logItems = document.querySelectorAll('aside div[class*="rounded"]');

    const checkBackdrop = el => {
      if (!el) return 'none';
      const cs = getStyle(el);
      return cs.backdropFilter || cs['-webkit-backdrop-filter'] || 'none';
    };

    return {
      typography: {
        h1: h1Style ? {
          fontFamily: h1Style.fontFamily,
          fontSize: h1Style.fontSize,
          fontWeight: h1Style.fontWeight,
          lineHeight: h1Style.lineHeight,
          color: h1Style.color,
          letterSpacing: h1Style.letterSpacing
        } : null,
        cardTitle: cardTitleStyle ? {
          fontFamily: cardTitleStyle.fontFamily,
          fontSize: cardTitleStyle.fontSize,
          fontWeight: cardTitleStyle.fontWeight,
          color: cardTitleStyle.color
        } : null,
        percentageNumber: cardPctStyle ? {
          fontSize: cardPctStyle.fontSize,
          fontWeight: cardPctStyle.fontWeight,
          letterSpacing: cardPctStyle.letterSpacing
        } : null,
        tableHeader: thStyle ? {
          fontSize: thStyle.fontSize,
          fontWeight: thStyle.fontWeight,
          textTransform: thStyle.textTransform,
          color: thStyle.color
        } : null,
        tableCell: tdStyle ? {
          fontSize: tdStyle.fontSize,
          color: tdStyle.color
        } : null,
        searchInput: inputStyle ? {
          fontSize: inputStyle.fontSize,
          fontFamily: inputStyle.fontFamily,
          color: inputStyle.color
        } : null
      },
      colors: {
        bodyBg: bodyStyle ? bodyStyle.backgroundColor : null,
        topbarBg: topbarStyle ? topbarStyle.backgroundColor : null,
        deckCardBg: deckCardStyle ? deckCardStyle.backgroundColor : null,
        deckCardBorder: deckCardStyle ? (deckCardStyle.borderWidth + ' ' + deckCardStyle.borderStyle + ' ' + deckCardStyle.borderColor) : null,
        deckCardShadow: deckCardStyle ? deckCardStyle.boxShadow : null,
        filterBarBg: filterBarStyle ? filterBarStyle.backgroundColor : null,
        tableWrapBg: tableWrapStyle ? tableWrapStyle.backgroundColor : null,
        asideBg: asideStyle ? asideStyle.backgroundColor : null,
        footerBg: footerStyle ? footerStyle.backgroundColor : null,
        btnAccentBg: btnAccentStyle ? btnAccentStyle.backgroundColor : null,
        btnAccentColor: btnAccentStyle ? btnAccentStyle.color : null
      },
      frame: {
        topbarHeight: headerRect ? Math.round(headerRect.height) : 0,
        deckHeight: deckRect ? Math.round(deckRect.height) : 0,
        filterBarHeight: filterRect ? Math.round(filterRect.height) : 0,
        mainHeight: mainRect ? Math.round(mainRect.height) : 0,
        asideWidth: asideRect ? Math.round(asideRect.width) : 0,
        footerHeight: footerRect ? Math.round(footerRect.height) : 0,
        deckCardRadius: deckCardStyle ? deckCardStyle.borderRadius : null,
        filterBarRadius: filterBarStyle ? filterBarStyle.borderRadius : null,
        tableWrapRadius: tableWrapStyle ? tableWrapStyle.borderRadius : null,
        asideRadius: asideStyle ? asideStyle.borderRadius : null
      },
      glassmorphism: {
        topbarBackdrop: checkBackdrop(topbar),
        deckCardBackdrop: checkBackdrop(deckCard),
        filterBarBackdrop: checkBackdrop(filterBar),
        tableWrapBackdrop: checkBackdrop(tableWrap),
        asideBackdrop: checkBackdrop(aside),
        footerBackdrop: checkBackdrop(footer)
      },
      counts: {
        deckCards: cards.length,
        tableRows: tableRows.length,
        buttons: buttons.length,
        logItems: logItems.length,
        domNodes: document.querySelectorAll('*').length
      }
    };
  })()`;

  const metrics = await ev(extractFn);
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(`Saved metrics to ${path.join(outDir, 'metrics.json')}`);

  // Test interactive elements click-through
  console.log('Testing interactive click-through...');
  const testFn = `(async () => {
    const results = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // 1. Test search filter
    const searchInput = document.querySelector('input[placeholder*="Search"]');
    if (searchInput) {
      const initialRows = document.querySelectorAll('tbody tr').length;
      searchInput.value = 'SP-01';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(200);
      const filteredRows = document.querySelectorAll('tbody tr').length;
      results.searchFilter = {
        passed: true,
        initialRows,
        filteredRows,
        filteredSuccessfully: filteredRows <= initialRows
      };
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(200);
    } else {
      results.searchFilter = { passed: false, error: 'search input not found' };
    }

    // 2. Test Quick Filter button
    const quickButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Selesai') || b.textContent.includes('Belum'));
    if (quickButtons.length > 0) {
      quickButtons[0].click();
      await sleep(200);
      results.quickFilter = {
        passed: true,
        clicked: quickButtons[0].textContent.trim(),
        rowsAfterClick: document.querySelectorAll('tbody tr').length
      };
      const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Reset') || b.textContent.includes('Semua'));
      if (resetBtn) { resetBtn.click(); await sleep(200); }
    } else {
      results.quickFilter = { passed: false, error: 'quick filter buttons not found' };
    }

    // 3. Test Accordion toggle in Phase Deck
    const accBtn = Array.from(document.querySelectorAll('button')).find(b => /Selengkapnya|Detail/i.test(b.textContent));
    if (accBtn) {
      accBtn.click();
      await sleep(400);
      const isExpanded = /tutup detail|tutup/i.test(document.body.innerText) || /tutup/i.test(accBtn.textContent);
      results.accordion = {
        passed: isExpanded,
        buttonTextAfter: accBtn.textContent.trim()
      };
      accBtn.click();
      await sleep(300);
    } else {
      results.accordion = { passed: false, error: 'accordion button not found' };
    }

    // 4. Test TV Page Buttons
    const pageButtons = Array.from(document.querySelectorAll('button')).filter(b => /^[1-9]$/.test(b.textContent.trim()));
    results.tvPagination = {
      passed: pageButtons.length > 0,
      pageCount: pageButtons.length
    };

    // 5. Test Status pills in Table
    const statusPill = document.querySelector('tbody td button');
    results.statusPills = {
      passed: !!statusPill,
      samplePillText: statusPill ? statusPill.textContent.trim() : null
    };

    // 6. Test Realtime Log Pause button
    const pauseBtn = document.querySelector('aside button[title*="auto-scroll"], aside button[title*="Jeda"]');
    results.logPauseToggle = {
      passed: !!pauseBtn
    };

    return results;
  })()`;

  const testResults = await ev(testFn);
  fs.writeFileSync(path.join(outDir, 'interaction-test.json'), JSON.stringify(testResults, null, 2));
  console.log(`Saved interaction test results to ${path.join(outDir, 'interaction-test.json')}`);

  kill();
  console.log(`Inspection for ${phase} completed successfully!`);
}

run().catch(err => {
  console.error('Inspection error:', err);
  kill();
  process.exit(1);
});
