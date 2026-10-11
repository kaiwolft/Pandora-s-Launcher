// Pandora's Tower — Dionixu's Launcher (Electron / Chromium) · Windows y Linux
// Basado en el launcher de The Last Story: lanza Dolphin, aplica ajustes y controles, menú de pausa con F1 / L3+R3.
const { app, BrowserWindow, ipcMain, screen, protocol, net, session } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const NL = IS_WIN ? '\r\n' : '\n';

const APP_NAME = "Pandora's Tower — Dionixu's Launcher";
const ROOT = path.dirname(process.execPath);          // carpeta launcher
const UI = path.join(ROOT, 'ui');
const DATA = path.join(ROOT, 'data');
const CFG = path.join(DATA, 'config.json');
const PATHS = path.join(DATA, 'paths.json');
const LOG = path.join(DATA, 'launcher.log');
const GAME_ID = 'SX3EXJ';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Linux: que Chromium elija X11 o Wayland. Forzar X11 bajo Wayland deja la ventana invisible o en negro (proceso de GPU caído).
if (IS_LINUX) app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
// Protocolo propio para servir la interfaz (audio y fuentes necesitan un origen propio, no file://)
protocol.registerSchemesAsPrivileged([{ scheme: 'pt', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.setPath('userData', path.join(DATA, 'chromium'));
app.setName("Dionixu's Launcher");

const log = (s) => { try { fs.appendFileSync(LOG, new Date().toISOString() + '  ' + s + '\n'); } catch (e) {} };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const exists = (f) => { try { return fs.existsSync(f); } catch (e) { return false; } };
const saveCfg = () => { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(cfg, null, 1)); } catch (e) {} };

let win = null, game = null, exitWin = null, bridge = null, exitOpen = false, gameStart = 0;
let cfg = readJson(CFG, {});

// ---------------- rutas (absolutas o relativas a la carpeta del launcher)
const paths = (() => {
  const raw = readJson(PATHS, {});
  const abs = (p) => path.resolve(ROOT, p);
  const pick = (k, d) => { const v = raw[k] ? abs(raw[k]) : null; return v && exists(v) ? v : abs(d); };
  const out = {
    gameEN: pick('gameEN', '../juego/US_INGLES'),
    gameJP: pick('gameJP', '../juego/US_VOZ_JP')
  };
  if (IS_WIN) {
    out.dolphinExe = pick('dolphinExe', '../Dolphin-x64/Dolphin.exe');
    out.dolphinUser = raw.dolphinUser ? abs(raw.dolphinUser) : path.join(path.dirname(out.dolphinExe), 'User');
  } else {
    // Linux: el Dolphin del usuario: ruta, comando del PATH (dolphin-emu) o "flatpak:org.DolphinEmu.dolphin-emu"
    const d = raw.dolphinExe || 'dolphin-emu';
    out.dolphinExe = d.startsWith('flatpak:') || !d.includes('/') ? d : abs(d);
    out.dolphinUser = abs(raw.dolphinUser || '../dolphin-user');
  }
  out.root = path.resolve(ROOT, '..');
  out.textures = path.join(out.dolphinUser, 'Load', 'Textures', GAME_ID);
  out.buttonsActive = path.join(out.textures, 'Botones');
  return out;
})();
const userPath = (...p) => path.join(paths.dolphinUser, ...p);
// Cómo lanzar Dolphin según el sistema
function dolphinCommand() {
  const d = paths.dolphinExe;
  if (IS_LINUX && d.startsWith('flatpak:'))
    return { cmd: 'flatpak', pre: ['run', '--filesystem=' + paths.root, '--env=QT_QPA_PLATFORM=xcb', d.slice(8)], ok: true };
  if (IS_LINUX && !d.includes('/')) {
    const found = (process.env.PATH || '').split(':').some((dir) => dir && exists(path.join(dir, d)));
    return { cmd: d, pre: [], ok: found };
  }
  return { cmd: d, pre: [], ok: exists(d) };
}
const helper = (name) => {   // binarios propios junto a main.js (Linux: con permiso de ejecución)
  const f = path.join(__dirname, name);
  if (!IS_WIN && exists(f)) { try { fs.chmodSync(f, 0o755); } catch (e) {} }
  return f;
};
const send = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send('msg', JSON.stringify({ type, data })); };

function state() {
  const dol = (dir) => path.join(dir || '', 'DATA', 'sys', 'main.dol');
  return {
    config: cfg,
    fullscreen: !!(win && win.isFullScreen()),
    dolphinOk: dolphinCommand().ok,
    platform: process.platform,
    gameEnOk: exists(dol(paths.gameEN)),
    gameJpOk: exists(dol(paths.gameJP)) && exists(path.join(paths.gameJP, 'listo.txt')),
    hdOk: exists(paths.textures),
    buttons: { xbox: exists(path.join(DATA, 'botones', 'xbox')), kb: exists(path.join(DATA, 'botones', 'teclado')) }
  };
}

// ---------------- .ini de Dolphin: editar claves conservando el resto
function setIni(file, values) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {}
  const lines = text.split(/\r?\n/);
  for (const [section, entries] of Object.entries(values)) {
    let start = lines.findIndex((l) => l.trim().toLowerCase() === '[' + section.toLowerCase() + ']');
    if (start < 0) { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); lines.push('[' + section + ']'); start = lines.length - 1; }
    for (const [key, val] of Object.entries(entries)) {
      let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l)); if (end < 0) end = lines.length;
      const i = lines.findIndex((l, j) => j > start && j < end && l.split('=')[0].trim().toLowerCase() === key.toLowerCase());
      const line = key + ' = ' + val;
      if (i >= 0) lines[i] = line; else lines.splice(end, 0, line);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join(NL).replace(/(\r?\n)+$/, '') + NL);
}

// ---------------- botones: copia el paquete elegido a Load/Textures/SX3EXJ/Botones
// tex: iconos dibujados por la interfaz con los controles elegidos (sustituyen a los del paquete fijo)
function applyButtons(iconSet, tex) {
  const set = ['xbox', 'kb', 'wii'].includes(iconSet) ? iconSet : null;
  const which = set ? { xbox: 'xbox', kb: 'teclado', wii: null }[set]
    : cfg.buttons === 'kb' ? 'teclado' : cfg.buttons === 'wii' ? null : cfg.buttons === 'xbox' ? 'xbox' : (cfg.lastDevice === 'kb' ? 'teclado' : 'xbox');
  const active = paths.buttonsActive;
  fs.rmSync(active, { recursive: true, force: true });
  if (!which) { log('Botones: originales de Wii'); return; }
  const store = path.join(DATA, 'botones', which);
  if (!exists(store)) { log('Botones: falta ' + store); return; }
  const names = new Set(fs.readdirSync(store).filter((f) => f.toLowerCase().endsWith('.png')));
  // quita los mismos nombres del resto del paquete HD (Dolphin no sabria cual usar)
  const sweep = (dir) => {
    if (!exists(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) sweep(p);
      else if (names.has(e.name)) { fs.rmSync(p, { force: true }); log('Duplicado retirado: ' + p); }
    }
  };
  try { sweep(paths.textures); } catch (e) { log('sweep: ' + e.message); }
  fs.mkdirSync(active, { recursive: true });
  for (const f of names) fs.copyFileSync(path.join(store, f), path.join(active, f));
  let n = 0;
  if (tex && typeof tex === 'object') {
    for (const [name, url] of Object.entries(tex)) {
      if (!names.has(name) || typeof url !== 'string' || !url.startsWith('data:image/png;base64,')) continue;
      try { fs.writeFileSync(path.join(active, name), Buffer.from(url.slice(22), 'base64')); n++; } catch (e) { log('icono ' + name + ': ' + e.message); }
    }
  }
  log('Botones: ' + which + (n ? ' (' + n + ' iconos con tus controles)' : ''));
}

// ---------------- controles: mando clasico emulado; mando Xbox + teclado/raton a la vez, asignaciones editables desde el launcher
// Windows: XInput + DirectInput.  Linux: SDL (mismos nombres de botón que XInput) + XInput2 (nombres de teclas X11).
// En Linux las teclas se buscan en "Virtual core keyboard" (en "pointer" Dolphin no veía el teclado) y también en
// "Virtual core pointer" por si la versión de Dolphin las agrupa ahí; el ratón (clics, movimiento) va en "pointer".
const KBDEV = IS_WIN ? 'DInput/0/Keyboard Mouse' : 'XInput2/0/Virtual core keyboard';
const PTRDEV = IS_WIN ? KBDEV : 'XInput2/0/Virtual core pointer';
// Nombres DirectInput (los que guarda la interfaz) -> nombres X11 de Dolphin
const DI2X = { SPACE: 'space', LSHIFT: 'Shift_L', RSHIFT: 'Shift_R', LCONTROL: 'Control_L', RCONTROL: 'Control_R', LMENU: 'Alt_L', RMENU: 'ISO_Level3_Shift',
  RETURN: 'Return', NUMPADENTER: 'KP_Enter', ESCAPE: 'Escape', TAB: 'Tab', BACK: 'BackSpace', CAPITAL: 'Caps_Lock', UP: 'Up', DOWN: 'Down', LEFT: 'Left',
  RIGHT: 'Right', MINUS: 'minus', EQUALS: 'equal', LBRACKET: 'bracketleft', RBRACKET: 'bracketright', SEMICOLON: 'semicolon', APOSTROPHE: 'apostrophe',
  GRAVE: 'grave', BACKSLASH: 'backslash', OEM_102: 'less', COMMA: 'comma', PERIOD: 'period', SLASH: 'slash', INSERT: 'Insert', DELETE: 'Delete',
  HOME: 'Home', END: 'End', PRIOR: 'Prior', NEXT: 'Next', ADD: 'KP_Add', SUBTRACT: 'KP_Subtract', MULTIPLY: 'KP_Multiply', DIVIDE: 'KP_Divide',
  DECIMAL: 'KP_Decimal', 'Click 0': 'Click 1', 'Click 1': 'Click 3', 'Click 2': 'Click 2', 'Click 3': 'Click 8', 'Click 4': 'Click 9',
  'Axis Z+': 'Click 4', 'Axis Z-': 'Click 5' };
const isMouseName = (n) => /^Click \d$|^Axis Z/.test(n);
const keyName = (n) => IS_WIN ? n : (DI2X[n] || (/^NUMPAD(\d)$/.test(n) ? 'KP_' + n.slice(6) : /^[A-Z]$/.test(n) ? n.toLowerCase() : n));
// Linux: nombres con que SDL presenta los mandos más comunes (más los que vea el puente). Los que no existan no hacen nada.
const SDL_PADS = ['Xbox 360 Controller', 'Xbox One Controller', 'Xbox Series X Controller', 'Xbox Wireless Controller', 'PS4 Controller', 'PS5 Controller',
  'Nintendo Switch Pro Controller', 'Steam Deck', 'Steam Virtual Gamepad', 'Steam Controller', '8BitDo Pro 2', 'Logitech Dual Action'];
// posicion de Nintendo: a = derecha (B de Xbox), b = abajo (A), x = arriba (Y), y = izquierda (X)
const PAD_DEF = { a: 'Button B', b: 'Button A', x: 'Button Y', y: 'Button X', zl: 'Shoulder L', zr: 'Shoulder R', l: 'Trigger L', r: 'Trigger R',
  plus: 'Start', minus: 'Back', du: 'Pad N', dd: 'Pad S', dl: 'Pad W', dr: 'Pad E' };
const KB_DEF = { ls_up: 'W', ls_down: 'S', ls_left: 'A', ls_right: 'D', rs_up: 'I', rs_down: 'K', rs_left: 'J', rs_right: 'L',
  a: 'Click 0', b: 'SPACE', x: 'E', y: 'Q', zl: 'LCONTROL', zr: 'Click 1', l: 'LSHIFT', r: 'F', plus: 'ESCAPE', minus: 'TAB',
  du: 'UP', dd: 'DOWN', dl: 'LEFT', dr: 'RIGHT' };
const okName = (v) => typeof v === 'string' && /^[A-Za-z0-9 +\-_.]{1,24}$/.test(v);
function writeControls() {
  const pb = Object.assign({}, PAD_DEF, cfg.padBinds || {}), kbb = Object.assign({}, KB_DEF, cfg.kbBinds || {});
  const used = new Set(Object.values(kbb));
  const or = (...e) => e.filter(Boolean).join(' | ');
  const kb = (n) => {
    if (!okName(n)) return null;
    if (IS_WIN) return '`' + KBDEV + ':' + n + '`';
    const x = keyName(n);
    if (isMouseName(n)) return '`' + PTRDEV + ':' + x + '`';
    // letras: X11 las nombra en minúscula; se añade la mayúscula por si la versión de Dolphin las nombra así
    const names = /^[a-z]$/.test(x) ? [x, x.toUpperCase()] : [x];
    return or(...names.flatMap((nm) => ['`' + KBDEV + ':' + nm + '`', '`' + PTRDEV + ':' + nm + '`']));
  };
  const padNames = IS_WIN ? [] : [...new Set([...(cfg.padNames || []), ...SDL_PADS])].slice(0, 16);
  const pad = (n, dz) => {
    if (!okName(n)) return null;
    if (IS_WIN) return dz ? 'deadzone(`' + n + '`, 0.15)' : '`' + n + '`';
    return or(...padNames.map((d) => dz ? 'deadzone(`SDL/0/' + d + ':' + n + '`, 0.15)' : '`SDL/0/' + d + ':' + n + '`'));
  };
  const extra = { a: 'RETURN', b: 'BACK' };     // Enter y Retroceso tambien aceptan/cancelan si estan libres
  const K = (id) => [kb(kbb[id]), extra[id] && !used.has(extra[id]) ? kb(extra[id]) : null];
  const sv = Math.max(5, Math.min(100, parseInt(cfg.sens || 50, 10)));
  const k = +(0.005 + 0.25 * Math.pow(sv / 100, 1.6)).toFixed(4);
  const inv = cfg.invert === 'on', pinv = cfg.padInvert === 'on', keysCam = cfg.kbCam === 'keys';
  const mouse = (ax) => '`' + PTRDEV + ':RelativeMouse ' + ax + '` * ' + k;
  const L = ['[Wiimote1]', 'Device = ' + (IS_WIN ? 'XInput/0/Gamepad' : 'SDL/0/' + padNames[0]), 'Extension = Classic'];
  const set = (key, v) => L.push('Classic/' + key + ' = ' + v);
  set('Buttons/A', or(pad(pb.a), ...K('a')));
  set('Buttons/B', or(pad(pb.b), ...K('b')));
  set('Buttons/X', or(pad(pb.x), ...K('x')));
  set('Buttons/Y', or(pad(pb.y), ...K('y')));
  set('Buttons/ZL', or(pad(pb.zl), ...K('zl')));
  set('Buttons/ZR', or(pad(pb.zr), ...K('zr')));
  set('Buttons/+', or(pad(pb.plus), ...K('plus')));
  set('Buttons/-', or(pad(pb.minus), ...K('minus')));
  set('Triggers/L', or(pad(pb.l), ...K('l')));
  set('Triggers/R', or(pad(pb.r), ...K('r')));
  set('Triggers/L-Analog', or(pad(pb.l), ...K('l')));
  set('Triggers/R-Analog', or(pad(pb.r), ...K('r')));
  set('D-Pad/Up', or(pad(pb.du), ...K('du')));
  set('D-Pad/Down', or(pad(pb.dd), ...K('dd')));
  set('D-Pad/Left', or(pad(pb.dl), ...K('dl')));
  set('D-Pad/Right', or(pad(pb.dr), ...K('dr')));
  set('Left Stick/Up', or(pad('Left Y+', true), kb(kbb.ls_up)));
  set('Left Stick/Down', or(pad('Left Y-', true), kb(kbb.ls_down)));
  set('Left Stick/Left', or(pad('Left X-', true), kb(kbb.ls_left)));
  set('Left Stick/Right', or(pad('Left X+', true), kb(kbb.ls_right)));
  set('Left Stick/Dead Zone', '0.');
  set('Right Stick/Up', or(pad(pinv ? 'Right Y-' : 'Right Y+', true), keysCam ? kb(kbb.rs_up) : mouse(inv ? 'Y+' : 'Y-')));
  set('Right Stick/Down', or(pad(pinv ? 'Right Y+' : 'Right Y-', true), keysCam ? kb(kbb.rs_down) : mouse(inv ? 'Y-' : 'Y+')));
  set('Right Stick/Left', or(pad('Right X-', true), keysCam ? kb(kbb.rs_left) : mouse('X-')));
  set('Right Stick/Right', or(pad('Right X+', true), keysCam ? kb(kbb.rs_right) : mouse('X+')));
  set('Right Stick/Dead Zone', '0.');
  L.push('Source = 1', '[Wiimote2]', 'Source = 0', '[Wiimote3]', 'Source = 0', '[Wiimote4]', 'Source = 0', '[BalanceBoard]', 'Source = 0');
  const dir = userPath('Config'); fs.mkdirSync(dir, { recursive: true });
  // "Controles automáticos" apagado: se respeta la configuración hecha a mano en Dolphin (mandos genéricos en Linux, etc.)
  if (cfg.autoControls !== 'off') fs.writeFileSync(path.join(dir, 'WiimoteNew.ini'), L.join(NL) + NL);
  else log('Controles: se conserva WiimoteNew.ini de Dolphin (controles automáticos apagados)');
  // Esc es el boton + del juego: los atajos de Dolphin se reducen a pantalla completa y captura
  fs.writeFileSync(path.join(dir, 'Hotkeys.ini'), ['[Hotkeys]', 'Device = ' + KBDEV,
    'General/Toggle Fullscreen = @(Alt+' + (IS_WIN ? 'RETURN' : 'Return') + ')', 'General/Take Screenshot = F9'].join(NL) + NL);
}

// ---------------- parches del juego (User/GameSettings/SX3EXJ.ini)
// Pantalla de la correa del Wiimote: el arranque la carga salvo con start_mode 2/3. Se fuerza ese camino:
// 0x8000DEC4  bf 1,+0x2C (0x4081002C)  ->  b +0x2C (0x4800002C)
function writeGameSettings() {
  const L = ['# Generado por Dionixu\'s Launcher', '[OnFrame]', '$Saltar pantalla de la correa', '0x8000DEC4:dword:0x4800002C',
    '[OnFrame_Enabled]', '$Saltar pantalla de la correa'];
  const f = userPath('GameSettings', GAME_ID + '.ini');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, L.join(NL) + NL);
  log('Correa del Wiimote: omitida');
}

// ---------------- aviso de logro (ventana transparente encima del juego, sin robar el foco)
let toastWin = null, toastQueue = [], toastBusy = false, toastSeq = 0;
function createToastWindow() {
  const d = screen.getPrimaryDisplay().bounds;
  toastWin = new BrowserWindow({
    x: d.x + Math.round((d.width - 620) / 2), y: d.y, width: 620, height: 150, show: false, frame: false, transparent: true,
    resizable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  toastWin.setAlwaysOnTop(true, 'screen-saver');
  toastWin.setIgnoreMouseEvents(true);
  toastWin.setMenu(null);
  toastWin.loadURL('pt://ui/toast.html');
}
function showAchievement(a) {
  if (cfg.achToast === 'off') return;
  toastQueue.push(Object.assign({ lang: cfg.ui || 'es', sound: cfg.sfx !== 'off' }, a));
  nextToast();
}
function nextToast() {
  if (toastBusy || !toastQueue.length || !toastWin || toastWin.isDestroyed()) return;
  toastBusy = true;
  const d = screen.getPrimaryDisplay().bounds;
  toastWin.setBounds({ x: d.x + Math.round((d.width - 620) / 2), y: d.y, width: 620, height: 150 });
  toastWin.showInactive();
  toastWin.setAlwaysOnTop(true, 'screen-saver');
  toastWin.webContents.send('msg', JSON.stringify({ type: 'show', data: toastQueue.shift() }));
  const id = ++toastSeq;
  setTimeout(() => { if (toastBusy && id === toastSeq) { toastBusy = false; nextToast(); } }, 9000);   // por si la ventana no responde
}

// ---------------- puente de mando + menu de pausa
const sendExit = (type, data) => { if (exitWin && !exitWin.isDestroyed()) exitWin.webContents.send('msg', JSON.stringify({ type, data })); };
const bridgeCmd = (s) => { try { if (bridge && bridge.stdin.writable) bridge.stdin.write(s + '\n'); } catch (e) {} };
const hwnd = (w) => { const b = w.getNativeWindowHandle(); return (b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0))).toString(); };

function createExitWindow() {
  const d = screen.getPrimaryDisplay().bounds;
  exitWin = new BrowserWindow({
    x: d.x, y: d.y, width: d.width, height: d.height, show: false, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  exitWin.setAlwaysOnTop(true, 'screen-saver');
  exitWin.setMenu(null);
  exitWin.loadURL('pt://ui/exit.html');
}
function startBridge() {
  stopBridge();
  bridge = IS_WIN
    ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'bridge.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    : spawn(helper('pt_bridge'), [], { stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = '';
  bridge.stdout.on('data', (d) => {
    buf += d.toString(); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('COMBO')) openExit(line === 'COMBO KB' ? 'kb' : 'pad');
      else if (line.startsWith('BTN ') && exitOpen) sendExit('btn', line.slice(4));
      else if (line === 'AUDIO OK' || line === 'AUDIO NO') { const v = line === 'AUDIO OK' ? 'ok' : 'no'; if (cfg.audioCtl !== v) { cfg.audioCtl = v; saveCfg(); } }
      else if (line.startsWith('VOLSET')) log('volumen del juego: ' + line.slice(7) + '%');
      else if (line.startsWith('WIN ')) { const w = winWaiters; winWaiters = []; w.forEach((f) => f()); }
      else if (line.startsWith('PAD ')) {   // Linux: nombre del mando para SDL
        const n = line.slice(4).trim();
        if (n && n !== '?' && !(cfg.padNames || []).includes(n)) { cfg.padNames = [n, ...(cfg.padNames || [])].slice(0, 6); saveCfg(); }
        log('mando: ' + n);
      }
    }
  });
  bridge.on('error', (e) => { log('puente: ' + e.message); bridge = null; });
  bridge.on('exit', () => { bridge = null; });
}
function stopBridge() { if (bridge) { bridgeCmd('QUIT'); const b = bridge; setTimeout(() => { try { b.kill(); } catch (e) {} }, 500); bridge = null; } }
// volumen en vivo: Windows con el puente (mezclador), Linux con pactl (PulseAudio / PipeWire)
let volTarget = null, volTimer = null;
const pactl = (args) => new Promise((ok) => execFile('pactl', args, { timeout: 4000 }, (e, out) => ok(e ? null : String(out))));
async function linuxApplyVolume() {
  if (volTarget == null || !game) return;
  const out = await pactl(['list', 'sink-inputs']);
  if (out == null) { if (cfg.audioCtl !== 'no') { cfg.audioCtl = 'no'; saveCfg(); log('volumen en vivo: no hay pactl'); } return; }
  for (const block of out.split(/\n(?=Sink Input #)/)) {
    const m = /Sink Input #(\d+)/.exec(block);
    if (m && /application\.(name|process\.binary) = "[^"]*dolphin/i.test(block)) await pactl(['set-sink-input-volume', m[1], volTarget + '%']);
  }
}
function setGameVolume(v) {
  volTarget = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  if (IS_WIN) { if (game && cfg.audioCtl !== 'no') bridgeCmd('VOLUME ' + game.pid + ' ' + volTarget); return; }
  linuxApplyVolume();
  if (!volTimer) volTimer = setInterval(() => { if (!game) { clearInterval(volTimer); volTimer = null; } else linuxApplyVolume(); }, 1500);
}

function openExit(via) {
  if (!game || exitOpen || !exitWin) return;
  exitOpen = true;
  exitWin.setBounds(screen.getPrimaryDisplay().bounds);
  exitWin.show(); exitWin.setAlwaysOnTop(true, 'screen-saver');
  bridgeCmd('FOCUS ' + hwnd(exitWin));      // el juego pierde el foco -> se pausa
  exitWin.focus();
  sendExit('show', { lang: cfg.ui || 'es', via: via || 'pad', gvol: cfg.gvol || '100' });
}
function closeExit(back) {
  exitOpen = false;
  if (back) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show(); if (cfg.launcherFull !== 'off') win.setFullScreen(true);
    bridgeCmd('FOCUS ' + hwnd(win)); win.focus();
    setTimeout(() => { exitWin.hide(); sendExit('hide'); }, 120);
    if (game) { const g = game; bridgeCmd('CLOSEPID ' + g.pid); setTimeout(() => { if (game === g) { try { g.kill(); } catch (e) {} } }, 5000); }
  } else {
    exitWin.hide(); sendExit('hide');
    if (game) bridgeCmd('FOCUSPID ' + game.pid);
  }
}

// Espera a que aparezca la ventana del juego (o 9 s como maximo)
let winWaiters = [];
function waitGameWindow(pid) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    setTimeout(finish, 9000);
    if (!IS_WIN) { winWaiters.push(() => setTimeout(finish, 600)); return; }   // el puente avisa con "WIN <xid>"
    const ps = `$t=0; while ($t -lt 90) { $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if (-not $p) { exit 2 };
      $w = $p.MainWindowTitle; if ($w -and $w -ne 'Dolphin' -and $t -gt 5) { exit 0 }; Start-Sleep -Milliseconds 100; $t++ }; exit 1`;
    const w = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
    w.on('exit', finish); w.on('error', () => {});
  });
}

// ---------------- jugar
function play(voice, iconSet, tex) {
  if (game) return;
  const dc = dolphinCommand();
  if (!dc.ok) throw new Error('No encuentro Dolphin: ' + paths.dolphinExe);
  const st = state();
  const jp = voice === 'jp' && st.gameJpOk;
  const gameDir = jp ? paths.gameJP : paths.gameEN;
  const dol = path.join(gameDir, 'DATA', 'sys', 'main.dol');
  if (!exists(dol)) throw new Error('No encuentro el juego en ' + gameDir);

  applyButtons(iconSet, tex);
  writeControls();
  const res = String(cfg.res || '1080');
  const ir = { 720: 2, 1080: 3, 1440: 4, 2160: 6 }[res] || 3;
  const [ww, wh] = res === '720' ? [1280, 720] : [1920, 1080];
  const lng = cfg.text === 'en' ? 1 : cfg.text === 'fr' ? 3 : 4;          // idioma del Wii: 1 ingles, 3 frances, 4 espanol
  const wide = (cfg.aspect || '169') !== '43';
  const aa = parseInt(cfg.aa || '4', 10);
  const af = { 1: 0, 4: 2, 16: 4 }[cfg.af || '16'];
  const hd = (cfg.hd || 'on') === 'on';
  const C = (key, v) => ['-C', key + '=' + v];
  const args = [
    ...dc.pre,
    ...(IS_WIN ? [] : ['-u', paths.dolphinUser]),
    '-b', '-e', dol,
    ...C('Dolphin.Display.Fullscreen', (cfg.mode || 'full') === 'full' ? 'True' : 'False'),
    ...C('Dolphin.Display.RenderToMain', 'False'),
    ...C('Dolphin.Display.RenderWindowWidth', ww),
    ...C('Dolphin.Display.RenderWindowHeight', wh),
    ...C('Dolphin.Display.RenderWindowAutoSize', 'False'),
    ...C('Dolphin.Interface.ConfirmStop', 'False'),
    ...C('SYSCONF.IPL.LNG', lng),
    ...C('SYSCONF.IPL.AR', wide ? 'True' : 'False'),
    ...C('Dolphin.Core.EnableCheats', 'False')
  ];
  // Graficos: se escriben en GFX.ini porque Dolphin ignora los -C de la seccion GFX al arrancar
  setIni(userPath('Config', 'GFX.ini'), {
    Settings: { InternalResolution: ir, HiresTextures: (hd || cfg.buttons !== 'wii') ? 'True' : 'False', CacheHiresTextures: 'True', DumpTextures: 'False',
      MSAA: aa > 1 ? '0x' + aa.toString(16).padStart(8, '0') : '0x00000001', SSAA: 'False', AspectRatio: (cfg.aspect || '169') === 'auto' ? 0 : wide ? 1 : 2,
      ShaderCompilationMode: 2, WaitForShadersBeforeStarting: 'False', BorderlessFullscreen: 'True' },
    Enhancements: { MaxAnisotropy: af },
    Hardware: { VSync: (cfg.vsync || 'on') === 'on' ? 'True' : 'False' }
  });
  writeGameSettings();
  // Texturas HD apagadas: se aparta el paquete HD (los botones se quedan)
  toggleHdPack(hd);
  setIni(userPath('Config', 'Dolphin.ini'), {
    DSP: { Volume: cfg.audioCtl === 'no' ? parseInt(cfg.gvol || '100', 10) : 100 },
    // Linux (sobre todo Wayland): el puente no siempre puede traer el juego al frente y Dolphin cree que perdió el foco;
    // entonces ignoraría mando y teclado. Por eso en Linux no se pausa al perder el foco y se escucha la entrada en segundo plano.
    Interface: { PauseOnFocusLost: IS_WIN ? 'True' : 'False', ConfirmStop: 'False', LockCursor: 'True', CursorVisibility: 0, OnScreenDisplayMessages: 'False' },
    Input: { BackgroundInput: IS_WIN ? 'False' : 'True' },
    Core: { CPUThread: 'True', DSPHLE: 'True' }
  });
  log('Iniciando: ' + dc.cmd + ' ' + args.join(' '));
  win.setAlwaysOnTop(true, 'screen-saver');
  // Linux: Dolphin por X11/XWayland para que el puente vea su ventana (foco, F1, sin bordes)
  game = spawn(dc.cmd, args, { cwd: IS_WIN ? path.dirname(paths.dolphinExe) : ROOT, stdio: 'ignore',
    env: IS_WIN ? process.env : Object.assign({}, process.env, { QT_QPA_PLATFORM: 'xcb' }) });
  gameStart = Date.now();
  startBridge();
  bridgeCmd('GAMEPID ' + game.pid);
  setGameVolume(cfg.gvol || '100');
  const myGame = game;
  waitGameWindow(game.pid).then(() => {
    if (cfg.mode === 'border') {
      bridgeCmd('BORDERLESS ' + myGame.pid + ' ' + ww + ' ' + wh);
      setTimeout(() => { if (game === myGame) bridgeCmd('BORDERLESS ' + myGame.pid + ' ' + ww + ' ' + wh); }, 1500);
    }
    setTimeout(() => { if (game === myGame) { win.setAlwaysOnTop(false); win.hide(); bridgeCmd('FOCUSPID ' + myGame.pid); } }, 900);
  });
  game.on('error', (e) => { log('Error al iniciar Dolphin: ' + e.message); game = null; win.setAlwaysOnTop(false); win.show(); send('error', e.message); });
  game.on('exit', (code) => {
    const secs = Math.round((Date.now() - gameStart) / 1000);
    log('Dolphin cerrado (codigo ' + code + ', ' + secs + ' s)');
    if (secs > 20) { cfg.playtime = (parseInt(cfg.playtime || 0, 10) || 0) + secs; saveCfg(); }
    game = null;
    stopBridge();
    if (exitOpen) { exitOpen = false; exitWin.hide(); sendExit('hide'); }
    win.show(); if (cfg.launcherFull !== 'off') win.setFullScreen(true); win.focus();
    setTimeout(() => win.setAlwaysOnTop(false), 400);
    send('gameClosed', { playtime: cfg.playtime || 0 });
  });
  send('gameStarted', jp ? 'jp' : 'en');
}
function toggleHdPack(on) {
  const off = paths.textures + '_HD_apagado';
  try {
    // con HD apagado todo menos 'Botones' se mueve a una carpeta hermana; al encenderlo vuelve
    if (!on && exists(paths.textures)) {
      fs.mkdirSync(off, { recursive: true });
      for (const e of fs.readdirSync(paths.textures)) if (e !== 'Botones') fs.renameSync(path.join(paths.textures, e), path.join(off, e));
    } else if (on && exists(off)) {
      fs.mkdirSync(paths.textures, { recursive: true });
      for (const e of fs.readdirSync(off)) fs.renameSync(path.join(off, e), path.join(paths.textures, e));
      fs.rmSync(off, { recursive: true, force: true });
    }
  } catch (e) { log('HD: ' + e.message); }
}

function toggleFull(force) {
  if (!win) return;
  const on = typeof force === 'boolean' ? force : !win.isFullScreen();
  win.setFullScreen(on); cfg.launcherFull = on ? 'on' : 'off'; saveCfg();
}
const keep = () => ({ launcherFull: cfg.launcherFull, audioCtl: cfg.audioCtl, playtime: cfg.playtime, padNames: cfg.padNames });

ipcMain.on('msg', (_e, raw) => {
  let m; try { m = JSON.parse(raw); } catch (e) { return; }
  try {
    switch (m.cmd) {
      case 'init': send('state', state()); break;
      case 'save': if (m.config) { cfg = Object.assign({}, m.config, keep()); saveCfg(); } break;
      case 'play': if (m.config) { cfg = Object.assign({}, m.config, keep()); saveCfg(); } play(m.voice, m.iconSet, m.tex); break;
      case 'minimize': win.minimize(); break;
      case 'toggleFull': toggleFull(); break;
      case 'close': app.quit(); break;
      case 'exitYes': closeExit(true); break;
      case 'exitNo': closeExit(false); break;
      case 'gvol': cfg.gvol = String(Math.max(0, Math.min(100, parseInt(m.value, 10) || 0))); saveCfg(); setGameVolume(cfg.gvol); send('cfgPatch', { gvol: cfg.gvol }); break;
      case 'achTest': showAchievement({ title: m.title || 'Torre I', description: m.description || 'Has derrotado al amo de la torre.', mark: m.mark || 'I' }); break;
      case 'toastDone': toastBusy = false; if (toastQueue.length) nextToast(); else if (toastWin && !toastWin.isDestroyed()) toastWin.hide(); break;
      case 'device': if (m.value === 'kb' || m.value === 'pad') { cfg.lastDevice = m.value; saveCfg(); } break;
    }
  } catch (e) { log('ERROR ' + m.cmd + ': ' + e.stack); send('error', e.message); }
});

function createWindow() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const fit = Math.min(1, (wa.width * 0.9) / 1280, (wa.height * 0.9) / 720);
  if (process.argv.includes('--windowed')) { cfg.launcherFull = 'off'; saveCfg(); }
  win = new BrowserWindow({
    width: Math.round(1280 * fit), height: Math.round(720 * fit), center: true,
    frame: false, resizable: true, maximizable: false, fullscreenable: true, minWidth: 640, minHeight: 360,
    backgroundColor: '#090c11', show: false, title: APP_NAME,
    icon: path.join(UI, 'assets', IS_WIN ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenu(null);
  win.loadURL('pt://ui/index.html');
  win.setAspectRatio(16 / 9);
  win.once('ready-to-show', () => { win.show(); if (cfg.launcherFull !== 'off') win.setFullScreen(true); });
  win.on('enter-full-screen', () => send('fullscreen', true));
  win.on('leave-full-screen', () => send('fullscreen', false));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { e.preventDefault(); toggleFull(); }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(async () => {
    fs.mkdirSync(DATA, { recursive: true });
    // sin cache: cada cambio de la interfaz se ve al volver a abrir el launcher
    try { await session.defaultSession.clearCache(); } catch (e) {}
    protocol.handle('pt', (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
      const file = path.resolve(UI, rel);
      if (!file.startsWith(path.resolve(UI))) return new Response('Prohibido', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
    createExitWindow();
    createToastWindow();
    log('Launcher iniciado. Dolphin: ' + paths.dolphinExe);
  });
  app.on('before-quit', () => stopBridge());
  app.on('window-all-closed', () => app.quit());
}
