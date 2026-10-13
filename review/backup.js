// Private backup: a git bundle (full history) written outside the project folder. Never upload it to a public location.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '..', 'DNNC STEPS BACKUPS (private)');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const file = path.join(dir, `dnnc-steps-${stamp}.bundle`);
execFileSync('git', ['bundle', 'create', file, '--all'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
execFileSync('git', ['bundle', 'verify', file], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
console.log('Backup written:', file);
