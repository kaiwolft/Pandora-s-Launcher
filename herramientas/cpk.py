import utf, struct
def toc(path):
    f=open(path,'rb'); head=f.read(0x800); 
    name,rows=utf.read_utf(head,0x10); h=rows[0]
    f.seek(h['TocOffset']); tb=f.read(h['TocSize']+0x10)
    _,T=utf.read_utf(tb,0x10)
    return h,T
