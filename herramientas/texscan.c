// Busca datos de textura GX por hash XXH64 (como Dolphin) en archivos, a alineacion de 32 bytes.
// uso: texscan objetivos.txt archivo...   (objetivos: "<len> <hash16hex> <etiqueta>")
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#define P1 11400714785074694791ULL
#define P2 14029467366897019727ULL
#define P3 1609587929392839161ULL
#define P4 9650029242287828579ULL
#define P5 2870177450012600261ULL
#ifndef STEP
#define STEP 4
#endif
static inline uint64_t rotl(uint64_t x,int r){return (x<<r)|(x>>(64-r));}
static inline uint64_t rd64(const uint8_t*p){uint64_t v;memcpy(&v,p,8);return v;}
static inline uint32_t rd32(const uint8_t*p){uint32_t v;memcpy(&v,p,4);return v;}
static inline uint64_t round1(uint64_t a,uint64_t i){a+=i*P2;a=rotl(a,31);a*=P1;return a;}
static inline uint64_t merge(uint64_t a,uint64_t v){v=round1(0,v);a^=v;a=a*P1+P4;return a;}
uint64_t xxh64(const uint8_t*p,size_t len,uint64_t seed){
  const uint8_t*e=p+len;uint64_t h;
  if(len>=32){const uint8_t*lim=e-32;uint64_t v1=seed+P1+P2,v2=seed+P2,v3=seed,v4=seed-P1;
    do{v1=round1(v1,rd64(p));p+=8;v2=round1(v2,rd64(p));p+=8;v3=round1(v3,rd64(p));p+=8;v4=round1(v4,rd64(p));p+=8;}while(p<=lim);
    h=rotl(v1,1)+rotl(v2,7)+rotl(v3,12)+rotl(v4,18);h=merge(h,v1);h=merge(h,v2);h=merge(h,v3);h=merge(h,v4);}
  else h=seed+P5;
  h+=len;
  while(p+8<=e){uint64_t k=round1(0,rd64(p));h^=k;h=rotl(h,27)*P1+P4;p+=8;}
  if(p+4<=e){h^=(uint64_t)rd32(p)*P1;h=rotl(h,23)*P2+P3;p+=4;}
  while(p<e){h^=(*p)*P5;h=rotl(h,11)*P1;p++;}
  h^=h>>33;h*=P2;h^=h>>29;h*=P3;h^=h>>32;return h;}
typedef struct{size_t len;uint64_t h;char tag[96];}T;
int main(int c,char**v){
  if(c>=2&&!strcmp(v[1],"-h")){ // hash de un archivo completo
    FILE*f=fopen(v[2],"rb");fseek(f,0,2);long n=ftell(f);fseek(f,0,0);uint8_t*b=malloc(n);fread(b,1,n,f);printf("%016llx\n",(unsigned long long)xxh64(b,n,0));return 0;}
  FILE*tf=fopen(v[1],"r");T t[4096];int nt=0;char hx[32];
  while(nt<4096&&fscanf(tf,"%zu %31s %95s",&t[nt].len,hx,t[nt].tag)==3){t[nt].h=strtoull(hx,0,16);nt++;}
  size_t lens[64];int nl=0;for(int i=0;i<nt;i++){int k;for(k=0;k<nl;k++)if(lens[k]==t[i].len)break;if(k==nl)lens[nl++]=t[i].len;}
  for(int a=2;a<c;a++){FILE*f=fopen(v[a],"rb");if(!f)continue;fseek(f,0,2);long n=ftell(f);fseek(f,0,0);
    uint8_t*b=malloc(n);if(fread(b,1,n,f)!=(size_t)n){fclose(f);free(b);continue;}fclose(f);
    for(int k=0;k<nl;k++){size_t L=lens[k];for(long o=0;o+(long)L<=n;o+=STEP){uint64_t h=xxh64(b+o,L,0);
      for(int i=0;i<nt;i++)if(t[i].h==h&&t[i].len==L)printf("%s\t%s\t0x%lx\n",t[i].tag,v[a],o);}}
    free(b);}
  return 0;}
