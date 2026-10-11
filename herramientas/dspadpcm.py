import struct, wave
def decode(data, header, nsmpl):
    coefs = struct.unpack('>16h', header[0x1c:0x3c])
    hist1 = struct.unpack('>h', header[0x40:0x42])[0] if len(header) > 0x42 else 0
    hist2 = struct.unpack('>h', header[0x42:0x44])[0] if len(header) > 0x44 else 0
    out = []; i = 0
    while len(out) < nsmpl and i < len(data):
        ps = data[i]; i += 1
        sc = 1 << (ps & 0xf); ci = (ps >> 4) & 7
        c1, c2 = coefs[ci*2], coefs[ci*2+1]
        for k in range(14):
            if len(out) >= nsmpl or i + k//2 >= len(data): break
            b = data[i + k//2]
            n = (b >> 4) if k % 2 == 0 else (b & 0xf)
            if n >= 8: n -= 16
            s = ((n * sc) << 11) + 1024 + c1*hist1 + c2*hist2
            s >>= 11
            s = max(-32768, min(32767, s))
            out.append(s); hist2 = hist1; hist1 = s
        i += 7
    return out
def write_wav(path, samples, rate, gain=1.0):
    w = wave.open(path, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    w.writeframes(b''.join(struct.pack('<h', max(-32768, min(32767, int(s*gain)))) for s in samples)); w.close()
