#!/usr/bin/env node
// devops-master CLI: detect stack, ask deploy questions, write deploy files + devops/*.md
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { detectStack } from '../lib/detect.mjs';
import { QUESTIONS, DEFAULTS } from '../lib/questions.mjs';
import { render } from '../lib/render.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const projectDir = path.resolve(opt('--project', process.cwd()));

function usage() {
  console.log(`devops-master
  detect   [--project DIR]                  print detected tech stack (JSON)
  questions                                 print the 10 deploy questions (JSON)
  init     [--project DIR] [--answers F|-]  ask questions (or read answers JSON) and write files
           [--dry-run] [--force]
Answers JSON: { "target":"dokploy", "method":"build-on-host", "domain":"none", ... }
Missing keys use the first choice / default. Files are not overwritten without --force.`);
}

async function ask(stack) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers = {};
  console.log(`Stack: ${stack.language} / ${stack.framework}. Answer each question (Enter = default).\n`);
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    console.log(`${i + 1}. ${q.ask}`);
    if (q.choices) q.choices.forEach(([, label], j) => console.log(`   ${j + 1}) ${label}`));
    const raw = (await rl.question(`   > `)).trim();
    if (q.choices) {
      const idx = Number(raw || 1) - 1;
      answers[q.key] = q.choices[idx] ? q.choices[idx][0] : q.choices[0][0];
    } else {
      answers[q.key] = raw || q.default;
    }
    if (q.key === 'port' && !answers.port) answers.port = String(stack.port || 3000);
  }
  rl.close();
  return answers;
}

function resolveAnswers(raw) {
  const a = { ...DEFAULTS, ...raw };
  if (!a.port) a.port = null;
  return a;
}

function validate(a) {
  const errs = [];
  for (const q of QUESTIONS) {
    if (q.choices && !q.choices.some(([k]) => k === a[q.key])) errs.push(`${q.key}: "${a[q.key]}" is not one of ${q.choices.map(c => c[0]).join(', ')}`);
  }
  if (a.port && !/^\d{2,5}$/.test(String(a.port))) errs.push(`port: "${a.port}" is not a number`);
  if (a.domain && a.domain !== 'none' && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(a.domain)) errs.push(`domain: "${a.domain}" looks invalid`);
  return errs;
}

async function main() {
  if (!cmd || cmd === '-h' || cmd === '--help') return usage();

  if (cmd === 'detect') {
    console.log(JSON.stringify(detectStack(projectDir), null, 2));
    return;
  }
  if (cmd === 'questions') {
    console.log(JSON.stringify(QUESTIONS.map(({ key, ask, choices, default: d }) => ({ key, ask, choices: choices?.map(c => c[0]), default: d ?? null })), null, 2));
    return;
  }
  if (cmd === 'init') {
    const stack = detectStack(projectDir);
    let answers;
    const src = opt('--answers', null);
    if (src) {
      const text = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
      answers = resolveAnswers(JSON.parse(text));
    } else {
      if (!process.stdin.isTTY) { console.error('No TTY: pass --answers <file|-> for non-interactive use.'); process.exit(2); }
      answers = resolveAnswers(await ask(stack));
    }
    const errs = validate(answers);
    if (errs.length) { console.error('Invalid answers:\n- ' + errs.join('\n- ')); process.exit(2); }

    const files = render(stack, answers);
    const conflicts = [...files.keys()].filter(f => fs.existsSync(path.join(projectDir, f)));
    if (conflicts.length && !flag('--force') && !flag('--dry-run')) {
      console.error('Refusing to overwrite (use --force):\n- ' + conflicts.join('\n- ')); process.exit(3);
    }
    for (const [rel, content] of files) {
      const dest = path.join(projectDir, rel);
      if (flag('--dry-run')) { console.log('would write ' + rel); continue; }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content, { mode: rel.endsWith('.sh') ? 0o755 : 0o644 });
      console.log('wrote ' + rel);
    }
    return;
  }
  usage(); process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
