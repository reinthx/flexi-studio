const fs = require('fs');
const pako = require('pako');

const raw = fs.readFileSync('./presets/default.flexi', 'utf8');
const b64 = raw.slice(7);
const buf = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const json = new TextDecoder().decode(pako.inflate(buf));
const data = JSON.parse(json);

const overrides = data[0].profile.overrides;
console.log('overrides JSON size:', JSON.stringify(overrides).length, 'chars');
console.log('');
console.log('byJobEnabled:', overrides.byJobEnabled ? Object.keys(overrides.byJobEnabled).length + ' entries' : 'missing');
console.log('byRoleEnabled:', overrides.byRoleEnabled ? Object.keys(overrides.byRoleEnabled).length + ' entries' : 'missing');
console.log('byJob:', overrides.byJob ? Object.keys(overrides.byJob).length + ' entries' : 'missing');
console.log('byRole:', overrides.byRole ? Object.keys(overrides.byRole).length + ' entries' : 'missing');
console.log('self:', overrides.self ? 'present' : 'missing');

console.log('');
console.log('byJob:');
console.log(JSON.stringify(overrides.byJob, null, 2).substring(0, 500));
console.log('...');
console.log('Total byJob size:', JSON.stringify(overrides.byJob).length);