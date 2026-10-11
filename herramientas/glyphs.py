# Libreria de iconos: mando Xbox Series X y teclado/raton (estilo de los botones del paquete HD)
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import math, functools
SS = 2
BOLD = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
BLACK = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'
XC = {'A': (92, 196, 72), 'B': (232, 74, 60), 'X': (58, 140, 232), 'Y': (244, 196, 48)}

def font(sz, f=BOLD): return ImageFont.truetype(f, sz)

def radial(size, c0, c1, center=(.42, .32), r=1.0):
    import numpy as np
    w, h = size; cx, cy = center[0]*w, center[1]*h; R = r*max(w, h)
    yy, xx = np.mgrid[0:h, 0:w]; t = np.minimum(1, np.hypot(xx-cx, yy-cy)/R)[..., None]
    c0 = np.array(c0[:3], float); c1 = np.array(c1[:3], float)
    rgb = (c0 + (c1-c0)*t).astype('uint8'); a = np.full((h, w, 1), 255, 'uint8')
    return Image.fromarray(np.concatenate([rgb, a], 2), 'RGBA')

def erode(m, r):
    r = max(1, int(r))
    return m.filter(ImageFilter.BoxBlur(r)).point(lambda v: 255 if v >= 250 else (0 if v < 200 else (v-200)*5))
def shape_mask(size, draw_fn):
    m = Image.new('L', size, 0); draw_fn(ImageDraw.Draw(m)); return m

def glossy(size, mask, base0=(78, 80, 86), base1=(22, 23, 26), rim=(10, 10, 12)):
    """Cuerpo oscuro con brillo, borde y sombra (como los botones del paquete HD)."""
    w, h = size
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    sh = Image.new('RGBA', size, (0, 0, 0, 0)); sh.putalpha(mask.filter(ImageFilter.GaussianBlur(w*.03)).point(lambda v: int(v*.55)))
    out.alpha_composite(sh, (0, int(h*.025)))
    body = radial((w//4, h//4), base0, base1, r=.85).resize(size, Image.BILINEAR)
    rimc = Image.new('RGBA', size, rim + (255,))
    out.paste(rimc, (0, 0), mask)
    inner = erode(mask, w*.018)
    out.paste(body, (0, 0), inner)
    # brillo superior
    hl = Image.new('L', size, 0); d = ImageDraw.Draw(hl)
    d.ellipse([w*.12, -h*.35, w*.88, h*.42], fill=70)
    hl = ImageChops.multiply(hl.filter(ImageFilter.GaussianBlur(w*.05)), inner)
    out.paste(Image.new('RGBA', size, (255, 255, 255, 255)), (0, 0), hl)
    return out

def text_c(im, txt, fnt, color, dy=0, shadow=True):
    d = ImageDraw.Draw(im); w, h = im.size
    bb = d.textbbox((0, 0), txt, font=fnt)
    x = (w-(bb[2]-bb[0]))/2-bb[0]; y = (h-(bb[3]-bb[1]))/2-bb[1]+dy
    if shadow: d.text((x, y+w*.012), txt, font=fnt, fill=(0, 0, 0, 160))
    d.text((x, y), txt, font=fnt, fill=color)

def fin(im, out_size):
    return im.resize(out_size, Image.LANCZOS)

# ---------- Xbox ----------
def xbox_face(letter, px=192):
    S = px*SS; size = (S, S)
    m = shape_mask(size, lambda d: d.ellipse([S*.06, S*.06, S*.94, S*.94], fill=255))
    im = glossy(size, m)
    text_c(im, letter, font(int(S*.5), BLACK), XC[letter] + (255,), dy=-S*.01)
    return fin(im, (px, px))

def xbox_bumper(label, px=(256, 144), right=False):
    W, H = px[0]*SS, px[1]*SS
    def dr(d):
        d.rounded_rectangle([W*.05, H*.12, W*.95, H*.88], radius=H*.3, fill=255)
    m = shape_mask((W, H), dr)
    # bumper inclinado: esquina superior exterior mas redonda
    if right: m = m.transpose(Image.FLIP_LEFT_RIGHT)
    im = glossy((W, H), m)
    text_c(im, label, font(int(H*.5), BLACK), (236, 236, 236, 255))
    return fin(im, px)

def xbox_trigger(label, px=(192, 192)):
    W, H = px[0]*SS, px[1]*SS
    def dr(d):
        d.rounded_rectangle([W*.2, H*.06, W*.8, H*.94], radius=W*.22, fill=255)
    m = shape_mask((W, H), dr)
    im = glossy((W, H), m)
    text_c(im, label, font(int(H*.3), BLACK), (236, 236, 236, 255), dy=H*.08)
    return fin(im, px)

def xbox_small(kind, px=192):
    S = px*SS; size = (S, S)
    m = shape_mask(size, lambda d: d.ellipse([S*.1, S*.1, S*.9, S*.9], fill=255))
    im = glossy(size, m); d = ImageDraw.Draw(im); c = (236, 236, 236, 255); lw = int(S*.035)
    if kind == 'view':   # dos ventanas superpuestas
        d.rounded_rectangle([S*.30, S*.33, S*.58, S*.55], radius=S*.03, outline=c, width=lw)
        d.rounded_rectangle([S*.42, S*.45, S*.70, S*.67], radius=S*.03, outline=c, width=lw, fill=(40, 41, 45, 255))
    elif kind == 'menu':  # tres lineas
        for k in range(3): d.rounded_rectangle([S*.32, S*(.37+k*.115), S*.68, S*(.37+k*.115)+lw], radius=lw/2, fill=c)
    elif kind == 'share':
        d.rounded_rectangle([S*.33, S*.36, S*.67, S*.64], radius=S*.06, outline=c, width=lw)
        d.line([S*.5, S*.44, S*.5, S*.56], fill=c, width=lw); d.line([S*.44, S*.50, S*.5, S*.44, S*.56, S*.50], fill=c, width=lw)
    elif kind == 'xbox':
        d.ellipse([S*.3, S*.3, S*.7, S*.7], outline=c, width=lw)
        d.line([S*.38, S*.36, S*.62, S*.64], fill=c, width=lw); d.line([S*.62, S*.36, S*.38, S*.64], fill=c, width=lw)
    return fin(im, (px, px))

def xbox_stick(side, arrows='', px=192, click=False):
    S = px*SS; size = (S, S)
    m = shape_mask(size, lambda d: d.ellipse([S*.06, S*.06, S*.94, S*.94], fill=255))
    im = glossy(size, m, base0=(64, 66, 72), base1=(16, 16, 18))
    d = ImageDraw.Draw(im); c = (236, 236, 236, 255)
    d.ellipse([S*.24, S*.24, S*.76, S*.76], outline=(120, 122, 128, 255), width=int(S*.02))
    text_c(im, side + ('3' if click else ''), font(int(S*(.3 if click else .36)), BLACK), c)
    a = S*.07
    for ch in arrows:
        if ch == 'u': d.polygon([(S*.5, S*.08), (S*.5-a, S*.08+a*1.2), (S*.5+a, S*.08+a*1.2)], fill=c)
        if ch == 'd': d.polygon([(S*.5, S*.92), (S*.5-a, S*.92-a*1.2), (S*.5+a, S*.92-a*1.2)], fill=c)
        if ch == 'l': d.polygon([(S*.08, S*.5), (S*.08+a*1.2, S*.5-a), (S*.08+a*1.2, S*.5+a)], fill=c)
        if ch == 'r': d.polygon([(S*.92, S*.5), (S*.92-a*1.2, S*.5-a), (S*.92-a*1.2, S*.5+a)], fill=c)
    return fin(im, (px, px))

def dpad(hi='', px=224):
    """Cruceta; hi = direcciones resaltadas ('u','d','l','r' o '' para todas apagadas)."""
    S = px*SS; size = (S, S); t = .32
    def dr(d):
        d.rounded_rectangle([S*(.5-t/2), S*.06, S*(.5+t/2), S*.94], radius=S*.06, fill=255)
        d.rounded_rectangle([S*.06, S*(.5-t/2), S*.94, S*(.5+t/2)], radius=S*.06, fill=255)
    m = shape_mask(size, dr)
    im = glossy(size, m, base0=(70, 72, 78), base1=(26, 27, 30))
    d = ImageDraw.Draw(im); a = S*.075
    pts = {'u': [(S*.5, S*.13), (S*.5-a, S*.13+a*1.3), (S*.5+a, S*.13+a*1.3)],
           'd': [(S*.5, S*.87), (S*.5-a, S*.87-a*1.3), (S*.5+a, S*.87-a*1.3)],
           'l': [(S*.13, S*.5), (S*.13+a*1.3, S*.5-a), (S*.13+a*1.3, S*.5+a)],
           'r': [(S*.87, S*.5), (S*.87-a*1.3, S*.5-a), (S*.87-a*1.3, S*.5+a)]}
    for k, p in pts.items():
        d.polygon(p, fill=(250, 250, 250, 255) if k in hi else (110, 112, 118, 255))
    return fin(im, (px, px))

# ---------- Teclado y raton ----------
def key(label, px=(192, 192), wide=None):
    W, H = px[0]*SS, px[1]*SS
    def dr(d): d.rounded_rectangle([W*.07, H*.07, W*.93, H*.93], radius=min(W, H)*.16, fill=255)
    m = shape_mask((W, H), dr)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sh.putalpha(m.filter(ImageFilter.GaussianBlur(W*.02)).point(lambda v: int(v*.5)))
    out.alpha_composite(sh, (0, int(H*.03)))
    out.paste(Image.new('RGBA', (W, H), (12, 12, 14, 255)), (0, 0), m)
    skirt = erode(m, min(W, H)*.015)
    out.paste(Image.new('RGBA', (W, H), (40, 41, 46, 255)), (0, 0), skirt)
    top = Image.new('L', (W, H), 0)
    ImageDraw.Draw(top).rounded_rectangle([W*.15, H*.12, W*.85, H*.76], radius=min(W, H)*.12, fill=255)
    face = radial((W//4, H//4), (92, 94, 102), (44, 45, 50), center=(.4, .2), r=.9).resize((W, H), Image.BILINEAR)
    out.paste(face, (0, 0), top)
    sub = Image.new('RGBA', (W, H), (0, 0, 0, 0)); 
    n = len(label)
    fs = .42 if n == 1 else (.30 if n <= 3 else (.24 if n <= 5 else .24))
    text_c(sub, label, font(int(min(W, H)*fs) if n == 1 else int(H*fs), BLACK), (240, 240, 240, 255), dy=-H*.075)
    out.alpha_composite(sub)
    return fin(out, px)

def mouse(btn='l', px=192):
    """Raton con boton resaltado: 'l', 'r', 'm' (rueda) o 'move'."""
    S = px*SS; size = (S, S)
    body = [S*.28, S*.08, S*.72, S*.92]
    m = shape_mask(size, lambda d: d.rounded_rectangle(body, radius=S*.2, fill=255))
    im = glossy(size, m, base0=(80, 82, 88), base1=(24, 25, 28))
    d = ImageDraw.Draw(im); c = (12, 12, 14, 255); lw = int(S*.022)
    d.line([S*.28, S*.42, S*.72, S*.42], fill=c, width=lw); d.line([S*.5, S*.08, S*.5, S*.42], fill=c, width=lw)
    hl = (233, 161, 74, 255)
    if btn == 'l': d.rounded_rectangle([S*.31, S*.11, S*.49, S*.40], radius=S*.12, fill=hl)
    if btn == 'r': d.rounded_rectangle([S*.51, S*.11, S*.69, S*.40], radius=S*.12, fill=hl)
    d.rounded_rectangle([S*.46, S*.17, S*.54, S*.33], radius=S*.04, fill=hl if btn == 'm' else (150, 152, 158, 255), outline=c, width=lw//2)
    if btn == 'move':
        a = S*.06; w = (240, 240, 240, 255)
        for p in ([(S*.5, S*.55), (S*.5-a, S*.55+a), (S*.5+a, S*.55+a)], [(S*.5, S*.85), (S*.5-a, S*.85-a), (S*.5+a, S*.85-a)],
                  [(S*.34, S*.70), (S*.34+a, S*.70-a), (S*.34+a, S*.70+a)], [(S*.66, S*.70), (S*.66-a, S*.70-a), (S*.66-a, S*.70+a)]):
            d.polygon(p, fill=w)
    return fin(im, (px, px))

if __name__ == '__main__':
    import sys
    items = [xbox_face(l) for l in 'ABXY'] + [xbox_bumper('LB', (256, 144)), xbox_bumper('RB', (256, 144), True), xbox_trigger('LT'), xbox_trigger('RT'),
             xbox_small('view'), xbox_small('menu'), xbox_stick('L', 'udlr'), xbox_stick('R', 'udlr'), xbox_stick('R', '', click=True), dpad('l'), dpad('r'), dpad('ud'),
             key('E'), key('Q'), key('ESPACIO', (288, 144)), key('SHIFT', (256, 144)), key('TAB', (224, 144)), key('ESC'), key('1'), mouse('l'), mouse('r'), mouse('m'), mouse('move')]
    cols = 9; W = 300; H = 220
    sheet = Image.new('RGB', (cols*W, ((len(items)+cols-1)//cols)*H), (68, 92, 70))
    for i, im in enumerate(items):
        im = im.copy(); im.thumbnail((W-20, H-20)); sheet.paste(im, ((i % cols)*W+10, (i//cols)*H+10), im)
    sheet.save(sys.argv[1])
