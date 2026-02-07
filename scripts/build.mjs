import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = '/Users/eric/Desktop/th';
const srcPath = path.join(root, 'neon-phases.html');
const outPath = path.join(root, 'dist', 'neon-phases.min.html');

const html = fs.readFileSync(srcPath, 'utf8');

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

function minifyHtmlDoc(doc) {
  return doc
    .replace(/>\s+</g, '><')
    .replace(/\n+/g, '\n')
    .trim();
}

const styleRe = /<style>([\s\S]*?)<\/style>/i;
const scriptRe = /<script>([\s\S]*?)<\/script>/i;

let built = html;
const styleMatch = built.match(styleRe);
if (styleMatch) built = built.replace(styleRe, `<style>${minifyCss(styleMatch[1])}</style>`);
const scriptMatch = built.match(scriptRe);
if (scriptMatch) {
  built = built.replace(scriptRe, `<script>${escapeScriptClose(minifyJsWithBun(scriptMatch[1]))}</script>`);
}
built = minifyHtmlDoc(built);

fs.writeFileSync(outPath, built);
console.log(`Built ${outPath}`);
