// Prueba manual del canal critico (Pushover). Se dispara solo desde la pestaña Actions.
const { PUSHOVER_TOKEN: token, PUSHOVER_USER: user } = process.env;
if (!token || !user) { console.error('Faltan los secretos PUSHOVER_TOKEN y/o PUSHOVER_USER'); process.exit(1); }
const body = new URLSearchParams({
  token, user, priority: '2', retry: '30', expire: '120', sound: 'siren',
  title: 'PRUEBA Monitor Duo', message: 'Si esto suena con el telefono en silencio, las alertas criticas funcionan. Confirma (Acknowledge) para detener la repeticion.',
});
const r = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body });
const t = await r.text();
console.log('HTTP', r.status, t.replace(/"receipt":"[^"]*"/, '"receipt":"..."'));
if (!r.ok) process.exit(1);
