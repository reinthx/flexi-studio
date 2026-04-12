const fs = require('fs');
const pako = require('pako');

// Read original
const raw = fs.readFileSync('./presets/default.flexi', 'utf8');
const b64 = raw.slice(7);
const buf = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const original = new TextDecoder().decode(pako.inflate(buf));
const data = JSON.parse(original);

// Simulate cleanProfile
const cleaned = JSON.parse(JSON.stringify(data[0].profile));

const DEAD_LABEL_FIELDS = ['leftTemplate', 'rightTemplate', 'leftOffsetX', 'leftOffsetY', 'rightOffsetX', 'rightOffsetY'];
if (cleaned.default?.label) {
  for (const field of DEAD_LABEL_FIELDS) {
    delete cleaned.default.label[field];
  }
}

// Strip byJobEnabled/RoleEnabled when true
if (cleaned.overrides?.byJobEnabled) {
  for (const [job, enabled] of Object.entries(cleaned.overrides.byJobEnabled)) {
    if (enabled === true) delete cleaned.overrides.byJobEnabled[job];
  }
}
if (cleaned.overrides?.byRoleEnabled) {
  for (const [role, enabled] of Object.entries(cleaned.overrides.byRoleEnabled)) {
    if (enabled === true) delete cleaned.overrides.byRoleEnabled[role];
  }
}

const cleanedJson = JSON.stringify([{ name: data[0].name, profile: cleaned }]);

console.log('Original JSON:', original.length, 'chars');
console.log('Cleaned JSON:', cleanedJson.length, 'chars');
console.log('Reduction:', original.length - cleanedJson.length, 'chars', '(' + Math.round((original.length - cleanedJson.length) / original.length * 100) + '%)');
console.log('');

const origCompressed = pako.deflate(Buffer.from(original));
const cleanedCompressed = pako.deflate(Buffer.from(cleanedJson));
console.log('Original compressed:', origCompressed.length, 'bytes');
console.log('Cleaned compressed:', cleanedCompressed.length, 'bytes');
console.log('Reduction:', origCompressed.length - cleanedCompressed.length, 'bytes', '(' + Math.round((origCompressed.length - cleanedCompressed.length) / origCompressed.length * 100) + '%)');