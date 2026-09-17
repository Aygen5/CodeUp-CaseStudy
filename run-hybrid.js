/**
 * Unified Hybrid Runner for CodeUp Supplier Management
 * Starts both:
 * 1. CAP Backend (HANA + XSUAA) on port 4004 via `cds run --profile hybrid`
 * 2. SAP Approuter on port 5000 via `node approuter.js`
 */
const { spawn, exec } = require('child_process');

console.log('================================================================');
console.log('CodeUp Supplier Management — Hibrit Geliştirme Ortamı Başlatılıyor');
console.log('Hedef Veritabanı : SAP HANA (Kural 2)');
console.log('Kimlik Doğrulama : SAP BTP XSUAA (Hybrid)');
console.log('Fiori Launchpad  : http://localhost:5000');
console.log('CAP Backend      : http://localhost:4004');
console.log('Durdurmak için   : CTRL + C');
console.log('================================================================\n');

const isWin = process.platform === 'win32';

function killProcessTree(pid) {
  if (isWin) {
    exec(`taskkill /pid ${pid} /t /f`, () => {});
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (e) {
      try { process.kill(pid, 'SIGTERM'); } catch (e2) {}
    }
  }
}

// 1. Start CAP Backend with hybrid profile
const capCmd = isWin ? 'npx.cmd' : 'npx';
const capProcess = spawn(capCmd, ['cds', 'run', '--profile', 'hybrid'], {
  cwd: __dirname,
  shell: isWin,
  env: { ...process.env }
});

capProcess.stdout.on('data', (data) => {
  process.stdout.write(`\x1b[36m[CAP]\x1b[0m ${data}`);
});

capProcess.stderr.on('data', (data) => {
  process.stderr.write(`\x1b[33m[CAP]\x1b[0m ${data}`);
});

capProcess.on('error', (err) => {
  console.error('\x1b[31m[CAP Hatası]\x1b[0m', err.message);
});

// 2. Start Approuter
const approuterProcess = spawn('node', ['approuter.js'], {
  cwd: __dirname,
  shell: isWin,
  env: { ...process.env, PORT: '5000' }
});

approuterProcess.stdout.on('data', (data) => {
  process.stdout.write(`\x1b[32m[Approuter]\x1b[0m ${data}`);
});

approuterProcess.stderr.on('data', (data) => {
  process.stderr.write(`\x1b[35m[Approuter]\x1b[0m ${data}`);
});

approuterProcess.on('error', (err) => {
  console.error('\x1b[31m[Approuter Hatası]\x1b[0m', err.message);
});

let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n\nServisler kapatılıyor...');
  if (capProcess && capProcess.pid) killProcessTree(capProcess.pid);
  if (approuterProcess && approuterProcess.pid) killProcessTree(approuterProcess.pid);
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);
