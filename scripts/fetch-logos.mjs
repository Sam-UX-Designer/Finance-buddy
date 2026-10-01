// Downloads real brand logos (the app icon from each brand's Google Play listing, or the website
// icon as a fallback) into apps/mobile/assets/logos-fetched/, then registers them for the app.
// Logos placed by hand in apps/mobile/assets/logos/ always win and are never overwritten.
//
// Runs during the Vercel build. Locally: node scripts/fetch-logos.mjs
// Logos are trademarks of their owners and are shown only to identify the merchant or bank.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const manualDir = `${root}apps/mobile/assets/logos/`;
const outDir = `${root}apps/mobile/assets/logos-fetched/`;

// key → Google Play package(s) to try, then a website for the icon fallback.
const SOURCES = [
  ['swiggy', ['in.swiggy.android'], 'swiggy.com'],
  ['zomato', ['com.application.zomato'], 'zomato.com'],
  ['a2b', [], 'aabsweets.com'],
  ['saravana-bhavan', [], 'saravanabhavan.com'],
  ['starbucks', ['com.starbucks.in'], 'starbucks.in'],
  ['chai-point', [], 'chaipoint.com'],
  ['dominos', ['com.Dominos'], 'dominos.co.in'],
  ['blinkit', ['com.grofers.customerapp'], 'blinkit.com'],
  ['zepto', ['com.zeptoconsumerapp'], 'zeptonow.com'],
  ['bigbasket', ['com.bigbasket.mobileapp'], 'bigbasket.com'],
  ['dmart', ['in.dmart'], 'dmart.in'],
  ['netflix', ['com.netflix.mediaclient'], 'netflix.com'],
  ['spotify', ['com.spotify.music'], 'spotify.com'],
  ['youtube-premium', ['com.google.android.youtube'], 'youtube.com'],
  ['google-one', ['com.google.android.apps.subscriptions.red'], 'one.google.com'],
  ['amazon-prime', ['com.amazon.avod.thirdpartyclient'], 'primevideo.com'],
  ['hotstar', ['in.startv.hotstar'], 'hotstar.com'],
  ['amazon', ['in.amazon.mShop.android.shopping'], 'amazon.in'],
  ['flipkart', ['com.flipkart.android'], 'flipkart.com'],
  ['myntra', ['com.myntra.android'], 'myntra.com'],
  ['croma', ['com.croma.app'], 'croma.com'],
  ['ikea', ['com.ingka.ikea.app'], 'ikea.com'],
  ['uber', ['com.ubercab'], 'uber.com'],
  ['ola', ['com.olacabs.customer'], 'olacabs.com'],
  ['rapido', ['com.rapido.passenger'], 'rapido.bike'],
  ['metro', [], 'english.bmrc.co.in'],
  ['hp-petrol', [], 'hindustanpetroleum.com'],
  ['indian-oil', [], 'iocl.com'],
  ['jio', ['com.jio.myjio'], 'jio.com'],
  ['airtel', ['com.myairtelapp'], 'airtel.in'],
  ['act-fibernet', [], 'actcorp.in'],
  ['bescom', [], 'bescom.karnataka.gov.in'],
  ['tneb', [], 'tnebltd.gov.in'],
  ['bookmyshow', ['com.bt.bms'], 'in.bookmyshow.com'],
  ['pvr', ['com.net.pvr'], 'pvrcinemas.com'],
  ['apollo-pharmacy', ['com.apollo.patientapp'], 'apollopharmacy.in'],
  ['pharmeasy', ['com.phonegap.rxpal'], 'pharmeasy.in'],
  ['cult-fit', ['fit.cure.android'], 'cult.fit'],
  ['makemytrip', ['com.makemytrip'], 'makemytrip.com'],
  ['irctc', ['cris.org.in.prs.ima'], 'irctc.co.in'],
  ['indigo', ['in.goindigo.android'], 'goindigo.in'],
  ['lic', [], 'licindia.in'],
  ['hdfc-life', [], 'hdfclife.com'],
  ['star-health', [], 'starhealth.in'],
  ['zerodha', ['com.zerodha.kite3'], 'zerodha.com'],
  ['groww', ['com.nextbillion.groww'], 'groww.in'],
  // Banks and other account providers.
  ['bank-hdfc', [], 'hdfcbank.com'],
  ['bank-icici', ['com.csam.icici.bank.imobile'], 'icicibank.com'],
  ['bank-axis', ['com.axis.mobile'], 'axisbank.com'],
  ['bank-sbi', ['com.sbi.upi'], 'sbi.co.in'],
  ['bank-cams', [], 'camsonline.com'],
  ['bank-epfo', [], 'epfindia.gov.in'],
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const get = (url) => fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-IN,en' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });

/** File type and pixel size from the image header. */
function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { ext: 'png', w: buf.readUInt32BE(16) };
  if (buf[0] === 0xff && buf[1] === 0xd8) return { ext: 'jpg', w: 999 };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', w: 999 };
  return null;
}

async function fromPlay(pkg) {
  const r = await get(`https://play.google.com/store/apps/details?id=${pkg}&hl=en_IN&gl=IN`);
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/<meta property="og:image" content="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)/);
  if (!m) return null;
  const title = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1]?.replace(/ – Apps on Google Play$/, '') ?? '';
  const img = await get(`${m[1]}=s192`);
  if (!img.ok) return null;
  return { buf: Buffer.from(await img.arrayBuffer()), source: `Google Play: ${title}` };
}

async function fromWebsite(domain) {
  const r = await get(`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`);
  if (!r.ok) return null;
  return { buf: Buffer.from(await r.arrayBuffer()), source: `website icon: ${domain}` };
}

async function fetchOne([key, pkgs, domain]) {
  const manual = existsSync(manualDir) && readdirSync(manualDir).some((f) => f.replace(/\.[^.]+$/, '').toLowerCase() === key);
  if (manual) return `${key}: using your uploaded logo`;
  const attempts = [...pkgs.map((p) => () => fromPlay(p)), ...(domain ? [() => fromWebsite(domain)] : [])];
  for (const attempt of attempts) {
    try {
      const got = await attempt();
      const kind = got && sniff(got.buf);
      // Tiny website icons look blurry; keep the in-app fallback instead.
      if (!kind || kind.w < 96) continue;
      writeFileSync(`${outDir}${key}.${kind.ext}`, got.buf);
      return `${key}: ${got.source}`;
    } catch {
      // try the next source
    }
  }
  return `${key}: not found (app shows its fallback icon)`;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const results = [];
const queue = [...SOURCES];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) results.push(await fetchOne(queue.shift()));
  }),
);
console.log(results.sort().join('\n'));
execFileSync('node', [`${root}scripts/gen-logos.mjs`], { stdio: 'inherit' });
