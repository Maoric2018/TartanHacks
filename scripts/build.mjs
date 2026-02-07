import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = '/Users/eric/Desktop/th';
const srcPath = path.join(root, 'neon-phases.html');
const outPath = path.join(root, 'dist', 'neon-phases.min.html');

const html = fs.readFileSync(srcPath, 'utf8');

function stripDevBlocks(doc) {
  return doc
    .replace(/<!--DEBUG_BOSS_MENU_START-->[\s\S]*?<!--DEBUG_BOSS_MENU_END-->/g, '')
    .replace(/\/\*DEBUG_BOSS_MENU_START\*\/[\s\S]*?\/\*DEBUG_BOSS_MENU_END\*\//g, '');
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function minifyJs(js) {
  let out = js;
  out = out.replace(/^\s*\/\/.*$/gm, '');
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/\n{2,}/g, '\n');
  out = out.replace(/[ \t]{2,}/g, ' ');
  return out.trim();
}

function minifyJsWithBun(js) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-build-'));
  const inPath = path.join(tmpDir, 'in.js');
  const outBuildPath = path.join(tmpDir, 'out-build.js');
  const outTranspilePath = path.join(tmpDir, 'out-transpile.js');
  fs.writeFileSync(inPath, js);
  try {
    // Try Bun build minifier first (typically smaller output).
    execFileSync('bun', [
      'build',
      inPath,
      '--minify',
      '--target=browser',
      '--format=iife',
      '--outfile',
      outBuildPath
    ], { stdio: 'pipe' });
    if (fs.existsSync(outBuildPath)) {
      const out = fs.readFileSync(outBuildPath, 'utf8').trim();
      if (out) return out;
    }
    // Fallback to Bun Transpiler API.
    execFileSync('bun', [
      '-e',
      "const [i,o]=process.argv.slice(1);const s=await Bun.file(i).text();const t=new Bun.Transpiler({loader:'js',minifyWhitespace:true,minifyIdentifiers:true,minifySyntax:true});await Bun.write(o,t.transformSync(s));",
      '--',
      inPath,
      outTranspilePath
    ], { stdio: 'pipe' });
    if (fs.existsSync(outTranspilePath)) {
      const out = fs.readFileSync(outTranspilePath, 'utf8').trim();
      if (out) return out;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return minifyJs(js);
}

function escapeScriptClose(js) {
  return js.replace(/<\/script>/gi, '<\\/script>');
}

const INTERNAL_PROP_KEYS = [
  'moveParams', 'spawnTime', 'bossEntity', 'waveState', 'bannerTimer', 'killFlash',
  'swordIFrame', 'pulseSpeed', 'difficulty', 'shieldNodes', 'bossAI', 'isBoss',
  'firePattern', 'fireTimer', 'fireCD', 'maxLife', 'maxHp', 'hitFlash', 'moveType',
  'spiralAngle', 'waveBannerTimer', 'waveBannerText', 'waveBannerSub', 'waveModTimer',
  'waveModText', 'levelUpQueue', 'xpToNext', 'totalKills', '_bossModQueue',
  '_bossSpawnPending', 'gameOverFade', '_bossLaserHitCD', '_dashInvuln', '_dashTele',
  '_warpTele', '_portals', '_drones', '_ghosts', '_upgradeTransition', '_staticFields',
  '_shurikens', '_rocketRings', '_posHistory', '_checkT', 'waveKills', 'waveQuota',
  'bannerText', 'bannerColor', 'pulseTimer', 'moveSpeed', 'dodgeChance', 'regenTimer',
  'regenInterval', 'shieldRecharge', 'cdReduction', 'critChance', 'critMult', 'passives',
  'fireParams', 'bossWindX', 'bossWindY', 'chargeTime', 'maxCharge', 'weaponId',
  'passiveId', 'lungeDir', 'lungeTimer', 'lungeProg', 'lungeStartX', 'lungeStartY',
  'lungeDist', 'warpTimer', 'summonTimer', 'shieldUp', 'bossFxPower', 'bossFxFreq',
  'bossFxPhase', 'bossFxSpin', 'laserSpin', 'attackIdx', 'linkBeam', 'linkTimer',
  '_twinIdx', '_twinPartner', '_aftershockEnd', '_swordAfterT', '_swordHitT',
  '_arcTimer', '_dashStrike', '_targets', '_zigzags', '_homingDelay', 'bossFx',
  'shieldHP', 'wavePhaseIdx', 'freezeTimer', 'reverseTimer', 'reverseCD', 'reflect',
  'gravity', 'windX', 'windY', 'reversed', 'frozen'
];
const MANGLE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

function countWord(js, word) {
  const m = js.match(new RegExp(`\\b${word}\\b`, 'g'));
  return m ? m.length : 0;
}

function shortToken(i) {
  let n = i;
  let out = '';
  do {
    out = MANGLE_CHARS[n % MANGLE_CHARS.length] + out;
    n = Math.floor(n / MANGLE_CHARS.length) - 1;
  } while (n >= 0);
  return `$${out}`;
}

function buildPropMap(js) {
  const scored = [];
  for (const key of INTERNAL_PROP_KEYS) {
    const count = countWord(js, key);
    if (count > 0) scored.push({ key, count });
  }
  scored.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const map = [];
  for (let i = 0; i < scored.length; i++) map.push([scored[i].key, shortToken(i)]);
  return map;
}

function mangleInternalProps(js) {
  const pairs = buildPropMap(js);
  let out = js;
  for (const [from, to] of pairs) {
    out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  return out;
}

function aliasCanvasContextCalls(js) {
  const m = js.match(/([A-Za-z_$][A-Za-z0-9_$]*)=[A-Za-z_$][A-Za-z0-9_$]*\.getContext\("2d"\)/);
  if (!m) return js;
  const c = m[1];
  const aliasPairs = [
    ['beginPath', 'b'],
    ['moveTo', 'm'],
    ['lineTo', 'l'],
    ['closePath', 'p'],
    ['stroke', 's'],
    ['fill', 'f'],
    ['save', 'v'],
    ['restore', 'r'],
    ['arc', 'a'],
    ['fillRect', 'x'],
    ['strokeRect', 'y'],
    ['translate', 't'],
    ['rotate', 'o'],
    ['quadraticCurveTo', 'q'],
    ['createLinearGradient', 'g'],
    ['setLineDash', 'd'],
    ['fillText', 'u'],
    ['measureText', 'w']
  ];
  const aliases = aliasPairs.map(([from, to]) => `${c}.${to}=${c}.${from}`).join(',');
  let out = js.replace(
    new RegExp(`${c}=([A-Za-z_$][A-Za-z0-9_$]*\\.getContext\\("2d"\\))`),
    (_, rhs) => `${c}=(${rhs},${aliases},${c})`
  );
  for (const [from, to] of aliasPairs) {
    out = out.replace(new RegExp(`\\b${c}\\.${from}\\(`, 'g'), `${c}.${to}(`);
  }
  return out;
}

function hoistCommonStrings(js) {
  const pairs = [
    ['"center"', '_C'],
    ['"middle"', '_M'],
    ['"round"', '_R'],
    ['"monospace"', '_N']
  ];
  const decl = [];
  let out = js;
  for (const [lit, id] of pairs) {
    const count = (out.match(new RegExp(lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (count > 2) {
      out = out.replace(new RegExp(lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), id);
      decl.push(`${id}=${lit}`);
    }
  }
  if (!decl.length) return out;
  return out.replace(/\(\(\)=>\{/, `(()=>{var ${decl.join(',')};`);
}

function tightenJs(js) {
  return js
    .replace(/;{2,}/g, ';')
    .replace(/,\s*,/g, ',')
    .replace(/\(\s*\)/g, '()');
}

function minifyHtmlDoc(doc) {
  return doc
    .replace(/>\s+</g, '><')
    .replace(/\n+/g, '\n')
    .trim();
}

const styleRe = /<style>([\s\S]*?)<\/style>/i;
const scriptRe = /<script>([\s\S]*?)<\/script>/i;

let built = stripDevBlocks(html);
const styleMatch = built.match(styleRe);
if (styleMatch) {
  const minCss = minifyCss(styleMatch[1]);
  built = built.replace(styleRe, () => `<style>${minCss}</style>`);
}
const scriptMatch = built.match(scriptRe);
if (scriptMatch) {
  const minJsRaw = minifyJsWithBun(scriptMatch[1]);
  const minJs = escapeScriptClose(
    tightenJs(
      mangleInternalProps(minJsRaw)
    )
  );
  built = built.replace(scriptRe, () => `<script>${minJs}</script>`);
}
built = minifyHtmlDoc(built);

fs.writeFileSync(outPath, built);
console.log(`Built ${outPath}`);
