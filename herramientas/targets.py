import re, sys, os
# bloques GX: formato -> (ancho bloque, alto bloque, bits por pixel)
BLK = {0:(8,8,4),1:(8,4,8),2:(8,4,8),3:(4,4,16),4:(4,4,16),5:(4,4,16),6:(4,4,32),8:(8,8,4),9:(8,4,8),10:(4,4,16),14:(8,8,4)}
def size(w,h,f):
    bw,bh,bpp=BLK[f]; W=(w+bw-1)//bw*bw; H=(h+bh-1)//bh*bh; return W*H*bpp//8
rx=re.compile(r'tex1_(\d+)x(\d+)(_m)?_([0-9a-f]{16})(?:_([0-9a-f]{16}))?_(\d+)')
for line in sys.stdin:
    n=line.strip(); m=rx.search(os.path.basename(n))
    if not m: continue
    w,h,mip,hh,tl,f=int(m[1]),int(m[2]),m[3],m[4],m[5],int(m[6])
    if f not in BLK: continue
    tag=os.path.basename(n).rsplit('.',1)[0]
    print(size(w,h,f), hh, tag)
