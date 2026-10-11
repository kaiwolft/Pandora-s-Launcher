# Descompresor ALLZ (Ganbarion, Pandora's Tower) - traducido de main.dol 0x8053fe1c
import struct
def decompress(src):
    assert src[:4] == b'ALLZ', src[:4]
    ka, kb, kc = src[5], src[6], src[7]          # longitud, distancia, literales
    size = struct.unpack('<I', src[8:12])[0]
    out = bytearray(); p = 13
    buf = src[12] >> 1; nb = 7
    def need(n):
        nonlocal buf, nb, p
        while nb < n:
            buf |= src[p] << nb; p += 1; nb += 8
    def bit():
        nonlocal buf, nb
        need(1); b = buf & 1; buf >>= 1; nb -= 1; return b
    def num(k0):
        nonlocal buf, nb
        n = k0
        while bit(): n += 1
        need(n); v = buf & ((1 << n) - 1); buf >>= n; nb -= n
        if n > k0: v += ((1 << (n - k0)) - 1) << k0
        return v
    def literals():
        nonlocal p
        c = num(kc) + 1
        out.extend(src[p:p+c]); p += c
    def match():
        d = num(kb) + 1; l = num(ka) + 3
        for _ in range(l):
            out.append(out[-d])
    literals()
    while len(out) < size:
        match()
        if len(out) >= size: break
        if bit() == 0:
            literals()
            if len(out) >= size: break
    return bytes(out[:size])
if __name__ == '__main__':
    import sys
    d = decompress(open(sys.argv[1], 'rb').read()); open(sys.argv[2], 'wb').write(d); print(len(d))
