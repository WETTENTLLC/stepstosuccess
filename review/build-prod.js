// Cross-platform production build: BUILD_TARGET=production node build.js  ->  dist/
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
const r = spawnSync(process.execPath, ['build.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, BUILD_TARGET: 'production' } });
process.exit(r.status ?? 1);
