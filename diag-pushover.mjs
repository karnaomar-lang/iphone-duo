const { PUSHOVER_TOKEN: token, PUSHOVER_USER: user } = process.env;
const r = await fetch('https://api.pushover.net/1/users/validate.json', { method: 'POST', body: new URLSearchParams({ token, user }) });
const j = await r.json();
console.log('validate HTTP', r.status, 'status', j.status, 'devices', Array.isArray(j.devices) ? j.devices.length : j.devices, 'group', j.group, 'licenses', JSON.stringify(j.licenses), 'errors', JSON.stringify(j.errors));
