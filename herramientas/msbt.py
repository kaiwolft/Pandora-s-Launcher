import struct
def read(b):
    assert b[:8]==b'MsgStdBn'
    be = b[8:10]==b'\xfe\xff'; E='>' if be else '<'
    nsec=struct.unpack(E+'H',b[0xe:0x10])[0]; p=0x20; out={}
    secs={}
    for _ in range(nsec):
        mg=b[p:p+4]; sz=struct.unpack(E+'I',b[p+4:p+8])[0]; secs[mg]=b[p+0x10:p+0x10+sz]; p=(p+0x10+sz+15)&~15
    txt=secs[b'TXT2']; n=struct.unpack(E+'I',txt[:4])[0]; offs=struct.unpack(E+'%dI'%n,txt[4:4+4*n])
    msgs=[]
    for i,o in enumerate(offs):
        end=offs[i+1] if i+1<n else len(txt); s=txt[o:end]; r=''; k=0
        while k+1<len(s):
            c=struct.unpack(E+'H',s[k:k+2])[0]; k+=2
            if c==0: break
            if c==0x0e:
                g,t,l=struct.unpack(E+'HHH',s[k:k+6]); k+=6; prm=s[k:k+l]; k+=l
                r+='[%d.%d:%s]'%(g,t,prm.hex())
            else: r+=chr(c)
        msgs.append(r)
    lbl=[]
    if b'LBL1' in secs:
        L=secs[b'LBL1']; nb=struct.unpack(E+'I',L[:4])[0]
        for j in range(nb):
            cnt,off=struct.unpack(E+'II',L[4+8*j:12+8*j]); q=off
            for _ in range(cnt):
                ln=L[q]; name=L[q+1:q+1+ln].decode(); idx=struct.unpack(E+'I',L[q+1+ln:q+5+ln])[0]; lbl.append((idx,name)); q+=5+ln
    names=dict(lbl)
    return [(names.get(i,str(i)),m) for i,m in enumerate(msgs)]
if __name__=='__main__':
    import sys
    for f in sys.argv[1:]:
        print('==',f.split('/')[-1])
        for n,m in read(open(f,'rb').read()): print('  %-20s %s'%(n,m.replace('\n',' / ')))
