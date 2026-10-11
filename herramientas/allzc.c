// Compresor ALLZ (formato de Ganbarion) - compatible con el descompresor de main.dol 0x8053fe1c
// uso: allzc entrada salida [ka kb kc]
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
static uint8_t *out; static size_t on, ocap;
static size_t slot; static int slotbits; // byte de bits actual y bits usados
static int avail; // bits cargados aun no leidos (simulacion del lector)
static void ob(uint8_t v){ if(on>=ocap){ocap=ocap*2+1024;out=realloc(out,ocap);} out[on++]=v; }
// el lector: need(n) carga bytes nuevos (en la posicion actual de salida) mientras avail<n
static void need(int n){ while(avail<n){ slot=on; ob(0); slotbits=0; avail+=8; } }
// las posiciones de bits se asignan en orden FIFO; guardamos una cola de (byte,bit)
typedef struct{size_t byte;int bit;}BP; static BP *q; static size_t qh,qt,qcap;
static void qpush(size_t b,int bit){ if(qt>=qcap){qcap=qcap*2+4096;q=realloc(q,qcap*sizeof(BP));} q[qt].byte=b;q[qt].bit=bit;qt++; }
static void needq(int n){ // como need() pero registrando posiciones
  while(avail<n){ size_t b=on; ob(0); for(int i=0;i<8;i++) qpush(b,i); avail+=8; } }
static void putbit(int v){ needq(1); BP p=q[qh++]; if(v) out[p.byte]|=1<<p.bit; avail--; }
static void putbits(uint32_t v,int n){ needq(n); for(int i=0;i<n;i++){ BP p=q[qh++]; if((v>>i)&1) out[p.byte]|=1<<p.bit; } avail-=n; }
static void putnum(uint32_t x,int k0){
  int u=0; for(;;){ uint64_t base=(((uint64_t)1<<u)-1)<<k0, nxt=(((uint64_t)1<<(u+1))-1)<<k0; if(x<nxt){ for(int i=0;i<u;i++) putbit(1); putbit(0); putbits((uint32_t)(x-base),k0+u); return;} u++; }
}
#define HB 16
#define WIN (1<<20)
int main(int c,char**v){
  FILE*f=fopen(v[1],"rb"); fseek(f,0,2); long n=ftell(f); fseek(f,0,0); uint8_t*in=malloc(n+8); if(fread(in,1,n,f)!=(size_t)n) return 1; fclose(f);
  int ka=c>4?atoi(v[3]):1, kb=c>4?atoi(v[4]):11, kc=c>4?atoi(v[5]):1;
  ob('A');ob('L');ob('L');ob('Z');ob(0);ob(ka);ob(kb);ob(kc);
  ob(n&255);ob((n>>8)&255);ob((n>>16)&255);ob((n>>24)&255);
  // byte 12: el bit 0 se descarta; bits 1..7 disponibles
  { size_t b=on; ob(0); for(int i=1;i<8;i++) qpush(b,i); avail=7; }
  int32_t *head=malloc(sizeof(int32_t)<<HB), *prev=malloc(sizeof(int32_t)*(size_t)n+4);
  for(int i=0;i<(1<<HB);i++) head[i]=-1;
  #define H3(p) ((((uint32_t)in[p]<<16)|((uint32_t)in[p+1]<<8)|in[p+2])*2654435761u>>(32-HB))
  long i=0; int first=1; long litstart=0; int pending_lit=0; // pending literal run: [litstart,i)
  // estructura: L M ( 1 M | 0 L M )*
  int state=0; // 0 = hay que emitir literales (inicio o tras flag 0)
  // greedy
  long *ml=NULL; (void)ml;
  long lit0=0;
  while(i<n){
    long best=0,bd=0;
    if(i+3<=n){ uint32_t h=H3(i); int32_t p=head[h]; int tries=64;
      while(p>=0 && i-p<=WIN && tries--){ long l=0; while(i+l<n && in[p+l]==in[i+l]) l++; if(l>best){best=l;bd=i-p; if(l>=4096)break;} p=prev[p]; } }
    if(best>=3 && !(i==0)){
      // emitir: si hay literales pendientes -> (si no es el inicio: flag 0) L ; luego M
      if(i>lit0){ if(!first) putbit(0); putnum((uint32_t)(i-lit0-1),kc); for(long k=lit0;k<i;k++) ob(in[k]); first=0; }
      else { if(first){ /* imposible: siempre hay al menos 1 literal al inicio */ } else putbit(1); }
      putnum((uint32_t)(bd-1),kb); putnum((uint32_t)(best-3),ka);
      for(long k=0;k<best;k++){ if(i+k+3<=n){ uint32_t h=H3(i+k); prev[i+k]=head[h]; head[h]=(int32_t)(i+k);} }
      i+=best; lit0=i;
    } else {
      if(i+3<=n){ uint32_t h=H3(i); prev[i]=head[h]; head[h]=(int32_t)i; }
      i++;
    }
  }
  if(n>lit0){ if(!first) putbit(0); putnum((uint32_t)(n-lit0-1),kc); for(long k=lit0;k<n;k++) ob(in[k]); }
  FILE*g=fopen(v[2],"wb"); fwrite(out,1,on,g); fclose(g);
  fprintf(stderr,"%ld -> %zu\n",n,on); return 0;
}
