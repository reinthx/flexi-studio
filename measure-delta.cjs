const fs = require('fs');
const pako = require('pako');

const raw = fs.readFileSync('./presets/default.flexi', 'utf8');
const b64 = raw.slice(7);
const buf = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const json = new TextDecoder().decode(pako.inflate(buf));
const data = JSON.parse(json);

const byJob = data[0].profile.overrides?.byJob;
const byRole = data[0].profile.overrides?.byRole;

console.log('Current byJob size:', byJob ? JSON.stringify(byJob).length : 0, 'chars');
console.log('Current byRole size:', byRole ? JSON.stringify(byRole).length : 0, 'chars');
console.log('');

const DEFAULT_JOB_COLORS = {
  PLD: '#A6D100', WAR: '#D30000', DRK: '#B080D0', GNB: '#F0C040',
  WHM: '#B5D0A0', SCH: '#E080B0', AST: '#F0E080', SGE: '#80C0F0',
  MNK: '#E08040', DRG: '#5040A0', NIN: '#A04080', SAM: '#E04040', RPR: '#8040A0', VPR: '#40A040',
  BRD: '#A0C040', MCH: '#6080C0', DNC: '#E060A0',
  BLM: '#8060C0', SMN: '#40A040', RDM: '#E04040', PCT: '#F0A040', BLU: '#40A0C0',
};

const DEFAULT_ROLE_COLORS = {
  tank: '#4a90d9', healer: '#52b788', melee: '#e63946', ranged: '#f4a261', caster: '#9b5de5',
};

// Delta encode - only non-default colors
const byJobCompact = {};
const byRoleCompact = {};

for (const [job, config] of Object.entries(byJob || {})) {
  const color = config?.fill?.color;
  if (color !== DEFAULT_JOB_COLORS[job]) {
    byJobCompact[job] = config;
  }
}

for (const [role, config] of Object.entries(byRole || {})) {
  const color = config?.fill?.color;
  if (color !== DEFAULT_ROLE_COLORS[role]) {
    byRoleCompact[role] = config;
  }
}

console.log('After delta compression:');
console.log('byJob size:', Object.keys(byJobCompact).length > 0 ? JSON.stringify(byJobCompact).length : 0, 'chars');
console.log('byRole size:', Object.keys(byRoleCompact).length > 0 ? JSON.stringify(byRoleCompact).length : 0, 'chars');
console.log('');

console.log('Potential savings:');
console.log('byJob:', (byJob ? JSON.stringify(byJob).length : 0) - (Object.keys(byJobCompact).length > 0 ? JSON.stringify(byJobCompact).length : 0), 'chars');
console.log('byRole:', (byRole ? JSON.stringify(byRole).length : 0) - (Object.keys(byRoleCompact).length > 0 ? JSON.stringify(byRoleCompact).length : 0), 'chars');