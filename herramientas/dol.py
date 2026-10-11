import struct
class Dol:
    def __init__(s,path):
        b=open(path,'rb').read(); s.b=b; s.secs=[]
        for i in range(18):
            off=struct.unpack('>I',b[i*4:i*4+4])[0]; addr=struct.unpack('>I',b[0x48+i*4:0x4c+i*4])[0]; size=struct.unpack('>I',b[0x90+i*4:0x94+i*4])[0]
            if size: s.secs.append((i<7,off,addr,size))
    def read(s,addr,n):
        for t,off,a,sz in s.secs:
            if a<=addr<a+sz: return s.b[off+addr-a:off+addr-a+n]
    def words(s,text=True):
        for t,off,a,sz in s.secs:
            if t==text:
                for k in range(0,sz,4): yield a+k, struct.unpack('>I',s.b[off+k:off+k+4])[0]
