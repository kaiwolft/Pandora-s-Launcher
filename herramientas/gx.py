# Decodificadores de texturas GX (Wii) y nombre de textura de Dolphin
import struct, subprocess, os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
FOURCC = {b'G5A3': 5, b'GACC': 14, b'GI8 ': 1, b'GIA8': 3, b'GI4 ': 0, b'GIA4': 2, b'G565': 4, b'GRGB': 6, b'G8 ': 6}
BLK = {0:(8,8,4),1:(8,4,8),2:(8,4,8),3:(4,4,16),4:(4,4,16),5:(4,4,16),6:(4,4,32),14:(8,8,4)}
def xxh64(b):
    p = '/tmp/claude-0/-home-claude/83b869f3-d5b2-55e5-a3fe-9a6a190f140e/scratchpad/_h.bin'
    open(p, 'wb').write(b)
    return subprocess.run([os.path.join(HERE, 'texscan'), '-h', p], capture_output=True, text=True).stdout.strip()
def size(w, h, f):
    bw, bh, bpp = BLK[f]; return ((w+bw-1)//bw*bw) * ((h+bh-1)//bh*bh) * bpp // 8
def c5a3(v):
    if v & 0x8000: r=(v>>10)&31; g=(v>>5)&31; b=v&31; return (r<<3|r>>2, g<<3|g>>2, b<<3|b>>2, 255)
    a=(v>>12)&7; r=(v>>8)&15; g=(v>>4)&15; b=v&15; return (r*17, g*17, b*17, a<<5|a<<2|a>>1)
def c565(v):
    r=(v>>11)&31; g=(v>>5)&63; b=v&31; return (r<<3|r>>2, g<<2|g>>4, b<<3|b>>2, 255)
def decode(data, w, h, f):
    bw, bh, bpp = BLK[f]; W=(w+bw-1)//bw*bw; H=(h+bh-1)//bh*bh
    im = Image.new('RGBA', (W, H)); px = im.load(); p = 0
    for by in range(0, H, bh):
        for bx in range(0, W, bw):
            if f == 14:
                for sub in range(4):
                    sx = bx + (sub % 2)*4; sy = by + (sub//2)*4
                    c0, c1 = struct.unpack('>HH', data[p:p+4]); bits = struct.unpack('>I', data[p+4:p+8])[0]; p += 8
                    a, b = c565(c0), c565(c1)
                    if c0 > c1: pal = [a, b, tuple((2*a[i]+b[i])//3 for i in range(3))+(255,), tuple((a[i]+2*b[i])//3 for i in range(3))+(255,)]
                    else: pal = [a, b, tuple((a[i]+b[i])//2 for i in range(3))+(255,), (0,0,0,0)]
                    for k in range(16):
                        px[sx + k%4, sy + k//4] = pal[(bits >> (30 - 2*k)) & 3]
            elif f in (5, 4, 3):
                for y in range(4):
                    for x in range(4):
                        v = struct.unpack('>H', data[p:p+2])[0]; p += 2
                        if f == 5: c = c5a3(v)
                        elif f == 4: c = c565(v)
                        else: c = (v & 255,)*3 + (v >> 8,)
                        px[bx+x, by+y] = c
            elif f == 1:
                for y in range(4):
                    for x in range(8): v = data[p]; p += 1; px[bx+x, by+y] = (v, v, v, 255)
            elif f == 2:
                for y in range(4):
                    for x in range(8): v = data[p]; p += 1; i=(v&15)*17; a=(v>>4)*17; px[bx+x, by+y] = (i, i, i, a)
            elif f == 0:
                for y in range(8):
                    for x in range(0, 8, 2):
                        v = data[p]; p += 1
                        px[bx+x, by+y] = ((v>>4)*17,)*3+(255,); px[bx+x+1, by+y] = ((v&15)*17,)*3+(255,)
            elif f == 6:
                blk = data[p:p+64]; p += 64
                for k in range(16):
                    a, r = blk[k*2], blk[k*2+1]; g, b = blk[32+k*2], blk[32+k*2+1]
                    px[bx+k%4, by+k//4] = (r, g, b, a)
    return im.crop((0, 0, w, h))
def alig(b):
    """devuelve (w, h, fmt, data) del primer nivel de un .aig"""
    assert b[:4] == b'ALIG'
    fmt = FOURCC.get(b[8:12])
    w, h = struct.unpack('<HH', b[0x10:0x14])
    off = struct.unpack('<I', b[0x1c:0x20])[0]
    if fmt is None: return w, h, None, None
    n = size(w, h, fmt)
    return w, h, fmt, b[off:off+n]
def dolphin_name(w, h, fmt, data):
    return 'tex1_%dx%d_%s_%d' % (w, h, xxh64(data), fmt)
