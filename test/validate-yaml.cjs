// Validates generated YAML with a real parser (js-yaml). Run from a dir where js-yaml is installed
// (set NODE_PATH to the install location, e.g. /tmp/yv/node_modules).
const fs = require('fs');
const yaml = require('js-yaml');
const [file, kind] = process.argv.slice(2);
const doc = yaml.load(fs.readFileSync(file, 'utf8'));
const fail = (m) => { console.error('YAML FAIL ' + file + ': ' + m); process.exit(1); };
if (kind === 'compose') {
  if (!doc.services || !doc.services.app) fail('no services.app');
  for (const [n, s] of Object.entries(doc.services)) {
    if (!s.image && !s.build) fail(n + ' has neither image nor build');
  }
  // every named volume used must be declared
  const declared = Object.keys(doc.volumes || {});
  for (const s of Object.values(doc.services)) for (const v of s.volumes || []) {
    const name = String(v).split(':')[0];
    if (!name.startsWith('.') && !name.startsWith('/') && !declared.includes(name)) fail('undeclared volume ' + name);
  }
} else if (kind === 'workflow') {
  if (!doc.jobs || !Object.keys(doc.jobs).length) fail('no jobs');
  if (!doc.on) fail('no trigger "on"');
}
console.log('yaml ok: ' + file);
