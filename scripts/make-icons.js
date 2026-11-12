// Renders the LootHub icon (purple gift) to PNGs with the bundled Chromium/Playwright.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const fa = fs.readFileSync(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free/svgs/solid/gift.svg'), 'utf8');
const d = fa.match(/ d="([^"]+)"/)[1], vb = fa.match(/viewBox="([^"]+)"/)[1];
const svg = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
 <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A78BFA"/><stop offset=".5" stop-color="#8B5CF6"/><stop offset="1" stop-color="#5B21B6"/></linearGradient></defs>
 ${bg ? '<rect width="512" height="512" rx="112" fill="url(#g)"/>' : '<rect x="16" y="16" width="480" height="480" rx="120" fill="url(#g)"/>'}
 <svg x="116" y="108" width="280" height="280" viewBox="${vb}"><path fill="#fff" d="${d}"/></svg></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const out = path.join(__dirname, '../app/assets');
  for (const [name, size, bg] of [['icon-512.png', 512, 1], ['icon-192.png', 192, 1], ['tray-32.png', 32, 0], ['tray-16.png', 16, 0]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(bg).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close(); console.log('icons written');
})();
