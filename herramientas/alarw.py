# Reconstruye un ALAR v2 reemplazando el contenido de algunas entradas (conserva cabecera, ids y nombres)
import struct, subprocess, os, tempfile, alar, allz
HERE = os.path.dirname(os.path.abspath(__file__))
def compress(data, like):
    """Comprime con ALLZ usando los mismos parametros que el bloque original 'like'."""
    ka, kb, kc = like[5], like[6], like[7]
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, 'i'), os.path.join(d, 'o')
        open(a, 'wb').write(data)
        subprocess.run([os.path.join(HERE, 'allzc'), a, b, str(ka), str(kb), str(kc)], check=True, capture_output=True)
        out = open(b, 'rb').read()
    assert allz.decompress(out) == data
    return out
def rebuild(orig, repl):
    """repl: {nombre_entrada: bytes_nuevos_sin_comprimir}. Si la entrada original estaba en ALLZ, se recomprime."""
    v, E = alar.entries(orig); assert v == 2
    hdr_end = 0x10 + 16*len(E)
    new = {}
    for e in E:
        d = orig[e['off']:e['off']+e['size']]
        if e['name'] in repl:
            nd = repl[e['name']]
            new[e['i']] = compress(nd, d) if d[:4] == b'ALLZ' else nd
        else: new[e['i']] = d
    out = bytearray(orig[:hdr_end]); pos = hdr_end
    for e in sorted(E, key=lambda x: x['off']):
        off = (pos + 0x22 + 31) & ~31
        out += b'\0' * (off - 0x22 - len(out))
        out += orig[e['off']-0x22:e['off']]
        d = new[e['i']]; out += d
        struct.pack_into('>II', out, e['hdr']+4, off, len(d))
        pos = len(out)
    return bytes(out)
def replace_nested(top, path, data):
    """path: '/a.aar/b.aar/archivo' tal como lo lista aartree.walk"""
    parts = path.strip('/').split('/')
    # los nombres de entrada pueden contener '/', asi que buscamos por prefijo
    v, E = alar.entries(top)
    rest = path.strip('/')
    for e in E:
        if rest == e['name']:
            return rebuild(top, {e['name']: data})
        if rest.startswith(e['name'] + '/'):
            d = top[e['off']:e['off']+e['size']]
            inner = allz.decompress(d) if d[:4] == b'ALLZ' else d
            new_inner = replace_nested(inner, rest[len(e['name'])+1:], data)
            return rebuild(top, {e['name']: new_inner})
    raise KeyError(path)
