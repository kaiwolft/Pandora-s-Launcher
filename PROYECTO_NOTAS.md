# Pandora's Tower - Proyecto launcher (notas para retomar)
Ultima sesion: 7 de octubre de 2026

## Estructura (D:\Proyecto Pandoras Tower)
- `Dolphin-x64\` Dolphin portable (portable.txt). Config en `User\Config`, texturas en `User\Load\Textures\SX3EXJ` (+ `Botones\`).
- `extraido\US|JP\` discos extraidos (DolphinTool). USA = SX3EXJ (trae textos ENG/FRE/GER/ITA/SPA/JPN), JP = SX3J01.
- `juego\US_INGLES\` (enlaces duros) y `juego\US_VOZ_JP\` (voces JP). Se arranca `DATA\sys\main.dol`.
- `parches\voces_jp\` archivos generados + `reemplazos.txt` + `manifiesto.json` (MD5).
- `launcher\ui\` interfaz (index.html, assets, fonts Cinzel/Cormorant, sfx del juego). `launcher\data\botones\xbox|teclado\`.
- `scripts\01..04` pasos reproducibles; `logs\`; `para_claude\` copias sin enlaces para analizar.
- `PRUEBA_VOCES_JP_ESPANOL.bat`: Dolphin -b -C SYSCONF.IPL.LNG=4 (texto en espanol) -> FUNCIONA.

## Formatos (Ganbarion / CRI)
- `.aar` = ALAR v2/v3 (nombres con hash de 2 bytes antes de los datos). Compresion ALLZ (descompresor traducido de main.dol 0x8053fe1c; compresor propio allzc).
- Sonido CRI ADX2 antiguo: `.csb` (tablas @UTF: CUE/SYNTH/SOUND_ELEMENT, audio DSP-ADPCM "ADPCM_WII") y `.cpk` (streams por nombre).
- Videos `.mo` (Mobiclip); subtitulos en event\message\<IDIOMA>\*.msbt.
- Texturas `.aig` = ALIG (cabecera 0x40, formatos G5A3=RGB5A3, GACC=CMPR). Nombre Dolphin = tex1_WxH_XXH64(datos)_fmt.

## Voces japonesas (verificado por el usuario: voces JP + texto espanol OK)
- Se cambian: sound\ENG\X3_STRM_HOMVCE/VOICE.cpk, X3_CHR_END_*, X3_LOA_SRSVC2-5, X3_CHR_SRS, X3_STRM_HOMVCE.csb, X3_LOA_SRS/ZER,
  pac_base_lang.aar (pac_base_sound_eng), pac_sol_lord_eng.aar, 13 pac_h*.aar / pac_hom.aar (csb de Elena dentro), 64 Movie\*.mo,
  32 event\*.aar donde solo cambia el lip-sync (.amt).
- X3_STRM_SCENE.cpk/csb fusionados: JP + 4 pistas EUCam (12 cues STRM_CAMERA_*) que solo existen en occidente.
- Se quedan en ingles: X3_TITLEVC_SRS000-007 (no existen en JP).
- Riesgo pendiente de vigilar: X3_CHR_SRS JP pesa ~300 KB mas.

## Botones (verificado por el usuario)
- Iconos del juego en window/eu/com/resource_texture (help_icon_*), MessageWindow (button_mini_*), title (pressA/pressa2 ENG/SPA).
- Mando clasico emulado. Xbox con POSICION Nintendo: a->B, b->A, x->Y, y->X, L->LT, R->RT, ZL->LB, ZR->RB, +->Menu, -->View.
- Teclado: a=clic izq/Enter, b=Espacio/Retroceso, x=E, y=Q, L=Shift, R=F, ZL=Ctrl, ZR=clic der, +=Esc, -=Tab, cruceta=flechas, WASD, camara=raton.
- Los iconos de Wiimote/Nunchuk (A,B,C,Z,1,2,remo,nun) no se tocaron.

## Pendiente
1. main.js (Electron) del launcher basado en el de The Last Story: lanzar Dolphin, version (US_INGLES/US_VOZ_JP), idioma de texto (SYSCONF.IPL.LNG: 1 ingles, 3 frances, 4 espanol), graficos, controles, cambio de paquete de botones, tiempo de juego.
2. Quitar la pantalla de la correa del Wiimote.
3. Opcional: logros, instalador.

## Instaladores Windows y Linux (9 oct 2026)
- `scripts\07_CREAR_INSTALADORES.bat` -> `INSTALADOR\Windows` (Instalar Pandora's Tower.exe + payload) e `INSTALADOR\Linux`
  (`Instalar_Pandoras_Tower-x86_64.AppImage` + SHA256.txt). Sin el juego: pide las copias USA (SX3EXJ) y JP (SX3J01) del usuario.
- El AppImage se arma en Windows con `instalador\build\appimage.js` (squashfs 4.0 + zlib escrito en JS, runtime tipo 2 de AppImage
  en `instalador\linux\runtime-x86_64`), ejecutado con el Electron del launcher como Node (ELECTRON_RUN_AS_NODE=1).
  Electron Linux 44.5.1: `descargas\` o el de TLS en F:, verificado por SHA256.
- Voces JP en el instalador: `instalador\app\voces.js` + `receta_voces.json` reconstruyen los 19 archivos del parche, el CPK de
  escenas y copian los del disco JP, todo verificado por MD5. La receta solo contiene referencias y metadatos (sin audio del juego).
  Generador: `herramientas\gen_receta.py`.
- Launcher multiplataforma (IS_WIN / IS_LINUX), con lo aprendido en TLS Linux: `ozone-platform-hint=auto`, teclado en
  `XInput2/0/Virtual core keyboard` (raton en `Virtual core pointer`), Linux con PauseOnFocusLost=False y BackgroundInput=True,
  mandos genericos en el menu (botones 2/6/7, cruceta por ejes 4-7 y hat 9), opcion CONTROLES AUTOMATICOS (autoControls=off no
  reescribe WiimoteNew.ini). Puente Linux: `linux\pt_bridge` (fuente `herramientas\pt_bridge.c`, F1 y L3+R3, glibc >= 2.34).
- Probado en el contenedor: AppImage abre el instalador bajo Xvfb, el launcher Linux arranca y escribe WiimoteNew.ini (SDL + XInput2),
  Dolphin.ini y el parche de la correa; voces.js reconstruye y verifica pac/csb/cpk. Falta probar una instalacion real en Linux.
