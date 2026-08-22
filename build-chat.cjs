// Build pipeline for the classic chat client.
// SOURCE OF TRUTH = client/js/main-parts/ (ordered, numbered files).
// This script:
//   1. concatenates parts in filename order (byte-exact original semantics)
//   2. runs esbuild (minify+bundle) into client/dist/chat-main.<ver>.js
//   3. prints the VERSION_TOKEN to reference in landing.js / index.html
//
// Deploy after build:
//   bonto files upload drr-chat /client/dist/<bundle> client/dist/<bundle>
//   bump landing.js ?v= and its mainScript.src, then upload landing.js + index.html
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const PARTS_DIR = path.join(__dirname, 'client', 'js', 'main-parts');
const OUT_DIR = path.join(__dirname, 'client', 'dist');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const partFiles = fs.readdirSync(PARTS_DIR)
  .filter(f => /^\d{2}-.*\.js$/.test(f))
  .sort();

if (!partFiles.length) { console.error('No parts found in', PARTS_DIR); process.exit(1); }

const assembled = partFiles.map(f => fs.readFileSync(path.join(PARTS_DIR, f), 'utf8')).join('');
const TMP = path.join(__dirname, 'client', 'js', '.main-assembled.js');
fs.writeFileSync(TMP, assembled);

const VERSION = 'b' + Date.now().toString(36);

esbuild.build({
  entryPoints: [TMP],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['chrome90', 'safari14', 'firefox90'],
  outfile: 'client/dist/chat-main.' + VERSION + '.js',
  metafile: false,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.js': 'js' },
  external: ['/js/modules/GamesManager.js?v=39']
}).then(() => {
  fs.unlinkSync(TMP);
  // prune old bundles
  fs.readdirSync(OUT_DIR).filter(f => f.startsWith('chat-main.') && !f.includes(VERSION))
    .forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));
  console.log('parts:', partFiles.length, '| BUNDLED: /dist/chat-main.' + VERSION + '.js');
  console.log('VERSION_TOKEN=' + VERSION);
}).catch(e => { console.error('BUILD FAIL', e.message); try { fs.unlinkSync(TMP); } catch (_) {} process.exit(1); });
