// Local preview build that includes the private Zelle QR (never use this output for online hosting).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
const r = spawnSync(process.execPath, ['build.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, BUILD_TARGET: 'production', INCLUDE_ZELLE_QR: '1' } });
process.exit(r.status ?? 1);
