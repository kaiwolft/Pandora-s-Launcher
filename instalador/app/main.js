// Instalador de Pandora's Tower — Dionixu's Launcher (Windows y Linux)
// No incluye el juego: lo construye a partir de las copias originales del usuario (USA + Japón) y las verifica.
'use strict';
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const voces = require('./voces');

const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const ROOT = path.dirname(process.execPath);            // Windows: carpeta del instalador · Linux: $APPDIR (AppImage)
const UI = path.join(__dirname, 'ui');
const RECIPE = path.join(__dirname, 'receta_voces.json');
// payload: junto al ejecutable, en la carpeta superior o, con el AppImage, en la carpeta del AppImage
const PAYLOADS = [path.join(ROOT, 'payload'), path.resolve(ROOT, '..', 'payload'),
  ...(process.env.APPIMAGE ? [path.join(path.dirname(process.env.APPIMAGE), 'payload')] : [])].filter((p, i, a) => a.indexOf(p) === i);
const payload = (...rel) => {
  for (const p of PAYLOADS) { const f = path.join(p, ...rel); if (fs.existsSync(f)) return f; }
  return path.join(PAYLOADS[0], ...rel);
};

// Linux: que Chromium elija X11 o Wayland (forzar X11 bajo Wayland deja la ventana invisible)
if (IS_LINUX) app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
protocol.registerSchemesAsPrivileged([{ scheme: 'pt', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.setPath('userData', path.join(os.tmpdir(), 'pt-installer'));
app.setName("Dionixu's Launcher");

let win = null;
const send = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send('msg', JSON.stringify({ type, data })); };
const exists = (f) => { try { return fs.existsSync(f); } catch (e) { return false; } };
const logLines = [];
const log = (s) => { logLines.push(new Date().toISOString() + '  ' + s); send('log', s); };

// ---------------------------------------------------------------- datos de las copias originales
const R = JSON.parse(fs.readFileSync(RECIPE, 'utf8'));
const GAMES = { us: { id: R.game, md5: R.verify.US, bytes: R.sizes.US }, jp: { id: R.jp, md5: R.verify.JP, bytes: R.sizes.JP } };

// ---------------------------------------------------------------- utilidades
const md5 = (file) => new Promise((ok, ko) => {
  const h = crypto.createHash('md5'); const s = fs.createReadStream(file);
  s.on('data', (d) => h.update(d)); s.on('end', () => ok(h.digest('hex').toUpperCase())); s.on('error', ko);
});
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out;
}
function dirBytes(dir) {
  let n = 0;
  const go = (d) => { let l; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of l) { const p = path.join(d, e.name); if (e.isDirectory()) go(p); else { try { n += fs.statSync(p).size; } catch (x) {} } } };
  go(dir);
  return n;
}
function copyDir(src, dst, filter) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (filter && !filter(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, filter);
    else if (e.isSymbolicLink()) { try { fs.symlinkSync(fs.readlinkSync(s), d); } catch (x) {} }
    else fs.copyFileSync(s, d);
  }
}
function linkOrCopy(src, dst) {
  try { fs.linkSync(src, dst); return true; } catch (e) { fs.copyFileSync(src, dst); return false; }
}
function freeBytes(dir) {
  let d = path.resolve(dir);
  while (!exists(d)) { const up = path.dirname(d); if (up === d) break; d = up; }
  try { const s = fs.statfsSync(d); return s.bavail * s.bsize; } catch (e) { return Infinity; }
}
const which = (cmd) => (process.env.PATH || '').split(IS_WIN ? ';' : ':').map((d) => path.join(d, cmd)).find((p) => exists(p)) || null;
const run = (cmd, args, opts = {}) => new Promise((ok) => {
  const p = spawn(cmd, args, Object.assign({ windowsHide: true }, opts));
  let out = '', err = '';
  if (p.stdout) p.stdout.on('data', (d) => { out += d; });
  if (p.stderr) p.stderr.on('data', (d) => { err += d; });
  p.on('error', (e) => ok({ code: -1, out, err: err + e.message }));
  p.on('exit', (code) => ok({ code, out, err }));
});

// ---------------------------------------------------------------- Dolphin / DolphinTool
// Windows: Dolphin incluido en el instalador.  Linux: el del usuario (paquete, AppImage o Flatpak).
function linuxDetect() {
  const found = [];
  for (const base of ['/var/lib/flatpak/app/org.DolphinEmu.dolphin-emu', path.join(os.homedir(), '.local/share/flatpak/app/org.DolphinEmu.dolphin-emu')])
    if (exists(base)) { found.push({ kind: 'flatpak', path: 'flatpak:org.DolphinEmu.dolphin-emu', tool: 'flatpak:org.DolphinEmu.dolphin-emu' }); break; }
  const bin = which('dolphin-emu');
  if (bin) found.push({ kind: 'bin', path: bin, tool: which('dolphin-tool') || (exists(path.join(path.dirname(bin), 'dolphin-tool')) ? path.join(path.dirname(bin), 'dolphin-tool') : null) });
  return found;
}
function toolCommand(sel, extraDirs = []) {
  if (IS_WIN) return { cmd: payload('dolphin', 'DolphinTool.exe'), pre: [] };
  const t = sel.tool || '';
  if (t.startsWith('flatpak:'))
    return { cmd: 'flatpak', pre: ['run', ...extraDirs.map((d) => '--filesystem=' + d), '--command=dolphin-tool', t.slice(8)] };
  return { cmd: t, pre: [] };
}
async function gameId(file, sel) {
  const tc = toolCommand(sel, [path.dirname(file)]);
  const r = await run(tc.cmd, [...tc.pre, 'header', '-i', file, '-j']);
  try { return JSON.parse(r.out.slice(r.out.indexOf('{'))).game_id || null; } catch (e) {}
  const m = /Game ID:\s*(\w+)/.exec(r.out); return m ? m[1] : null;
}

// ---------------------------------------------------------------- instalación
let installing = false;
async function install(o) {
  const L = o.lang || 'es';
  const step = (key, pct, extra) => send('prog', { key, pct, extra });
  const dir = path.resolve(o.dir);
  const tmpJp = path.join(dir, '_jp_temp');
  const en = path.join(dir, 'juego', 'US_INGLES');
  const jpDir = path.join(dir, 'juego', 'US_VOZ_JP');
  const sel = { tool: o.tool, dolphin: o.dolphin };
  if (!exists(payload('launcher', 'app', 'main.js'))) throw new Error('payload');
  // 1. espacio y copias
  const need = 10e9;
  if (freeBytes(dir) < need) throw new Error('space:' + Math.ceil(need / 1e9));
  step('check', 2);
  for (const [k, f] of [['us', o.us], ['jp', o.jp]]) {
    const id = await gameId(f, sel);
    log(k.toUpperCase() + ': ' + f + ' -> ' + id);
    if (id !== GAMES[k].id) throw new Error('id:' + k + ':' + (id || '?'));
  }
  fs.mkdirSync(dir, { recursive: true });
  // 2. extraer (progreso por tamaño)
  const extract = async (file, out, key, p0, p1, total) => {
    fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
    const tc = toolCommand(sel, [path.dirname(file), dir]);
    const t = setInterval(() => step(key, p0 + Math.min(1, dirBytes(out) / total) * (p1 - p0)), 1500);
    const r = await run(tc.cmd, [...tc.pre, 'extract', '-i', file, '-o', out, '-q']);
    clearInterval(t);
    if (!exists(path.join(out, 'DATA', 'sys', 'main.dol'))) throw new Error('extract:' + (r.err || r.out || r.code).toString().slice(0, 300));
  };
  const verify = async (base, k) => {
    for (const [rel, want] of Object.entries(GAMES[k].md5)) {
      const f = path.join(base, ...rel.split('/'));
      const got = exists(f) ? await md5(f) : 'falta';
      log('verificar ' + k + ' ' + rel + ': ' + got);
      if (got !== want) throw new Error('verify:' + k);
    }
  };
  step('extractUS', 4);
  await extract(o.us, en, 'extractUS', 4, 38, GAMES.us.bytes);
  step('verifyUS', 39); await verify(en, 'us');
  step('extractJP', 42);
  await extract(o.jp, tmpJp, 'extractJP', 42, 72, GAMES.jp.bytes);
  step('verifyJP', 73); await verify(tmpJp, 'jp');
  // 3. versión con voces japonesas: enlaces a la versión USA + archivos reconstruidos desde tus discos
  step('voices', 75);
  fs.rmSync(jpDir, { recursive: true, force: true });
  const files = walk(en);
  let i = 0;
  for (const rel of files) {
    const dst = path.join(jpDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    linkOrCopy(path.join(en, rel), dst);
    if (++i % 1000 === 0) step('voices', 75 + (i / files.length) * 4);
  }
  step('patch', 80);
  await voces.build(R, en, tmpJp, jpDir, (f) => step('patch', 80 + f * 10), log);
  fs.writeFileSync(path.join(jpDir, 'listo.txt'), 'voces=jp\n');
  log('voces japonesas: listas');
  fs.rmSync(tmpJp, { recursive: true, force: true });
  // 4. launcher, Dolphin y texturas
  step('launcher', 91);
  const L_DIR = path.join(dir, 'launcher');
  fs.rmSync(L_DIR, { recursive: true, force: true });
  copyDir(ROOT, L_DIR, (s, e) => {
    const rel = path.relative(ROOT, s);
    return !(rel === 'resources' && e.isDirectory()) && rel !== 'payload' && !/\.txt$/i.test(rel) && !/^instalar/i.test(rel)
      && rel !== 'AppRun' && !/\.desktop$/i.test(rel) && !/^\.DirIcon$/.test(rel) && !/^usr$/.test(rel) && !/^pandoras-tower\.png$/.test(rel);
  });
  // el ejecutable del launcher es el mismo motor que el del instalador (con el icono del juego)
  const exeName = IS_WIN ? 'PandorasTower.exe' : 'pandorastower';
  if (IS_WIN) fs.copyFileSync(process.execPath, path.join(L_DIR, exeName));
  else {
    const exeSrc = exists(path.join(L_DIR, 'electron')) ? 'electron' : path.basename(process.execPath);
    if (exeSrc !== exeName) fs.renameSync(path.join(L_DIR, exeSrc), path.join(L_DIR, exeName));
  }
  copyDir(payload('launcher', 'app'), path.join(L_DIR, 'resources', 'app'), (s) => IS_WIN ? !/pt_bridge$/.test(s) : !/\.ps1$/i.test(s));
  copyDir(payload('launcher', 'ui'), path.join(L_DIR, 'ui'));
  copyDir(payload('launcher', 'data'), path.join(L_DIR, 'data'));
  const userDir = IS_WIN ? path.join(dir, 'Dolphin-x64', 'User') : path.join(dir, 'dolphin-user');
  if (IS_WIN) {
    copyDir(payload('dolphin'), path.join(dir, 'Dolphin-x64'));
    fs.writeFileSync(path.join(dir, 'Dolphin-x64', 'portable.txt'), '');
  }
  step('textures', 94);
  const tex = payload('textures');
  if (exists(tex)) copyDir(tex, path.join(userDir, 'Load', 'Textures'));
  else log('Aviso: no hay texturas HD en el payload');
  fs.mkdirSync(path.join(userDir, 'Config'), { recursive: true });
  // configuración inicial (idioma elegido, ventana en la primera apertura)
  const cfg = { ui: 'es', text: L, voice: 'jp', launcherFull: 'off', autoControls: 'on' };
  fs.mkdirSync(path.join(L_DIR, 'data'), { recursive: true });
  fs.writeFileSync(path.join(L_DIR, 'data', 'config.json'), JSON.stringify(cfg));
  const pj = IS_WIN
    ? { dolphinExe: '../Dolphin-x64/Dolphin.exe', dolphinUser: '../Dolphin-x64/User', gameEN: '../juego/US_INGLES', gameJP: '../juego/US_VOZ_JP' }
    : { dolphinExe: o.dolphin, dolphinUser: '../dolphin-user', gameEN: '../juego/US_INGLES', gameJP: '../juego/US_VOZ_JP' };
  fs.writeFileSync(path.join(L_DIR, 'data', 'paths.json'), JSON.stringify(pj, null, 1));
  if (!IS_WIN) {
    for (const f of [exeName, 'chrome_crashpad_handler', 'chrome-sandbox', path.join('resources', 'app', 'pt_bridge')])
      try { fs.chmodSync(path.join(L_DIR, f), 0o755); } catch (e) {}
  }
  // 5. accesos directos
  // Steam: AGREGAR_A_STEAM.bat (Windows) y agregar_a_steam.sh (Linux / Steam Deck) + arte
  if (exists(payload('steam'))) {
    try {
      copyDir(path.join(payload('steam'), 'arte'), path.join(dir, 'steam'));
      const sf = ['AGREGAR_A_STEAM.bat', 'AGREGAR_A_STEAM.ps1', 'agregar_a_steam.sh', 'agregar_a_steam.py'];   // los dos: Windows y Linux / Steam Deck
      for (const f of sf.concat('LEEME - README.txt')) if (exists(path.join(payload('steam'), f))) {
        fs.copyFileSync(path.join(payload('steam'), f), path.join(dir, f));
        if (!IS_WIN && /\.(sh|py)$/.test(f)) try { fs.chmodSync(path.join(dir, f), 0o755); } catch (e) {}
      }
    } catch (e) { log('steam: ' + e.message); }
  }
  step('shortcuts', 97);
  const exe = path.join(L_DIR, exeName);
  if (IS_WIN) {
    const q = (s) => s.replace(/'/g, "''");
    const lnk = (where) => `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(where)}');` +
      `$s.TargetPath='${q(exe)}';$s.WorkingDirectory='${q(L_DIR)}';` +
      `$s.IconLocation='${q(path.join(L_DIR, 'ui', 'assets', 'icon.ico'))}';$s.Description="Pandora's Tower - Dionixu's Launcher";$s.Save()`;
    const targets = [path.join(dir, "Pandora's Tower.lnk")];
    if (o.desktop) targets.push(path.join(app.getPath('desktop'), "Pandora's Tower.lnk"));
    if (o.menu) targets.push(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', "Pandora's Tower.lnk"));
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', targets.map(lnk).join(';')]);
  } else {
    const desk = ['[Desktop Entry]', 'Type=Application', "Name=Pandora's Tower", "Comment=Dionixu's Launcher", 'Categories=Game;',
      `Exec="${exe}" --no-sandbox`, `Path=${L_DIR}`, `Icon=${path.join(L_DIR, 'ui', 'assets', 'icon.png')}`, 'Terminal=false', 'StartupWMClass=pandorastower', ''].join('\n');
    const write = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, desk); try { fs.chmodSync(f, 0o755); } catch (e) {} };
    write(path.join(dir, "Pandora's Tower.desktop"));
    if (o.menu) write(path.join(os.homedir(), '.local', 'share', 'applications', 'pandoras-tower.desktop'));
    if (o.desktop) {
      const r = await run('xdg-user-dir', ['DESKTOP']);
      const d = (r.code === 0 && r.out.trim()) || path.join(os.homedir(), 'Desktop');
      if (exists(d)) { const f = path.join(d, 'pandoras-tower.desktop'); write(f); await run('gio', ['set', f, 'metadata::trusted', 'true']); }
    }
  }
  fs.writeFileSync(path.join(dir, 'instalacion.log'), logLines.join('\n') + '\n');
  step('done', 100);
  return { exe, dir: L_DIR };
}

// si algo falla, se borra lo extraído (no deja gigas sueltos); nunca se toca nada fuera de la carpeta elegida
async function installSafe(o) {
  try { return await install(o); }
  catch (e) {
    const dir = path.resolve(o.dir);
    for (const d of [path.join(dir, '_jp_temp'), path.join(dir, 'juego')]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (x) {} }
    throw e;
  }
}

// ---------------------------------------------------------------- IPC
let lastInstall = null;
ipcMain.on('msg', async (_e, raw) => {
  let m; try { m = JSON.parse(raw); } catch (e) { return; }
  try {
    switch (m.cmd) {
      case 'init': {
        const home = os.homedir();
        send('state', {
          platform: process.platform, payloadOk: exists(payload('launcher', 'app', 'main.js')), texOk: exists(payload('textures')),
          defaultDir: IS_WIN ? path.join(app.getPath('documents'), "Pandora's Tower") : path.join(home, 'Games', "Pandora's Tower"),
          dolphins: IS_LINUX ? linuxDetect() : []
        });
        break;
      }
      case 'pick': {
        const opts = m.kind === 'dir'
          ? { properties: ['openDirectory', 'createDirectory'], defaultPath: m.current || undefined }
          : m.kind === 'us' || m.kind === 'jp'
            ? { properties: ['openFile'], filters: [{ name: 'Wii', extensions: ['rvz', 'iso', 'wbfs', 'wia', 'gcz', 'ciso'] }, { name: '*', extensions: ['*'] }] }
            : { properties: ['openFile', 'showHiddenFiles'] };
        const r = await dialog.showOpenDialog(win, opts);
        if (r.canceled || !r.filePaths[0]) return;
        send('picked', { kind: m.kind, path: r.filePaths[0] });
        break;
      }
      case 'check': {
        const id = await gameId(m.path, { tool: m.tool });
        send('checked', { kind: m.kind, path: m.path, id });
        break;
      }
      case 'checkTool': {
        const tc = toolCommand({ tool: m.tool });
        const r = await run(tc.cmd, [...tc.pre, 'header', '--help']);
        send('toolChecked', { ok: r.code !== -1 && /input|usage|Usage/i.test(r.out + r.err) });
        break;
      }
      case 'install':
        if (installing) return;
        installing = true;
        try { lastInstall = await installSafe(m.opts); send('done', lastInstall); }
        catch (e) { log('ERROR: ' + (e.stack || e.message)); send('fail', { error: e.message }); }
        installing = false;
        break;
      case 'launch':
        if (lastInstall) {
          const p = spawn(lastInstall.exe, ['--windowed', ...(IS_LINUX ? ['--no-sandbox'] : [])], { cwd: lastInstall.dir, detached: true, stdio: 'ignore' });
          p.unref();
        }
        setTimeout(() => app.quit(), 600);
        break;
      case 'openFolder': if (lastInstall) shell.openPath(path.dirname(lastInstall.dir)); break;
      case 'minimize': win.minimize(); break;
      case 'close': if (!installing) app.quit(); break;
    }
  } catch (e) { send('fail', { error: e.message }); }
});

app.whenReady().then(() => {
  protocol.handle('pt', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.resolve(UI, rel);
    if (!file.startsWith(path.resolve(UI))) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  win = new BrowserWindow({
    width: 1040, height: 640, minWidth: 900, minHeight: 560, frame: false, resizable: false, backgroundColor: '#090c11', show: false,
    title: "Dionixu's Launcher — Pandora's Tower", icon: path.join(UI, 'assets', IS_WIN ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenu(null);
  win.loadURL('pt://ui/index.html');
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (installing) e.preventDefault(); });
});
app.on('window-all-closed', () => app.quit());
