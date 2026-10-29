// Prueba manual de los dos canales de aviso: ntfy y Pushover (critico). Se dispara solo desde la pestaña Actions.
const { PUSHOVER_TOKEN: token, PUSHOVER_USER: user, NTFY_TOPIC: topic } = process.env;
let failed = false;

// 1) ntfy
if (!topic) { console.error('Falta el secreto NTFY_TOPIC'); failed = true; }
else {
  const n = await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    body: 'Si ves esto en la app ntfy, ese canal funciona.',
    headers: { Title: 'PRUEBA Monitor Duo (ntfy)', Priority: 'urgent', Tags: 'iphone,white_check_mark' },
  });
  console.log('ntfy HTTP', n.status);
  if (!n.ok) failed = true;
}

// 2) Pushover
if (!token || !user) { console.error('Faltan los secretos PUSHOVER_TOKEN y/o PUSHOVER_USER'); process.exit(1); }
const body = new URLSearchParams({
  token, user, priority: '2', retry: '30', expire: '120', sound: 'siren',
  title: 'PRUEBA Monitor Duo', message: 'Si esto suena con el telefono en silencio, las alertas criticas funcionan. Confirma (Acknowledge) para detener la repeticion.',
});
const r = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body });
const t = await r.text();
console.log('pushover HTTP', r.status, t.replace(/"receipt":"[^"]*"/, '"receipt":"..."'));
if (!r.ok || failed) process.exit(1);
