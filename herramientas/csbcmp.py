import alar, utf, sys
S="/tmp/claude-0/-home-claude/83b869f3-d5b2-55e5-a3fe-9a6a190f140e/scratchpad/"
def csb_from_aar(path, ent):
    d=open(path,"rb").read(); v,E=alar.entries(d); e=[x for x in E if x["name"]==ent][0]; return d[e["off"]:e["off"]+e["size"]]
def tables(c):
    name,rows=utf.read_utf(c); T={}
    for r in rows:
        if isinstance(r.get("utf"),tuple): T[r["name"]]=utf.read_utf(c,r["utf"][1])[1]
    return T
def cmp(a,b,label):
    A=tables(a); B=tables(b)
    ca={r["name"]:r["id"] for r in A["CUE"]}; cb={r["name"]:r["id"] for r in B["CUE"]}
    print("==",label,"cues JP",len(ca),"US",len(cb))
    onlyU=sorted(set(cb)-set(ca)); onlyJ=sorted(set(ca)-set(cb))
    diffid=[n for n in set(ca)&set(cb) if ca[n]!=cb[n]]
    print("  solo US:",onlyU[:40]); print("  solo JP:",onlyJ[:40]); print("  id distinto:",diffid[:20])
    return A,B
if __name__=="__main__":
    E="/mnt/user-data/uploads/Proyecto Pandoras Tower/extraido/"
    for jp,us in (("sound/x3_strm_scene.csb","sound/eng/x3_strm_scene.csb"),("sound/x3_strm_voice.csb","sound/eng/x3_strm_voice.csb"),("sound/x3_chr_end.csb","sound/eng/x3_chr_end.csb")):
        cmp(csb_from_aar(S+"JP_pac_base_sound.aar",jp), csb_from_aar(S+"sound_eng.aar",us), jp)
    cmp(open(E+"JP/DATA/files/sound/X3_CHR_END_L.csb","rb").read(), open(E+"US/DATA/files/sound/ENG/X3_CHR_END_L.csb","rb").read(),"X3_CHR_END_L")
