// Pandora's Tower — voces japonesas a partir de los discos del usuario (Dionixu's Launcher)
// Formatos de Ganbarion: ALAR (archivo) y ALLZ (compresión). El compresor es determinista: el resultado
// es idéntico, byte a byte, al que se probó en el juego (se verifica con MD5).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex').toUpperCase();

// ---------------------------------------------------------------- ALAR
function alarEntries(b) {
  if (b.toString('latin1', 0, 4) !== 'ALAR') throw new Error('ALAR esperado');
  const ver = b[4], n = b.readUInt16BE(6), out = [];
  const name = (o, max) => { let s = ''; for (let i = 0; i < max && b[o + i]; i++) s += String.fromCharCode(b[o + i]); return s; };
  for (let i = 0; i < n; i++) {
    let h;
    if (ver === 2) h = 0x10 + i * 16;
    else if (ver === 3) h = b.readUInt16BE(0x12 + i * 2);
    else throw new Error('ALAR v' + ver);
    const off = b.readUInt32BE(h + 4), size = b.readUInt32BE(h + 8);
    const nm = ver === 2 ? (off >= 0x22 ? name(off - 0x22, 0x20) : '') : name(h + 18, 256);
    out.push({ i, off, size, name: nm, hdr: h });
  }
  return { ver, entries: out };
}

// ---------------------------------------------------------------- ALLZ (descompresor de main.dol 0x8053fe1c)
function allzDecompress(src) {
  if (src.toString('latin1', 0, 4) !== 'ALLZ') throw new Error('ALLZ esperado');
  const ka = src[5], kb = src[6], kc = src[7], size = src.readUInt32LE(8);
  const out = Buffer.allocUnsafe(size); let o = 0, p = 13;
  let buf = src[12] >>> 1, nb = 7;           // buf puede pasar de 32 bits: se usa Number (hasta 2^53)
  const need = (n) => { while (nb < n) { buf += src[p++] * 2 ** nb; nb += 8; } };
  const take = (n) => { need(n); const m = 2 ** n, v = buf % m; buf = (buf - v) / m; nb -= n; return v; };
  const bit = () => take(1);
  const num = (k0) => { let n = k0; while (bit()) n++; let v = take(n); if (n > k0) v += (2 ** (n - k0) - 1) * 2 ** k0; return v; };
  const literals = () => { const c = num(kc) + 1; src.copy(out, o, p, p + c); o += c; p += c; };
  const match = () => { const d = num(kb) + 1, l = num(ka) + 3; for (let k = 0; k < l && o < size; k++) { out[o] = out[o - d]; o++; } };
  literals();
  while (o < size) {
    match();
    if (o >= size) break;
    if (bit() === 0) { literals(); if (o >= size) break; }
  }
  return out;
}

// ---------------------------------------------------------------- ALLZ: compresor (port exacto de allzc.c)
function allzCompress(input, ka, kb, kc) {
  const n = input.length;
  let cap = Math.max(1024, n + (n >> 3) + 64), out = Buffer.alloc(cap), on = 0;
  const ob = (v) => { if (on >= cap) { cap = cap * 2 + 1024; const nb2 = Buffer.alloc(cap); out.copy(nb2, 0, 0, on); out = nb2; } out[on++] = v; };
  // cola FIFO de posiciones de bit
  let qcap = 1 << 16, qb = new Float64Array(qcap), qi = new Uint8Array(qcap), qh = 0, qt = 0, avail = 0;
  const qpush = (b, bit) => {
    if (qt >= qcap) {   // compacta o crece
      if (qh > 0) { qb.copyWithin(0, qh, qt); qi.copyWithin(0, qh, qt); qt -= qh; qh = 0; }
      if (qt >= qcap) { qcap *= 2; const a = new Float64Array(qcap); a.set(qb); qb = a; const c = new Uint8Array(qcap); c.set(qi); qi = c; }
    }
    qb[qt] = b; qi[qt] = bit; qt++;
  };
  const needq = (k) => { while (avail < k) { const b = on; ob(0); for (let i = 0; i < 8; i++) qpush(b, i); avail += 8; } };
  const putbit = (v) => { needq(1); const b = qb[qh], bi = qi[qh]; qh++; if (v) out[b] |= 1 << bi; avail--; };
  const putbits = (v, k) => { needq(k); for (let i = 0; i < k; i++) { const b = qb[qh], bi = qi[qh]; qh++; if (Math.floor(v / 2 ** i) % 2) out[b] |= 1 << bi; } avail -= k; };
  const putnum = (x, k0) => {
    for (let u = 0; ; u++) {
      const base = (2 ** u - 1) * 2 ** k0, nxt = (2 ** (u + 1) - 1) * 2 ** k0;
      if (x < nxt) { for (let i = 0; i < u; i++) putbit(1); putbit(0); putbits(x - base, k0 + u); return; }
    }
  };
  for (const c of [0x41, 0x4c, 0x4c, 0x5a, 0, ka, kb, kc, n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]) ob(c);
  { const b = on; ob(0); for (let i = 1; i < 8; i++) qpush(b, i); avail = 7; }
  const HB = 16, WIN = 1 << 20;
  const head = new Int32Array(1 << HB).fill(-1), prev = new Int32Array(n + 4);
  const H3 = (p) => Math.imul((input[p] << 16) | (input[p + 1] << 8) | input[p + 2], 2654435761 | 0) >>> (32 - HB);
  let i = 0, first = 1, lit0 = 0;
  while (i < n) {
    let best = 0, bd = 0;
    if (i + 3 <= n) {
      let p = head[H3(i)], tries = 64;
      while (p >= 0 && i - p <= WIN && tries--) {
        let l = 0; while (i + l < n && input[p + l] === input[i + l]) l++;
        if (l > best) { best = l; bd = i - p; if (l >= 4096) break; }
        p = prev[p];
      }
    }
    if (best >= 3 && i !== 0) {
      if (i > lit0) { if (!first) putbit(0); putnum(i - lit0 - 1, kc); for (let k = lit0; k < i; k++) ob(input[k]); first = 0; }
      else if (!first) putbit(1);
      putnum(bd - 1, kb); putnum(best - 3, ka);
      for (let k = 0; k < best; k++) { if (i + k + 3 <= n) { const h = H3(i + k); prev[i + k] = head[h]; head[h] = i + k; } }
      i += best; lit0 = i;
    } else {
      if (i + 3 <= n) { const h = H3(i); prev[i] = head[h]; head[h] = i; }
      i++;
    }
  }
  if (n > lit0) { if (!first) putbit(0); putnum(n - lit0 - 1, kc); for (let k = lit0; k < n; k++) ob(input[k]); }
  return out.subarray(0, on);
}

// ---------------------------------------------------------------- reconstrucción de paquetes
function rebuild(orig, repl) {
  const { ver, entries: E } = alarEntries(orig);
  if (ver !== 2) throw new Error('rebuild: ALAR v' + ver);
  const hdrEnd = 0x10 + 16 * E.length;
  const data = {};
  for (const e of E) {
    const d = orig.subarray(e.off, e.off + e.size);
    if (Object.prototype.hasOwnProperty.call(repl, e.name)) {
      const nd = repl[e.name];
      data[e.i] = d.toString('latin1', 0, 4) === 'ALLZ' ? allzCompress(nd, d[5], d[6], d[7]) : nd;
    } else data[e.i] = d;
  }
  const parts = [orig.subarray(0, hdrEnd)]; let pos = hdrEnd;
  const fix = [];
  for (const e of [...E].sort((a, b) => a.off - b.off)) {
    const off = (pos + 0x22 + 31) & ~31;
    if (off - 0x22 > pos) parts.push(Buffer.alloc(off - 0x22 - pos));
    parts.push(orig.subarray(e.off - 0x22, e.off));
    const d = data[e.i]; parts.push(d);
    fix.push([e.hdr + 4, off, d.length]);
    pos = off + d.length;
  }
  const out = Buffer.concat(parts);
  for (const [h, off, len] of fix) { out.writeUInt32BE(off, h); out.writeUInt32BE(len, h + 4); }
  return out;
}
const unz = (d) => (d.toString('latin1', 0, 4) === 'ALLZ' ? allzDecompress(d) : d);
function getNested(top, p) {
  let b = top, rest = p.replace(/^\/+/, '');
  for (;;) {
    b = unz(b);
    const { entries: E } = alarEntries(b);
    let next = null;
    for (const e of E) {
      if (rest === e.name) return unz(b.subarray(e.off, e.off + e.size));
      if (rest.startsWith(e.name + '/')) { next = e; break; }
    }
    if (!next) throw new Error('No encuentro ' + p);
    rest = rest.slice(next.name.length + 1);
    b = b.subarray(next.off, next.off + next.size);
  }
}
function replaceNested(top, p, data) {
  const rest = p.replace(/^\/+/, '');
  const { entries: E } = alarEntries(top);
  for (const e of E) {
    if (rest === e.name) return rebuild(top, { [e.name]: data });
    if (rest.startsWith(e.name + '/')) {
      const inner = unz(top.subarray(e.off, e.off + e.size));
      return rebuild(top, { [e.name]: replaceNested(inner, rest.slice(e.name.length + 1), data) });
    }
  }
  throw new Error('No encuentro ' + p);
}
function applyOps(ops, sources, size) {
  const out = Buffer.alloc(size); let o = 0;
  for (const op of ops) {
    if (op[0] === 'L') { const b = Buffer.from(op[1], 'hex'); b.copy(out, o); o += b.length; }
    else { sources[op[1]].copy(out, o, op[2], op[2] + op[3]); o += op[3]; }
  }
  if (o !== size) throw new Error('tamaño');
  return out;
}

// ---------------------------------------------------------------- construcción completa
// us/jp: carpetas extraídas. dst: carpeta US_VOZ_JP ya enlazada a la versión USA. step(pct) opcional.
function md5File(f) { return md5(fs.readFileSync(f)); }
async function build(recipe, us, jp, dst, step = () => {}, log = () => {}) {
  const R = recipe;
  const side = (s, rel) => path.join(s === 'JP' ? jp : us, ...rel.split('/'));
  const cache = {};
  const csb = (name) => {
    if (cache[name]) return cache[name];
    let b;
    if (name === 'x3_strm_scene.csb') {
      const S = R.scene_csb;
      const srcs = S.sources.map(([s, f, p]) => getNested(fs.readFileSync(side(s, f)), p));
      b = applyOps(S.ops, srcs, S.size);
      if (md5(b) !== S.md5) throw new Error('voices:scene_csb');
    } else {
      const [s, f, p, want] = R.csb[name];
      b = getNested(fs.readFileSync(side(s, f)), p);
      if (md5(b) !== want) throw new Error('voices:' + name);
    }
    return (cache[name] = b);
  };
  const put = (rel, buf) => { const f = path.join(dst, ...rel.split('/')); fs.rmSync(f, { force: true }); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return f; };
  const outs = R.outputs; let k = 0;
  for (const o of outs) {
    k++; step(k / outs.length);
    await new Promise((r) => setImmediate(r));   // deja respirar a la interfaz
    if (o.t === 'jp') {
      const f = path.join(dst, ...o.dst.split('/'));
      fs.rmSync(f, { force: true }); fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.copyFileSync(side('JP', o.src), f);
      if (o.md5 && md5File(f) !== o.md5) throw new Error('verify:jp');
    } else if (o.t === 'csb') {
      put(o.dst, csb(o.csb));
    } else if (o.t === 'pac') {
      let b = fs.readFileSync(side('US', o.src));
      for (const [p, c] of o.replace) b = replaceNested(b, p, csb(c));
      if (md5(b) !== o.md5) throw new Error('voices:' + path.basename(o.dst));
      put(o.dst, b);
      log('  ' + path.basename(o.dst) + ' OK');
    } else if (o.t === 'cpk') {
      const fu = fs.openSync(side('US', o.src_us), 'r'), fj = fs.openSync(side('JP', o.src_jp), 'r');
      const rdAt = (fd, off, len) => { const b = Buffer.alloc(len); let r = 0; while (r < len) { const n = fs.readSync(fd, b, r, len - r, off + r); if (n <= 0) throw new Error('lectura'); r += n; } return b; };
      const usSize = fs.fstatSync(fu).size;
      const head = applyOps(o.head.ops, [rdAt(fu, 0, 0x10000), rdAt(fj, 0, 0x10000)], o.head.size);
      const etoc = applyOps(o.etoc.ops, [rdAt(fu, usSize - o.etoc.tail, o.etoc.tail)], o.etoc.size);
      const f = path.join(dst, ...o.dst.split('/'));
      fs.rmSync(f, { force: true });
      const out = fs.openSync(f, 'w'); const h = require('crypto').createHash('md5');
      const w = (b) => { fs.writeSync(out, b); h.update(b); };
      w(head);
      for (const p of o.plan) {
        if (p[0] === 'Z') { w(Buffer.alloc(p[1])); continue; }
        const fd = p[0] === 'J' ? fj : fu; let left = p[2], off = p[1];
        while (left > 0) { const n = Math.min(left, 4 << 20); w(rdAt(fd, off, n)); off += n; left -= n; }
      }
      w(etoc);
      fs.closeSync(out); fs.closeSync(fu); fs.closeSync(fj);
      if (h.digest('hex').toUpperCase() !== o.md5) throw new Error('voices:X3_STRM_SCENE.cpk');
      log('  X3_STRM_SCENE.cpk OK');
    }
  }
}
module.exports = { build, md5File, alarEntries, allzDecompress, allzCompress, rebuild, getNested, replaceNested };
