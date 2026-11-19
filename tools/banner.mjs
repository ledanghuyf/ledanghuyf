// Vẽ banner profile theo thời tiết thật ở Vĩnh Long (dữ liệu Open-Meteo).
// node tools/banner.mjs <file ra.svg> [--scene sunny|cloudy|drizzle|rain|storm|fog] [--night]  (tùy chọn để xem thử)
import { writeFileSync } from 'node:fs';

const [outFile = 'banner.svg', ...flags] = process.argv.slice(2);
const forceScene = flags.includes('--scene') ? flags[flags.indexOf('--scene') + 1] : null;
const LAT = 10.2537, LON = 105.9722;
const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
  latitude: LAT, longitude: LON, timezone: 'Asia/Ho_Chi_Minh', forecast_days: 2,
  current: 'temperature_2m,weather_code,is_day,cloud_cover',
  hourly: 'temperature_2m,weather_code,is_day',
  daily: 'temperature_2m_max,temperature_2m_min',
});
// Máy chủ GitHub Actions đôi khi kết nối chậm: thử lại tối đa 4 lần, cách nhau 5, 10, 15 giây
async function getJSON() {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`Open-Meteo trả HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= 4) throw e;
      console.warn(`Lần ${i} lỗi (${e.cause?.code ?? e.message}), thử lại...`);
      await new Promise(r => setTimeout(r, i * 5000));
    }
  }
}
const d = await getJSON();
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cur = d.current ?? {};
const temp = num(cur.temperature_2m), code = num(cur.weather_code), isDay = cur.is_day === 1 || (cur.is_day === 0 ? false : null), cloudCover = num(cur.cloud_cover);
const tmax = num(d.daily?.temperature_2m_max?.[0]), tmin = num(d.daily?.temperature_2m_min?.[0]);
// Dữ liệu thiếu thì dừng: workflow báo lỗi và banner cũ được giữ nguyên, không vẽ số liệu sai
if (temp === null || code === null || isDay === null || typeof cur.time !== 'string') throw new Error('Thiếu dữ liệu thời tiết hiện tại');

// Phân loại giống ứng dụng thời tiết của mình: ban đêm gọi tên theo lượng mây che phủ
function classify(code, day, cloud) {
  if ([95, 96, 99].includes(code)) return ['storm', code === 95 ? 'Dông' : 'Dông, mưa đá'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['rain', { 61: 'Mưa nhẹ', 63: 'Mưa vừa', 65: 'Mưa to', 80: 'Mưa rào nhẹ', 81: 'Mưa rào', 82: 'Mưa rào to' }[code] ?? 'Mưa'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['drizzle', 'Mưa phùn'];
  if ([45, 48].includes(code)) return ['fog', 'Sương mù'];
  if (day) return code <= 2 ? ['sunny', 'Nhiều nắng'] : ['cloudy', 'Nhiều mây'];
  const c = cloud ?? (code * 25);
  return c < 10 ? ['sunny', 'Trời quang'] : c < 30 ? ['sunny', 'Ít mây'] : c < 60 ? ['partly', 'Mây rải rác'] : ['cloudy', 'Nhiều mây'];
}
let [scene, label] = classify(code, isDay, cloudCover);
const night = flags.includes('--night') ? true : forceScene ? false : !isDay;
if (forceScene) scene = forceScene;

// 5 giờ tới (theo giờ địa phương từ API)
const times = d.hourly?.time ?? [];
const start = Math.max(0, times.findIndex(t => t >= cur.time.slice(0, 13) + ':00'));
const hours = times.slice(start, start + 5).map((t, i) => ({ h: i === 0 ? 'Bây giờ' : t.slice(11, 13), t: num(d.hourly.temperature_2m[start + i]), c: num(d.hourly.weather_code[start + i]), day: d.hourly.is_day?.[start + i] === 1 }));
const updated = cur.time.slice(11, 16);

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const deg = v => (v === null ? '–' : `${Math.round(v)}°`);
const cloudPath = (s, o, fill = '#fff') => `<g transform="scale(${s})" opacity="${o}"><path d="M25 60 a25 25 0 0 1 8-48 a32 32 0 0 1 60-6 a26 26 0 0 1 38 22 a20 20 0 0 1-6 32 z" fill="${fill}"/></g>`;
const SKY = {
  sunny: night ? ['#06122a', '#11264c', '#27457a'] : ['#2b7fd8', '#4d9fe9', '#9fd0fa'],
  partly: night ? ['#08142c', '#16294d', '#2e4670'] : ['#3a86d2', '#5d9fde', '#a7cdee'],
  cloudy: night ? ['#0d1626', '#1c2a40', '#33445e'] : ['#5f7e9f', '#7f9bb8', '#b4c6d8'],
  drizzle: night ? ['#0e1828', '#1d2c42', '#34465f'] : ['#4d6a88', '#6d88a5', '#9fb3c8'],
  rain: night ? ['#0b1422', '#18263a', '#2c3d55'] : ['#40566f', '#5d7590', '#8ea2b8'],
  storm: ['#151d2c', '#243149', '#3d4e69'],
  fog: night ? ['#1a2433', '#2c394b', '#475569'] : ['#8597aa', '#a5b4c3', '#cbd5df'],
}[scene] ?? ['#2b7fd8', '#4d9fe9', '#9fd0fa'];
const dimText = '#e3eefb';

// Lớp mây theo tình trạng trời: [số đám, độ đậm, màu]
const [nClouds, cOp, cFill] = { sunny: [3, night ? .1 : .38, '#fff'], partly: [5, night ? .18 : .45, '#fff'], cloudy: [7, night ? .28 : .55, '#eef3f8'], drizzle: [7, night ? .26 : .5, '#e2e9f1'], rain: [8, night ? .3 : .5, '#d3dce7'], storm: [8, .42, '#8d9bb0'], fog: [6, .35, '#f1f5f9'] }[scene] ?? [3, .38, '#fff'];
const clouds = Array.from({ length: nClouds }, (_, i) => {
  const y = [30, 140, 80, 10, 170, 55, 115, 0][i], s = [1.05, 1.5, .8, 1.25, 1.1, .95, 1.35, 1.6][i], dur = 48 + i * 9, delay = -(i * 17) % dur;
  return `<g style="animation:drift ${dur}s linear ${delay}s infinite"><g transform="translate(0 ${y})">${cloudPath(s, cOp, cFill)}</g></g>`;
}).join('');

const showSun = !night && scene === 'sunny', showMoon = night && ['sunny', 'partly'].includes(scene);
const astro = showSun
  ? `<g transform="translate(1100 66)"><g class="rays">${Array.from({ length: 12 }, (_, i) => `<rect x="-3" y="-62" width="6" height="16" rx="3" fill="#ffe7a3" transform="rotate(${i * 30})"/>`).join('')}</g><circle r="48" fill="#ffd45c" opacity=".22"/><circle r="34" fill="#ffd45c"/></g>`
  : showMoon ? `<g class="stars">${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 137) % 1180 + 10}" cy="${(i * 53) % 170 + 10}" r="${i % 5 ? 1.2 : 2}" fill="#fff" style="animation-delay:${(i % 7) * .55}s"/>`).join('')}</g>
     <g transform="translate(1100 66)"><circle r="40" fill="#f4f1de" opacity=".12"/><circle r="30" fill="#f4f1de"/><circle cx="12" cy="-8" r="26" fill="${SKY[0]}"/></g>` : '';

const rainy = ['drizzle', 'rain', 'storm'].includes(scene);
const drops = rainy ? `<g transform="rotate(8 600 170)">${Array.from({ length: scene === 'drizzle' ? 70 : 110 }, (_, i) => {
  const x = (i * 97) % 1260 - 30, y = (i * 41) % 300, len = scene === 'drizzle' ? 7 : 16;
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + len}" stroke="#dbe8f6" stroke-opacity="${scene === 'drizzle' ? .45 : .55}" stroke-width="${scene === 'drizzle' ? 1 : 1.4}" style="animation:fall ${scene === 'drizzle' ? 1.8 : .75}s linear -${(i % 11) * .09}s infinite"/>`;
}).join('')}</g>` : '';
const storm = scene === 'storm' ? `<rect width="1200" height="340" fill="#e8f0ff" class="flash"/>
  <path class="bolt" d="M610 20 l-34 92 h26 l-30 96 l70-118 h-28 l30-70z" fill="#fff8d6" stroke="#ffe27a" stroke-width="2"/>` : '';
const fog = scene === 'fog' ? [150, 205, 255].map((y, i) => `<rect x="-200" y="${y}" width="1600" height="26" rx="13" fill="#fff" opacity=".22" style="animation:mist ${18 + i * 6}s ease-in-out infinite alternate"/>`).join('') : '';

function bridge() {
  const ink = night ? '#081327' : scene === 'sunny' ? '#1d5fa8' : '#2f4a66', water = night ? '#0d1f3d' : scene === 'sunny' ? '#5fa6e6' : '#7c93ab';
  const towers = [470, 760], deckY = 278;
  let cables = '';
  for (const tx of towers) for (let k = 1; k <= 7; k++) cables += `<path d="M${tx} 206 L${tx - k * 19} ${deckY} M${tx} 206 L${tx + k * 19} ${deckY}" stroke="${ink}" stroke-width="1.2" opacity=".8"/>`;
  const lights = night ? Array.from({ length: 16 }, (_, i) => `<circle cx="${330 + i * 36}" cy="${deckY - 3}" r="2" fill="#ffd27a" class="lamp" style="animation-delay:${(i % 5) * .5}s"/>`).join('') : '';
  const palms = [70, 120, 1040, 1110, 1150].map((x, i) => `<g transform="translate(${x} ${296 - (i % 2) * 6})" fill="${ink}"><rect x="-2" y="-34" width="4" height="40" rx="2"/><path d="M0-36 q-22-6-30 6 q16-10 30-4 q-14-14-26-10 q16-2 26 8 q8-16 24-14 q-14 2-22 14 q16-8 30 2 q-14-10-32-2z"/></g>`).join('');
  return `<rect x="0" y="292" width="1200" height="48" fill="${water}"/><path d="M0 300 Q300 290 600 298 T1200 296 V340 H0z" fill="${ink}" opacity=".35"/>
  <g class="shine"><rect x="180" y="314" width="120" height="2" rx="1" fill="#fff" opacity=".35"/><rect x="620" y="324" width="180" height="2" rx="1" fill="#fff" opacity=".3"/><rect x="960" y="310" width="90" height="2" rx="1" fill="#fff" opacity=".35"/></g>
  ${cables}${towers.map(tx => `<path d="M${tx - 7} ${deckY + 14} L${tx - 3} 198 h6 L${tx + 7} ${deckY + 14}z" fill="${ink}"/>`).join('')}
  <rect x="300" y="${deckY}" width="640" height="7" rx="2" fill="${ink}"/><path d="M300 ${deckY + 7} Q260 296 200 300 M940 ${deckY + 7} Q980 296 1040 300" stroke="${ink}" stroke-width="5" fill="none"/>${lights}${palms}`;
}

const glyph = (c, day, x) => {
  if (c === null) return '';
  if (c >= 95) return `<path d="M${x + 2} -8 l-6 9 h5 l-4 8 l9-11 h-5 l4-6z" fill="#ffe27a"/>`;
  if (c >= 51) return `<g transform="translate(${x - 9} -9) scale(.13)">${cloudPath(1, 1)}</g><g stroke="#cfe6ff" stroke-width="1.6" stroke-linecap="round"><line x1="${x - 5}" y1="3" x2="${x - 6}" y2="7"/><line x1="${x}" y1="3" x2="${x - 1}" y2="7"/><line x1="${x + 5}" y1="3" x2="${x + 4}" y2="7"/></g>`;
  if (c >= 3) return `<g transform="translate(${x - 9} -6) scale(.13)">${cloudPath(1, 1)}</g>`;
  return day ? `<circle cx="${x}" cy="0" r="6" fill="#ffd45c"/>` : `<circle cx="${x}" cy="0" r="6" fill="#f4f1de"/><circle cx="${x + 3}" cy="-2" r="5" fill="${SKY[2]}"/>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="340" viewBox="0 0 1200 340" role="img" aria-label="Lê Đăng Huy, Web Developer. Thời tiết Vĩnh Long lúc ${updated}: ${deg(temp)}, ${label}.">
<style>
@keyframes drift{from{transform:translateX(-260px)}to{transform:translateX(1260px)}}
.rays{animation:spin 32s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.stars circle,.lamp{animation:tw 3.4s ease-in-out infinite}@keyframes tw{0%,100%{opacity:.25}50%{opacity:1}}
.card{animation:float 6s ease-in-out infinite}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.shine{animation:sh 5s ease-in-out infinite}@keyframes sh{0%,100%{opacity:.4}50%{opacity:1}}
@keyframes fall{from{transform:translateY(-40px)}to{transform:translateY(60px)}}
@keyframes mist{from{transform:translateX(-80px)}to{transform:translateX(80px)}}
.flash{opacity:0;animation:flash 7s infinite}.bolt{opacity:0;animation:bolt 7s infinite}
@keyframes flash{0%,62%,66%,70%,100%{opacity:0}63%{opacity:.35}68%{opacity:.2}}
@keyframes bolt{0%,62%,67%,100%{opacity:0}63%,65%{opacity:1}}
.cur{animation:blink 1.1s steps(1) infinite}@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.flash,.bolt{opacity:0}}
</style>
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY[0]}"/><stop offset=".65" stop-color="${SKY[1]}"/><stop offset="1" stop-color="${SKY[2]}"/></linearGradient>
<filter id="sh" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#06213f" flood-opacity=".5"/></filter>
<clipPath id="r"><rect width="1200" height="340" rx="18"/></clipPath></defs>
<g clip-path="url(#r)">
<rect width="1200" height="340" fill="url(#sky)"/>
${astro}${clouds}${storm}${fog}${bridge()}${drops}
<g filter="url(#sh)">
<text x="64" y="92" font-family="${FONT}" font-size="21" fill="${dimText}">Xin chào, mình là</text>
<text x="62" y="152" font-family="${FONT}" font-size="60" font-weight="700" fill="#fff">Lê Đăng Huy</text>
<text x="64" y="192" font-family="${FONT}" font-size="23" fill="#fff">Web Developer<tspan class="cur" fill="${dimText}"> ▍</tspan></text>
<text x="64" y="226" font-family="${FONT}" font-size="17" fill="${dimText}">Sinh viên Công nghệ Thông tin · Đại học Trà Vinh</text>
</g>
<g class="card"><g transform="translate(784 46)">
<rect width="250" height="208" rx="22" fill="#fff" fill-opacity="${night ? .09 : .2}" stroke="#fff" stroke-opacity=".4"/>
<text x="22" y="34" font-family="${FONT}" font-size="16" font-weight="600" fill="#fff">Vĩnh Long</text>
<text x="228" y="34" text-anchor="end" font-family="${FONT}" font-size="11" fill="${dimText}">${updated}</text>
<text x="22" y="92" font-family="${FONT}" font-size="52" font-weight="300" fill="#fff">${deg(temp)}</text>
<text x="22" y="118" font-family="${FONT}" font-size="14" fill="#fff">${label} · C:${deg(tmax)} T:${deg(tmin)}</text>
<line x1="22" y1="134" x2="228" y2="134" stroke="#fff" stroke-opacity=".3"/>
${hours.map(({ h, t, c, day }, i) => { const x = 36 + i * 44; return `<text x="${x}" y="154" text-anchor="middle" font-family="${FONT}" font-size="${h.length > 2 ? 9 : 11}" fill="${dimText}">${h}</text><g transform="translate(0 170)">${glyph(c, day, x)}</g><text x="${x}" y="194" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#fff">${deg(t)}</text>`; }).join('')}
</g></g>
</g></svg>`;
writeFileSync(outFile, svg);
console.log(`Vĩnh Long ${updated}: ${deg(temp)} ${label} (mã ${code}, ${isDay ? 'ngày' : 'đêm'}, mây ${cloudCover}%) → ${scene}${night ? ', đêm' : ''}`);
