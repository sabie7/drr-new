// Build pipeline for the SERVER (src/server-parts/* → dist-server/server.js)
// Parts are documentation-headed ordered fragments; esbuild bundles them
// (CommonJS, node platform, all node_modules external).
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const PARTS_DIR = path.join(__dirname, 'src');
const OUT_DIR = path.join(__dirname, 'dist-server');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const partFiles = fs.readdirSync(PARTS_DIR).filter(f => f === 'modern-server.js');
if (!partFiles.includes('modern-server.js')) { console.error('modern-server.js not found in src/'); process.exit(1); }

const assembled = fs.readFileSync(path.join(PARTS_DIR, 'modern-server.js'), 'utf8');
const TMP = path.join(__dirname, 'src', '.server-assembled.cjs');
fs.writeFileSync(TMP, assembled);

const VERSION = 's' + Date.now().toString(36);

esbuild.build({
  entryPoints: [TMP],
  bundle: true,
  minify: false,
  format: 'cjs',
  platform: 'node',
  target: ['node20'],
  outfile: 'dist-server/server.' + VERSION + '.js',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  packages: 'external'
}).then(() => {
  fs.unlinkSync(TMP);
  fs.readdirSync(OUT_DIR).filter(f => f.startsWith('server.') && !f.includes(VERSION))
    .forEach(f => fs.rmSync(path.join(OUT_DIR, f), { force: true }));
  console.log('parts:', partFiles.length, '| BUNDLED: dist-server/server.' + VERSION + '.js (+map)');
  console.log('VERSION_TOKEN=' + VERSION);
}).catch(e => { console.error('BUILD FAIL', e.message); try { fs.unlinkSync(TMP); } catch (_) {} process.exit(1); });
