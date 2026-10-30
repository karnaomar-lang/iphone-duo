// Monitor de disponibilidad en tienda: iPhone Duo 1TB y 512GB (Night Sky / Star White, desbloqueado) en Apple.com
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TOPIC = process.env.NTFY_TOPIC;
if (!TOPIC) throw new Error('Falta NTFY_TOPIC');

const PARTS = {
  'MK1L4LL/A': 'Night Sky 1TB',
  'MK1J4LL/A': 'Star White 1TB',
  'MK1H4LL/A': 'Night Sky 512GB',
  'MK1G4LL/A': 'Star White 512GB',
  ...JSON.parse(process.env.EXTRA_PARTS || '{}'),
};

const WINDOWS = [
  // San Diego hasta el 10 de nov; Orlando del 6 al 19 de nov.
  { name: 'San Diego', zip: '92108', stores: { R040: 'Fashion Valley', R082: 'UTC', R213: 'Otay Ranch', R294: 'Carlsbad' }, from: '2026-10-28', to: '2026-11-10' },
  { name: 'Orlando', zip: '32809', stores: { R143: 'Florida Mall', R053: 'Millenia', R291: 'Altamonte' }, from: '2026-11-06', to: '2026-11-19' },
];

const STATE_FILE = 'state.json';
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { seen: {}, blindAlerted: false };
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

async function notify(title, message, priority = 'urgent', click) {
  const headers = { Title: title, Priority: priority, Tags: 'iphone,rotating_light' };
  if (click) headers.Click = click;
  const r = await fetch(`https://ntfy.sh/${TOPIC}`, { method: 'POST', body: message, headers });
  if (!r.ok) console.error('ntfy fallo', r.status);
}

// Alerta critica via Pushover (suena aunque el telefono este en silencio y repite hasta confirmar).
// Si faltan las claves, no hace nada: el aviso sigue saliendo por ntfy.
async function notifyCritical(title, message, url, priority = 2) {
  const { PUSHOVER_TOKEN: token, PUSHOVER_USER: user } = process.env;
  if (!token || !user) return console.log('Pushover sin configurar; solo ntfy');
  const fields = { token, user, title, message, priority: String(priority) };
  if (priority === 2) Object.assign(fields, { retry: '60', expire: '3600', sound: 'siren' });
  if (url) Object.assign(fields, { url, url_title: 'Abrir compra en Apple' });
  const body = new URLSearchParams(fields);
  try {
    const r = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body });
    if (!r.ok) console.error('pushover fallo', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error('pushover error', e.message); }
}

async function check(win) {
  const qs = new URLSearchParams({ pl: 'true', location: win.zip });
  Object.keys(PARTS).forEach((p, i) => qs.set(`parts.${i}`, p));
  // reintenta errores pasajeros (503, 541, etc.) con esperas crecientes antes de darse por ciego
  const waits = [4000, 10000, 20000];
  let r, json, body = '';
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      r = await fetch(`https://www.apple.com/shop/retail/pickup-message?${qs}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          Accept: 'application/json, text/javascript, */*; q=0.01', 'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.apple.com/shop/buy-iphone', 'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(20000),
      });
      body = await r.text();
      json = JSON.parse(body);
      break;
    } catch {
      json = undefined;
      if (attempt < waits.length) await new Promise(res => setTimeout(res, waits[attempt]));
    }
  }
  if (!json) return { blind: `HTTP ${r?.status ?? 'sin respuesta'}, respuesta no JSON (${waits.length + 1} intentos): ${body.slice(0, 150).replace(/\s+/g, ' ')}` };
  const stores = json?.body?.stores;
  if (!Array.isArray(stores) || stores.length === 0) return { blind: 'JSON sin lista de tiendas' };
  const hits = [];
  for (const s of stores) {
    if (!win.stores[s.storeNumber]) continue;
    for (const [part, label] of Object.entries(PARTS)) {
      const a = s.partsAvailability?.[part];
      if (!a) continue;
      const selectable = a.messageTypes?.regular?.storeSelectionEnabled === true;
      if (a.pickupDisplay === 'available' && selectable) {
        hits.push({ key: `${win.name}|${s.storeNumber}|${part}`, text: `${label} en ${s.storeName} (${win.name}): ${a.pickupSearchQuote || 'disponible'}` });
      }
    }
  }
  return { hits };
}

let anyBlind = null;
const summary = [];
for (const win of WINDOWS) {
  if (today < win.from || today > win.to) { console.log(`${win.name}: fuera de ventana (${win.from}..${win.to})`); summary.push(`${win.name}: aun fuera de su ventana (${win.from} a ${win.to})`); continue; }
  const res = await check(win);
  if (res.blind) { anyBlind = `${win.name}: ${res.blind}`; console.log('CIEGO', anyBlind); summary.push(`${win.name}: NO PUDE LEER APPLE`); continue; }
  if (res.hits.length) {
    // revalida antes de avisar: la opcion debe seguir ahi en una segunda consulta
    await new Promise(r => setTimeout(r, 3000));
    const again = await check(win);
    if (again.blind) { anyBlind = `${win.name}: ${again.blind}`; console.log('CIEGO en revalidacion', anyBlind); continue; }
    res.hits = res.hits.filter(h => again.hits.some(x => x.key === h.key));
  }
  console.log(`${win.name}: ${res.hits.length} disponibles`);
  summary.push(`${win.name}: ${res.hits.length} disponibles`);
  const now = Date.now();
  const fresh = res.hits.filter(h => now - (state.seen[h.key] || 0) > 30 * 60 * 1000);
  if (fresh.length) {
    await notify(`iPhone Duo DISPONIBLE - ${win.name}`, fresh.map(h => h.text).join('\n') + '\n\nCompra YA: sin AppleCare, sin intercambio, recoger en tienda. En el checkout confirma la fecha de recogida.', 'urgent',
      'https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-1tb-night-sky-unlocked');
    await notifyCritical(`iPhone Duo DISPONIBLE - ${win.name}`, fresh.map(h => h.text).join('\n') + '\nCompra YA. Confirma la fecha de recogida.', 'https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-1tb-night-sky-unlocked');
    fresh.forEach(h => (state.seen[h.key] = now));
  }
  // limpia los que dejaron de estar disponibles para volver a avisar si reaparecen
  for (const k of Object.keys(state.seen)) if (k.startsWith(win.name + '|') && !res.hits.some(h => h.key === k)) delete state.seen[k];
}

// Un fallo suelto de Apple (541, 503...) no avisa: solo si dura 3 min seguidos. Todo fallo queda en state.blindLog.
const nowMs = Date.now();
if (anyBlind) {
  state.blindSince ??= nowMs;
  state.blindLog = [...(state.blindLog || []), `${new Date(nowMs).toISOString()} ${anyBlind}`].slice(-20);
}
if (anyBlind && !state.blindAlerted && nowMs - state.blindSince >= 3 * 60 * 1000) {
  await notify('Monitor Duo: no puedo leer Apple', `${anyBlind}\nLlevo 3 min sin poder leer. No estoy vigilando hasta que se arregle. Revisa tu mismo en apple.com.`, 'high');
  await notifyCritical('Monitor Duo: no puedo leer Apple', `${anyBlind}\nLlevo 3 min sin poder leer. No estoy vigilando hasta que se arregle. Revisa tu mismo en apple.com.`, undefined, 1);
  state.blindAlerted = true;
} else if (!anyBlind) { state.blindSince = null; state.blindAlerted = false; }

// aviso diario de que el monitor sigue vivo (primer run despues de las 8:00 hora CDMX)
const mx = new Date().toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' });
const [mxDate, mxTime] = mx.split(' ');
if (parseInt(mxTime.slice(0, 2), 10) >= 8 && state.lastHeartbeat !== mxDate) {
  await notify('Monitor Duo: sigo vigilando', summary.join('\n') + '\n(Este aviso llega 1 vez al dia. Si un dia no llega, el monitor se cayo.)', 'low');
  state.lastHeartbeat = mxDate;
}

writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

// Si Apple bloquea la IP de este servidor de GitHub, terminar la vuelta para que la cadena se relance en otro servidor (otra IP).
// Solo entre 90 s y 30 min de fallo seguido; mas alla se queda y sigue reintentando.
if (anyBlind && state.blindSince) {
  const blindFor = Date.now() - state.blindSince;
  if (blindFor >= 90 * 1000 && blindFor < 30 * 60 * 1000) { console.log('Apple bloquea esta IP: cierro la vuelta para relanzar en otro servidor'); process.exit(75); }
}
