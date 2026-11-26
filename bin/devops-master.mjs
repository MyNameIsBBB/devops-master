#!/usr/bin/env node
// devops-master CLI: detect stack, ask deploy questions, write deploy files + devops/*.md, search DevOps KB.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { detectStack } from '../lib/detect.mjs';
import { QUESTIONS, DEFAULTS } from '../lib/questions.mjs';
import { render } from '../lib/render.mjs';
import { ask as kbAsk } from '../lib/kb.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const projectDir = path.resolve(opt('--project', process.cwd()));

function usage() {
  console.log(`devops-master
  detect   [--project DIR]                  print detected stack and build strategy (JSON)
  questions                                 print the 10 deploy questions (JSON)
  init     [--project DIR] [--answers F|-]  write deploy files (answers from JSON or prompts)
           [--start "CMD"] [--dry-run] [--force]
  ask      "question"                       search the DevOps knowledge base (kb/*.md)
Answers JSON keys: see "questions". Missing keys use the default (first choice).
Never overwrites an existing file unless --force. Never touches an existing Dockerfile.`);
}

async function promptAnswers(stack) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers = {};
  console.log(`Stack: ${stack.language} / ${stack.framework} (build: ${stack.strategy}). Enter = default.\n`);
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    console.log(`${i + 1}. ${q.ask}`);
    if (q.choices) q.choices.forEach(([, label], j) => console.log(`   ${j + 1}) ${label}`));
    const raw = (await rl.question('   > ')).trim();
    if (q.choices) answers[q.key] = q.choices[Number(raw || 1) - 1]?.[0] ?? q.choices[0][0];
    else answers[q.key] = raw || q.default;
  }
  rl.close();
  return answers;
}

function validate(a) {
  const errs = [];
  for (const q of QUESTIONS) {
    if (q.choices && !q.choices.some(([k]) => k === a[q.key])) errs.push(`${q.key}: "${a[q.key]}" is not one of ${q.choices.map(c => c[0]).join(', ')}`);
  }
  if (a.port && !/^\d{2,5}$/.test(String(a.port))) errs.push(`port: "${a.port}" is not a number`);
  if (a.domain && a.domain !== 'none' && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(a.domain)) errs.push(`domain: "${a.domain}" looks invalid`);
  if (a.health && a.health !== 'none' && !a.health.startsWith('/')) errs.push(`health: "${a.health}" must start with /`);
  return errs;
}

async function main() {
  if (!cmd || cmd === '-h' || cmd === '--help') return usage();

  if (cmd === 'detect') {
    console.log(JSON.stringify(detectStack(projectDir), null, 2));
    return;
  }
  if (cmd === 'questions') {
    console.log(JSON.stringify(QUESTIONS.map(({ key, ask, choices, default: d }) =>
      ({ key, ask, choices: choices?.map(c => c[0]) ?? 'free text', default: d ?? choices?.[0][0] ?? null })), null, 2));
    return;
  }
  if (cmd === 'ask') {
    const q = args.slice(1).join(' ').trim();
    if (!q) { console.error('usage: devops-master ask "question"'); process.exit(1); }
    const hits = kbAsk(q).slice(0, 2);
    if (!hits.length) { console.log('NO_MATCH: no knowledge base entry matched. Answer from general knowledge and say so.'); return; }
    for (const h of hits) console.log(`## ${h.title} (kb/${h.file})\n${h.body.replace(/^# .*\n/m, '').replace(/^Tags:.*\n/m, '').trim()}\n`);
    return;
  }
  if (cmd === 'init') {
    const stack = detectStack(projectDir);
    if (opt('--start')) stack.startCmd = opt('--start');

    let answers;
    const src = opt('--answers');
    if (src) {
      answers = JSON.parse(src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8'));
    } else {
      if (!process.stdin.isTTY) { console.error('No TTY: pass --answers <file|-> for non-interactive use.'); process.exit(2); }
      answers = await promptAnswers(stack);
    }
    answers = { ...DEFAULTS, ...answers };
    if (!answers.port) answers.port = String(stack.port || 3000);

    const errs = validate(answers);
    if (errs.length) { console.error('Invalid answers:\n- ' + errs.join('\n- ')); process.exit(2); }

    const files = render(stack, answers);
    if (stack.strategy === 'existing-dockerfile') files.delete('Dockerfile');
    const existing = [...files.keys()].filter(f => fs.existsSync(path.join(projectDir, f)));
    if (existing.length && !flag('--force') && !flag('--dry-run')) {
      console.error('Refusing to overwrite (use --force):\n- ' + existing.join('\n- ')); process.exit(3);
    }
    for (const [rel, content] of files) {
      if (flag('--dry-run')) { console.log('would write ' + rel); continue; }
      const dest = path.join(projectDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content, { mode: rel.endsWith('.sh') ? 0o755 : 0o644 });
      console.log('wrote ' + rel);
    }
    return;
  }
  usage(); process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
