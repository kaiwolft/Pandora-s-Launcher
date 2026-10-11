import sys, subprocess, os, struct
from dol import Dol
def dis(dolpath, start, n):
    d=Dol(dolpath); b=d.read(start, n*4)
    tmp='/tmp/claude-0/-home-claude/83b869f3-d5b2-55e5-a3fe-9a6a190f140e/scratchpad/_c.bin'
    open(tmp,'wb').write(b)
    hexs=' '.join('0x%02x'%x for x in b)
    out=subprocess.run(['llvm-mc','--disassemble','-triple=powerpc-unknown-unknown','-mcpu=750'],input=hexs,capture_output=True,text=True).stdout
    lines=[l.strip() for l in out.splitlines() if l.strip() and not l.strip().startswith('.text')]
    for i,l in enumerate(lines): print('%08x  %s'%(start+i*4, l))
if __name__=='__main__':
    dis(sys.argv[1], int(sys.argv[2],16), int(sys.argv[3]))
