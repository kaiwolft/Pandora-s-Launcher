# Lector de tablas @UTF de CRI (CSB/CPK)
import struct
def read_utf(b, off=0):
    assert b[off:off+4] == b'@UTF', b[off:off+4]
    size = struct.unpack('>I', b[off+4:off+8])[0]
    t = b[off+8:off+8+size]
    rows_off, str_off, data_off, name_off = struct.unpack('>IIII', t[0:16])
    ncol, rowlen, nrows = struct.unpack('>HHI', t[16:24])
    def s(o):
        e = t.index(b'\0', str_off+o); return t[str_off+o:e].decode('cp932', 'replace')
    cols = []; p = 24
    for _ in range(ncol):
        fl = t[p]; nm = s(struct.unpack('>I', t[p+1:p+5])[0]); p += 5
        st = fl & 0xf0; ty = fl & 0x0f; const = None
        if st == 0x30:
            const, p = val(t, p, ty, s, data_off)
        cols.append((nm, st, ty, const))
    rows = []
    for r in range(nrows):
        q = rows_off + r*rowlen; row = {}
        for nm, st, ty, const in cols:
            if st == 0x50: v, q = val(t, q, ty, s, data_off)
            elif st == 0x30: v = const
            else: v = None
            row[nm] = v
        rows.append(row)
    return s(name_off), rows
def val(t, p, ty, s, data_off):
    if ty in (0, 1): return t[p], p+1
    if ty in (2, 3): return struct.unpack('>H' if ty == 2 else '>h', t[p:p+2])[0], p+2
    if ty in (4, 5): return struct.unpack('>I' if ty == 4 else '>i', t[p:p+4])[0], p+4
    if ty in (6, 7): return struct.unpack('>Q' if ty == 6 else '>q', t[p:p+8])[0], p+8
    if ty == 8: return struct.unpack('>f', t[p:p+4])[0], p+4
    if ty == 0xa: return s(struct.unpack('>I', t[p:p+4])[0]), p+4
    if ty == 0xb:
        o, l = struct.unpack('>II', t[p:p+8]); return ('DATA', data_off+o+8, l), p+8   # +8: relativo al inicio de la tabla
    raise ValueError(ty)
def dump(b, off=0, depth=0, maxrows=5):
    name, rows = read_utf(b, off)
    print('  '*depth + '[%s] %d filas' % (name, len(rows)))
    for r in rows[:maxrows]:
        print('  '*depth + '  ' + ', '.join('%s=%s' % (k, (v if not isinstance(v, tuple) else 'DATA(%d)' % v[2])) for k, v in r.items()))
    return name, rows
