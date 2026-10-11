import struct, sys
def entries(b):
    assert b[:4]==b'ALAR', b[:4]
    ver=b[4]; n=struct.unpack('>H',b[6:8])[0]
    out=[]
    if ver==2:
        for i in range(n):
            e=b[0x10+i*16:0x20+i*16]
            off,size,unk=struct.unpack('>III',e[4:16])
            name=b[off-0x22:off-2].split(b'\0')[0].decode('latin1') if off>=0x22 else ''
            out.append(dict(i=i,flag=e[0],id=e[1:4].hex(),off=off,size=size,unk=unk,name=name,magic=b[off:off+4],hdr=0x10+i*16))
    elif ver==3:
        for i in range(n):
            p=struct.unpack('>H',b[0x12+i*2:0x14+i*2])[0]
            e=b[p:p+16]; off,size,unk=struct.unpack('>III',e[4:16])
            name=b[p+18:p+18+256].split(b'\0')[0].decode('latin1')
            out.append(dict(i=i,flag=e[0],id=e[1:4].hex(),off=off,size=size,unk=unk,name=name,magic=b[off:off+4],hdr=p))
    else: raise ValueError('ALAR ver %d'%ver)
    return ver,out
if __name__=='__main__':
    for f in sys.argv[1:]:
        b=open(f,'rb').read(); v,E=entries(b)
        print('==',f,'ver',v,'n',len(E),'len',hex(len(b)))
        for e in E: print('  %3d %02x %s off=%08x size=%08x unk=%08x %-40s %s'%(e['i'],e['flag'],e['id'],e['off'],e['size'],e['unk'],e['name'],e['magic']))
