# Lectura/escritura fiel de tablas @UTF (CRI) para poder modificarlas
import struct
FMT = {0:'>B',1:'>b',2:'>H',3:'>h',4:'>I',5:'>i',6:'>Q',7:'>q',8:'>f'}
class Table:
    def __init__(s, name, cols, rows): s.name, s.cols, s.rows = name, cols, rows   # cols: [(name, storage, type, const)]
def parse(b, off=0):
    size = struct.unpack('>I', b[off+4:off+8])[0]
    t = b[off+8:off+8+size]
    ro, so, do, no = struct.unpack('>IIII', t[:16]); nc, rl, nr = struct.unpack('>HHI', t[16:24])
    def s(o): e = t.index(b'\0', so+o); return t[so+o:e]
    def val(p, ty):
        if ty in FMT: n = struct.calcsize(FMT[ty]); return struct.unpack(FMT[ty], t[p:p+n])[0], p+n
        if ty == 0xa: return s(struct.unpack('>I', t[p:p+4])[0]), p+4
        if ty == 0xb:
            o, l = struct.unpack('>II', t[p:p+8]); return bytes(t[do+o:do+o+l]), p+8
        raise ValueError(ty)
    cols = []; p = 24
    for _ in range(nc):
        fl = t[p]; nm = s(struct.unpack('>I', t[p+1:p+5])[0]); p += 5
        st, ty = fl & 0xf0, fl & 0x0f; c = None
        if st == 0x30: c, p = val(p, ty)
        cols.append([nm, st, ty, c])
    rows = []
    for r in range(nr):
        q = ro + r*rl; row = []
        for nm, st, ty, c in cols:
            if st == 0x50: v, q = val(q, ty)
            else: v = c if st == 0x30 else None
            row.append(v)
        rows.append(row)
    return Table(s(no), cols, rows)
def build(T):
    strings = bytearray(); sidx = {}
    def S(x):
        if x not in sidx: sidx[x] = len(strings); strings.extend(x + b'\0')
        return sidx[x]
    data = bytearray()
    def D(x):
        o = len(data); data.extend(x)
        while len(data) % 8: data.append(0)    # alineacion de los bloques
        return o, len(x)
    S(b'<NULL>'); S(T.name)
    for c in T.cols: S(c[0])
    def enc(v, ty):
        if ty in FMT: return struct.pack(FMT[ty], v)
        if ty == 0xa: return struct.pack('>I', S(v))
        if ty == 0xb:
            if v is None or len(v) == 0: return struct.pack('>II', 0, 0)
            return struct.pack('>II', *D(v))
    colb = bytearray()
    for nm, st, ty, c in T.cols:
        colb.append(st | ty); colb += struct.pack('>I', S(nm))
        if st == 0x30: colb += enc(c, ty)
    rowb = bytearray(); rl = 0
    for i, row in enumerate(T.rows):
        rb = bytearray()
        for (nm, st, ty, c), v in zip(T.cols, row):
            if st == 0x50: rb += enc(v, ty)
        rl = len(rb); rowb += rb
    ro = 24 + len(colb); so = ro + len(rowb)
    pad = (-(so + len(strings))) % 8
    do = so + len(strings) + pad
    t = struct.pack('>IIII', ro, so, do, sidx[T.name]) + struct.pack('>HHI', len(T.cols), rl, len(T.rows))
    t += colb + rowb + strings + b'\0'*pad + data
    return b'@UTF' + struct.pack('>I', len(t)) + t
