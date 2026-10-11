# Genera la receta de voces japonesas: el instalador reconstruye los archivos a partir de los discos del usuario
import sys, os, json, hashlib
sys.path.insert(0, '/home/claude/pt/tools')
import alar, allz
E = "/mnt/user-data/uploads/Proyecto Pandoras Tower/extraido/"
P = "/mnt/user-data/uploads/Proyecto Pandoras Tower/parches/voces_jp/"
OUTF = "/home/claude/pt/voz/out/files/"
md5 = lambda b: hashlib.md5(b).hexdigest().upper()
def nested(b, path):
    rest = path.strip('/')
    while True:
        if b[:4] == b'ALLZ': b = allz.decompress(b)
        v, L = alar.entries(b)
        for e in L:
            if rest == e['name']: d = b[e['off']:e['off']+e['size']]; return allz.decompress(d) if d[:4] == b'ALLZ' else d
            if rest.startswith(e['name'] + '/'):
                b = b[e['off']:e['off']+e['size']]; rest = rest[len(e['name'])+1:]; break
        else: raise KeyError(path)
rd = lambda side, rel: open(E + side + '/' + rel, 'rb').read()

# ---------- diff: copias desde fuentes + bytes propios (solo metadatos)
def diff(target, sources, minlen=12):
    idx = []
    for si, s in enumerate(sources):
        d = {}
        for i in range(0, len(s) - 8, 1):
            k = s[i:i+8]
            if k not in d: d[k] = i
        idx.append(d)
    ops = []; lit = bytearray(); i = 0; n = len(target)
    while i < n:
        best = (0, 0, 0)
        k = target[i:i+8]
        for si, s in enumerate(sources):
            p = idx[si].get(k)
            if p is None: continue
            l = 0
            while i + l < n and p + l < len(s) and s[p+l] == target[i+l]: l += 1
            if l > best[0]: best = (l, si, p)
        if best[0] >= minlen:
            if lit: ops.append(['L', lit.hex()]); lit = bytearray()
            ops.append(['C', best[1], best[2], best[0]]); i += best[0]
        else: lit.append(target[i]); i += 1
    if lit: ops.append(['L', lit.hex()])
    nl = sum(len(o[1]) // 2 for o in ops if o[0] == 'L')
    return ops, nl

R = {'version': 1, 'game': 'SX3EXJ', 'jp': 'SX3J01'}
# discos esperados (MD5 de archivos clave)
def tsv(f):
    d = {}
    for l in open(f, encoding='utf-8-sig'):
        t = l.rstrip('\r\n').split('\t')
        if len(t) >= 3: d[t[0].replace('\\', '/')] = (int(t[1]), t[2].upper())
    return d
LU = tsv("/mnt/user-data/uploads/Proyecto Pandoras Tower/logs/lista_US.tsv")
LJ = tsv("/mnt/user-data/uploads/Proyecto Pandoras Tower/logs/lista_JP.tsv")
R['verify'] = {'US': {k: LU[k][1] for k in ('DATA/sys/main.dol', 'DATA/sys/boot.bin', 'DATA/files/sound/ENG/X3_STRM_SCENE.cpk', 'DATA/files/pac/pac_base_lang.aar')},
               'JP': {k: LJ[k][1] for k in ('DATA/sys/main.dol', 'DATA/sys/boot.bin', 'DATA/files/sound/X3_STRM_SCENE.cpk', 'DATA/files/pac/pac_base.aar')}}
R['sizes'] = {'US': sum(v[0] for v in LU.values()), 'JP': sum(v[0] for v in LJ.values()), 'US_files': len(LU)}

# csb japoneses (dentro de los paquetes JP)
CSB = {
 'x3_chr_srs.csb': ['JP', 'DATA/files/pac/pac_hkh0.aar', '/pac_hkh0_sound.aar/sound/x3_chr_srs.csb'],
 'x3_strm_homvce.csb': ['JP', 'DATA/files/pac/pac_hkh0.aar', '/pac_hkh0_sound.aar/sound/x3_strm_homvce.csb'],
 'x3_loa_srs.csb': ['JP', 'DATA/files/pac/pac_hkh2_lord.aar', '/sound/x3_loa_srs.csb'],
 'x3_loa_zer.csb': ['JP', 'DATA/files/pac/pac_sol_lord.aar', '/sound/x3_loa_zer.csb'],
 'x3_chr_end.csb': ['JP', 'DATA/files/pac/pac_base.aar', '/pac_base_sound.aar/sound/x3_chr_end.csb'],
 'x3_strm_voice.csb': ['JP', 'DATA/files/pac/pac_base.aar', '/pac_base_sound.aar/sound/x3_strm_voice.csb'],
}
# csb de escenas fusionado (JP + pistas de camara occidentales)
jsc = nested(rd('JP', 'DATA/files/pac/pac_base.aar'), '/pac_base_sound.aar/sound/x3_strm_scene.csb')
usc = nested(rd('US', 'DATA/files/pac/pac_base_lang.aar'), '/pac_base_sound_eng.aar/sound/eng/x3_strm_scene.csb')
merged = nested(open(OUTF + 'pac_base_lang.aar', 'rb').read(), '/pac_base_sound_eng.aar/sound/eng/x3_strm_scene.csb')
ops, nl = diff(merged, [jsc, usc])
print('csb escenas', len(merged), 'ops', len(ops), 'bytes propios', nl)
R['scene_csb'] = {'sources': [['JP', 'DATA/files/pac/pac_base.aar', '/pac_base_sound.aar/sound/x3_strm_scene.csb'],
                              ['US', 'DATA/files/pac/pac_base_lang.aar', '/pac_base_sound_eng.aar/sound/eng/x3_strm_scene.csb']],
                  'ops': ops, 'size': len(merged), 'md5': md5(merged)}
R['csb'] = CSB
for k, v in CSB.items():
    b = nested(rd(v[0], v[1]), v[2]); v.append(md5(b))
# salidas
OUT = []
for l in open(P + 'reemplazos.txt', encoding='utf-8'):
    l = l.strip()
    if not l or l.startswith('#'): continue
    t, src, dst = l.split('|'); src = src.replace('\\', '/'); dst = dst.replace('\\', '/')
    if t == 'JP': OUT.append({'t': 'jp', 'src': src, 'dst': dst, 'md5': LJ[src][1]})
man = json.load(open(P + 'manifiesto.json'))
LV = json.load(open('/home/claude/pt/voz/us_pack_voice.json'))
for n in ('X3_CHR_SRS.csb', 'X3_STRM_HOMVCE.csb', 'X3_LOA_SRS.csb', 'X3_LOA_ZER.csb'):
    OUT.append({'t': 'csb', 'csb': n.lower(), 'dst': 'DATA/files/sound/ENG/' + n, 'md5': man['files'][n]})
for pac, paths in LV.items():
    rep = [[p, 'x3_strm_scene.csb' if p.endswith('x3_strm_scene.csb') else p.split('/')[-1]] for p in paths]
    OUT.append({'t': 'pac', 'src': 'DATA/files/pac/' + pac, 'dst': 'DATA/files/pac/' + pac, 'replace': rep, 'md5': man['files'][pac]})
# CPK de escenas
head = open(OUTF + 'scene_cpk_head.bin', 'rb').read(); etoc = open(OUTF + 'scene_cpk_etoc.bin', 'rb').read()
ucpk = rd('US', 'DATA/files/sound/ENG/X3_STRM_SCENE.cpk'); jcpk = rd('JP', 'DATA/files/sound/X3_STRM_SCENE.cpk')
hu = ucpk[:0x10000]; et_src = ucpk[-0x4000:]
ops_h, nlh = diff(head, [hu, jcpk[:0x10000]], 8); ops_e, nle = diff(etoc, [et_src], 8)
print('cpk cabecera', len(head), 'propios', nlh, '| etoc', len(etoc), 'propios', nle)
plan = []
for l in open(P + 'scene_cpk_plan.txt'):
    t = l.split()
    if not t: continue
    plan.append([t[0]] + [int(x) for x in t[1:]])
OUT.append({'t': 'cpk', 'dst': 'DATA/files/sound/ENG/X3_STRM_SCENE.cpk', 'src_us': 'DATA/files/sound/ENG/X3_STRM_SCENE.cpk', 'src_jp': 'DATA/files/sound/X3_STRM_SCENE.cpk',
            'head': {'src': ['US_HEAD', 'JP_HEAD'], 'ops': ops_h, 'size': len(head)}, 'etoc': {'ops': ops_e, 'size': len(etoc), 'tail': len(et_src)},
            'plan': plan, 'md5': man['scene_cpk']['md5'], 'size': man['scene_cpk']['size']})
R['outputs'] = OUT
json.dump(R, open('/home/claude/pt/inst/receta_voces.json', 'w'), separators=(',', ':'))
print('salidas', len(OUT), 'json', os.path.getsize('/home/claude/pt/inst/receta_voces.json'))
