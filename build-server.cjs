// Build server: bundle src/modern-server.js with esbuild
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ENTRY = path.join(ROOT, 'src', 'modern-server.js');
const OUT_DIR = path.join(ROOT, 'dist-server');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const VERSION = 's' + Date.now().toString(36);

esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: false,
  format: 'cjs',
  platform: 'node',
  target: ['node20'],
  outfile: path.join(OUT_DIR, 'server.' + VERSION + '.js'),
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  packages: 'external'
}).then(() => {
  fs.readdirSync(OUT_DIR).filter(f => f.startsWith('server.') && !f.includes(VERSION))
    .forEach(f => fs.rmSync(path.join(OUT_DIR, f), { force: true }));
  console.log('BUNDLED: dist-server/server.' + VERSION + '.js');
  console.log('VERSION_TOKEN=' + VERSION);
}).catch(e => { console.error('BUILD FAIL', e.message); process.exit(1); });
