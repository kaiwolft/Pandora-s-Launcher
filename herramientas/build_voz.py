# Genera el parche de voces japonesas para Pandora's Tower (USA)
import sys, os, struct, hashlib, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import utfw, alar, allz, alarw, csbcmp
E = "/mnt/user-data/uploads/Proyecto Pandoras Tower/extraido/"
S = "/tmp/claude-0/-home-claude/83b869f3-d5b2-55e5-a3fe-9a6a190f140e/scratchpad/"
OUT = "/home/claude/pt/voz/out/"
os.makedirs(OUT + "files", exist_ok=True)
def md5(b): return hashlib.md5(b).hexdigest().upper()

# ---------- 1. CSB de escenas: JP + 12 cues EUCam de la version occidental ----------
J = csbcmp.csb_from_aar(S + "JP_pac_base_sound.aar", "sound/x3_strm_scene.csb")
U = csbcmp.csb_from_aar(S + "sound_eng.aar", "sound/eng/x3_strm_scene.csb")
TJ, TU = utfw.parse(J), utfw.parse(U)
def sub(T, n):
    for r in T.rows:
        if r[0] == n: return r
for tn in (b"CUE", b"SYNTH", b"SOUND_ELEMENT"):
    rj, ru = sub(TJ, tn), sub(TU, tn)
    a, b = utfw.parse(rj[2]), utfw.parse(ru[2])
    names = {r[0] for r in a.rows}
    if tn == b"SYNTH":
        # anadir en la misma posicion relativa (al final, como en la version US)
        extra = [r for r in b.rows if r[0] not in names]
        a.rows += extra
    elif tn == b"CUE":
        extra = [r for r in b.rows if r[0] not in names]
        a.rows = sorted(a.rows + extra, key=lambda r: r[1])
    else:
        extra = [r for r in b.rows if r[0] not in names]
        a.rows = sorted(a.rows + extra, key=lambda r: r[0])
    print(tn, "+%d filas" % len(extra))
    rj[2] = utfw.build(a)
scene_csb = utfw.build(TJ)
# comprobar
_, _ = csbcmp.cmp(scene_csb, U, "escena fusionada")

# ---------- 2. pac_base_lang.aar con pac_base_sound_eng.aar japones ----------
jpsnd = S + "JP_pac_base_sound.aar"
sound_eng = open(S + "sound_eng.aar", "rb").read()
new_sound_eng = alarw.rebuild(sound_eng, {
    "sound/eng/x3_chr_end.csb": csbcmp.csb_from_aar(jpsnd, "sound/x3_chr_end.csb"),
    "sound/eng/x3_strm_scene.csb": scene_csb,
    "sound/eng/x3_strm_voice.csb": csbcmp.csb_from_aar(jpsnd, "sound/x3_strm_voice.csb"),
})
lang = open(E + "US/DATA/files/pac/pac_base_lang.aar", "rb").read()
new_lang = alarw.rebuild(lang, {"pac_base_sound_eng.aar": new_sound_eng})
open(OUT + "files/pac_base_lang.aar", "wb").write(new_lang)
# verificacion: descomprimir y comparar
v, L = alar.entries(new_lang); e = [x for x in L if x["name"] == "pac_base_sound_eng.aar"][0]
assert allz.decompress(new_lang[e["off"]:e["off"]+e["size"]]) == new_sound_eng
print("pac_base_lang.aar", len(lang), "->", len(new_lang))

# ---------- 3. pac_sol_lord_eng.aar ----------
sol = open(E + "US/DATA/files/pac/pac_sol_lord_eng.aar", "rb").read()
jcsb = "/home/claude/pt/voz/jp_csb/"
new_sol = alarw.rebuild(sol, {"sound/eng/x3_loa_srs.csb": open(jcsb + "X3_LOA_SRS.csb", "rb").read(),
                              "sound/eng/x3_loa_zer.csb": open(jcsb + "X3_LOA_ZER.csb", "rb").read()})
open(OUT + "files/pac_sol_lord_eng.aar", "wb").write(new_sol)
print("pac_sol_lord_eng.aar", len(sol), "->", len(new_sol))

# ---------- 4. CSB sueltos extraidos de los paquetes JP ----------
for n in ("X3_CHR_SRS.csb", "X3_STRM_HOMVCE.csb", "X3_LOA_SRS.csb", "X3_LOA_ZER.csb"):
    open(OUT + "files/" + n, "wb").write(open(jcsb + n, "rb").read())

# ---------- 5. Plan para armar X3_STRM_SCENE.cpk (JP + 4 pistas EUCam de la version US) ----------
def cpk_load(p):
    f = open(p, "rb"); pre = f.read(0x800)
    H = utfw.parse(pre, 0x10); h = dict(zip([c[0] for c in H.cols], H.rows[0]))
    f.seek(h[b"TocOffset"]); tb = f.read(h[b"TocSize"]); T = utfw.parse(tb, 0x10)
    f.seek(h[b"EtocOffset"]); eb = f.read(h[b"EtocSize"]); Et = utfw.parse(eb, 0x10)
    cn = [c[0] for c in T.cols]
    return dict(pre=pre, H=H, h=h, tb=tb, T=T, eb=eb, Et=Et, cn=cn)
JPc = cpk_load(E + "JP/DATA/files/sound/X3_STRM_SCENE.cpk")
USc = cpk_load(E + "US/DATA/files/sound/ENG/X3_STRM_SCENE.cpk")
ci = {n: i for i, n in enumerate(USc["cn"])}
key = lambda r: r[ci[b"DirName"]] + b"/" + r[ci[b"FileName"]]
jrows = {key(r): r for r in JPc["T"].rows}
T = USc["T"]; rows = [list(r) for r in T.rows]
srcs = {}
for r in rows:
    k = key(r)
    if k in jrows:
        jr = jrows[k]; srcs[k] = ("J", jr[ci[b"FileOffset"]] + JPc["h"][b"TocOffset"], jr[ci[b"FileSize"]], jr[ci[b"ExtractSize"]])
    else:
        srcs[k] = ("U", r[ci[b"FileOffset"]] + USc["h"][b"TocOffset"], r[ci[b"FileSize"]], r[ci[b"ExtractSize"]])
print("CPK escena: de JP", sum(1 for s in srcs.values() if s[0] == "J"), "| de US", [k.decode() for k, s in srcs.items() if s[0] == "U"])
# orden fisico de los datos = el de la version US (por offset)
order = sorted(rows, key=lambda r: r[ci[b"FileOffset"]])
toc_off = USc["h"][b"TocOffset"]
def build_toc(rows):
    T.rows = rows; u = utfw.build(T)
    return b"TOC " + bytes([0xff, 0, 0, 0]) + struct.pack("<I", len(u)) + b"\0"*4 + u
# primero calcular tamano de la TOC (no depende de los valores numericos)
toc_pkt = build_toc(rows)
content = ((toc_off + len(toc_pkt) + 31) & ~31) + 32
pos = content; plan = []
for r in order:
    k = key(r); s = srcs[k]
    off = (pos + 31) & ~31
    if off > pos: plan.append(("Z", off - pos))
    r[ci[b"FileOffset"]] = off - toc_off; r[ci[b"FileSize"]] = s[2]; r[ci[b"ExtractSize"]] = s[3]
    plan.append((s[0], s[1], s[2])); pos = off + s[2]
toc_pkt = build_toc(rows)
etoc_off = (pos + 31) & ~31
if etoc_off > pos: plan.append(("Z", etoc_off - pos))
etoc_pkt = USc["pre"][:0] + b"ETOC" + bytes([0xff, 0, 0, 0]) + struct.pack("<I", len(utfw.build(USc["Et"]))) + b"\0"*4 + utfw.build(USc["Et"])
assert len(etoc_pkt) == USc["h"][b"EtocSize"]
# cabecera
H = USc["H"]; hc = [c[0] for c in H.cols]; hv = list(H.rows[0])
tot = sum(srcs[key(r)][2] for r in rows)
for k, v in ((b"ContentOffset", content), (b"ContentSize", etoc_off - content), (b"TocSize", len(toc_pkt)),
             (b"EtocOffset", etoc_off), (b"EtocSize", len(etoc_pkt)), (b"EnabledPackedSize", 2*tot), (b"EnabledDataSize", 2*tot), (b"Files", len(rows))):
    hv[hc.index(k)] = v
H.rows = [hv]; hu = utfw.build(H)
pre = bytearray(USc["pre"]); assert len(hu) == 688; pre[0x10:0x10+len(hu)] = hu
head = bytes(pre) + toc_pkt
head += b"\0" * (content - len(head))
open(OUT + "files/scene_cpk_head.bin", "wb").write(head)
open(OUT + "files/scene_cpk_etoc.bin", "wb").write(etoc_pkt)
# armar aqui para verificar
fj = open(E + "JP/DATA/files/sound/X3_STRM_SCENE.cpk", "rb"); fu = open(E + "US/DATA/files/sound/ENG/X3_STRM_SCENE.cpk", "rb")
h = hashlib.md5(); h.update(head); n = len(head)
lines = []
for p in plan:
    if p[0] == "Z": h.update(b"\0"*p[1]); n += p[1]; lines.append("Z %d" % p[1])
    else:
        f = fj if p[0] == "J" else fu; f.seek(p[1]); d = f.read(p[2]); h.update(d); n += p[2]
        lines.append("%s %d %d" % p)
h.update(etoc_pkt); n += len(etoc_pkt)
open(OUT + "files/scene_cpk_plan.txt", "w").write("\n".join(lines) + "\n")
scene_md5 = h.hexdigest().upper()
print("X3_STRM_SCENE.cpk fusionado:", n, "bytes md5", scene_md5)
# comprobar el CPK fusionado leyendo su TOC desde la cabecera generada
chk = utfw.parse(head, 0x10); hh = dict(zip([c[0] for c in chk.cols], chk.rows[0]))
TT = utfw.parse(head[hh[b"TocOffset"]:], 0x10); assert len(TT.rows) == 242

# ---------- 6. Manifiesto ----------
man = {"scene_cpk": {"size": n, "md5": scene_md5},
       "sources_md5": {"JP_SCENE": "4DBF03A906F5865F25FBF8889E721767", "US_SCENE": "3B2F2904E08EFD8C9710BC955D0760D2"},
       "files": {k: md5(open(OUT + "files/" + k, "rb").read()) for k in sorted(os.listdir(OUT + "files"))}}
json.dump(man, open(OUT + "manifiesto.json", "w"), indent=1)
print(json.dumps(man, indent=1))
