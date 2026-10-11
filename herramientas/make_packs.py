# Genera los paquetes de texturas: Xbox Series X (posicion Nintendo) y teclado/raton
import sys, os, shutil
sys.path.insert(0, '/home/claude/pt/tex'); sys.path.insert(0, '/home/claude/pt/tools')
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import glyphs as G
S = 6
OUT = '/home/claude/pt/tex/out/'
# nombre Dolphin -> (ancho, alto, papel)
T = {
 'tex1_32x32_e59a1cd4ae9f8060_5': (32, 32, 'a'),        # help_icon_a2
 'tex1_40x40_593b78aa86a840f7_5': (40, 40, 'a_small'),  # help_icon_a2_G001
 'tex1_40x40_99648920b4fc6e5f_5': (40, 40, 'a_glow'),   # help_icon_a2_G002
 'tex1_32x32_a882eca78a844d4d_5': (32, 32, 'b'),
 'tex1_32x32_7f85bffeb65cf7ca_5': (32, 32, 'x'),
 'tex1_32x32_a3205164ffed501b_5': (32, 32, 'y'),
 'tex1_40x32_870590f766458d4e_5': (40, 32, 'L'),
 'tex1_40x32_6f870279459f5309_5': (40, 32, 'R'),
 'tex1_40x32_2e626c3c4f3cf521_5': (40, 32, 'ZL'),
 'tex1_40x32_d89983e0b4970dc5_5': (40, 32, 'ZR'),
 'tex1_32x32_c90ec6ab6a100a5d_5': (32, 32, 'plus'),
 'tex1_32x32_200d0526fbaeab3b_5': (32, 32, 'minus'),
 'tex1_32x32_8ddd02a5974f2acc_5': (32, 32, 'dpad'),
 'tex1_32x32_8eeff7ed5cbe56e0_5': (32, 32, 'dpad_l'),
 'tex1_32x32_e0118c7069ca823e_5': (32, 32, 'dpad_r'),
 'tex1_32x32_53b242787f0f880e_5': (32, 32, 'dpad_lr'),
 'tex1_32x32_cfdbd9603fdb89d7_5': (32, 32, 'dpad_ud'),
 'tex1_40x32_101a5cb065c4c896_5': (40, 32, 'ls'),
 'tex1_40x32_a35f3af38a6585d3_5': (40, 32, 'rs'),
 'tex1_40x32_639eec21a6e2c7ee_5': (40, 32, 'ls'),        # help_icon_stick
 'tex1_40x32_aa03bb6500e74b78_5': (40, 32, 'ls_lr'),
 'tex1_40x40_2da7803e9abd4a4c_5': (40, 40, 'ls_ud'),
 'tex1_48x40_9e7b65e4e7a1d98a_5': (48, 40, 'ls_glow1'),
 'tex1_48x40_19ba798b20519832_5': (48, 40, 'ls_glow2'),
 'tex1_48x48_7d553e2033a9747c_14': (48, 48, 'coin'),     # button_mini_a2
 'tex1_48x48_971392a882be0510_14': (48, 48, 'coin_on'),
 'tex1_48x48_a6448a23aee09961_14': (48, 48, 'coin'),     # button_mini_A
 'tex1_48x48_431c601df41c65b7_14': (48, 48, 'coin_on'),
 'tex1_256x32_0803f454bfa1d21e_5': (256, 32, 'press_en'),
 'tex1_256x32_9bfdd38a8869066d_5': (256, 32, 'press_en'),
 'tex1_256x32_48dc6d46532971fa_5': (256, 32, 'press_es'),
 'tex1_256x32_d67b89775ce34960_5': (256, 32, 'press_es'),
}
ORANGE = (236, 120, 40)
def fit(im, w, h, scale=1.0):
    """centra im dentro de un lienzo w x h ocupando 'scale' del alto/ancho"""
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); im = im.copy()
    im.thumbnail((int(w*scale), int(h*scale)), Image.LANCZOS)
    c.alpha_composite(im, ((w-im.width)//2, (h-im.height)//2)); return c
def glow(im, strength=1.0):
    w, h = im.size; a = im.split()[3]
    ring = Image.new('RGBA', (w, h), ORANGE + (0,))
    m = a.filter(ImageFilter.GaussianBlur(min(w, h)*.07)).point(lambda v: min(255, v*3))
    ring.putalpha(m.point(lambda v: int(min(255, v*1.4*strength))))
    out = Image.new('RGBA', (w, h)); out.alpha_composite(ring); out.alpha_composite(im); return out
def press(word, icon, W, H):
    big = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(big)
    f = ImageFont.truetype('/home/claude/pt/ui/fonts/Cinzel.ttf', int(H*1.0))
    try: f.set_variation_by_axes([800])
    except Exception: pass
    tw = d.textbbox((0, 0), word, font=f)
    icon = icon.copy(); icon.thumbnail((int(H*1.08), int(H*1.08)), Image.LANCZOS)
    gap = int(H*.25); total = (tw[2]-tw[0]) + gap + icon.width
    x0 = (W - total)//2; y = (H - (tw[3]-tw[1]))//2 - tw[1]
    for dx in range(-4, 5, 2):
        for dy in range(-4, 5, 2): d.text((x0+dx, y+dy), word, font=f, fill=(30, 26, 22, 255))
    d.text((x0, y), word, font=f, fill=(242, 238, 228, 255))
    big.alpha_composite(icon, (x0 + (tw[2]-tw[0]) + gap, (H-icon.height)//2))
    return big
# ---------- Xbox ----------
def xbox(role, W, H):
    face = {'a': 'B', 'b': 'A', 'x': 'Y', 'y': 'X'}          # posicion Nintendo: a=derecha, b=abajo, x=arriba, y=izquierda
    if role in face: return fit(G.xbox_face(face[role], 384), W, H, .98)
    if role == 'a_small': return fit(G.xbox_face('B', 384), W, H, .80)
    if role == 'a_glow': return glow(fit(G.xbox_face('B', 384), W, H, .80))
    if role in ('L', 'R'): return fit(G.xbox_trigger('LT' if role == 'L' else 'RT', (384, 384)), W, H, 1.0)
    if role in ('ZL', 'ZR'): return fit(G.xbox_bumper('LB' if role == 'ZL' else 'RB', (512, 288), role == 'ZR'), W, H, .98)
    if role == 'plus': return fit(G.xbox_small('menu', 384), W, H, .98)
    if role == 'minus': return fit(G.xbox_small('view', 384), W, H, .98)
    if role.startswith('dpad'):
        hi = {'dpad': '', 'dpad_l': 'l', 'dpad_r': 'r', 'dpad_lr': 'lr', 'dpad_ud': 'ud'}[role]
        return fit(G.dpad(hi, 384), W, H, .98)
    if role == 'ls': return fit(G.xbox_stick('L', '', 384), W, H, .98)
    if role == 'rs': return fit(G.xbox_stick('R', '', 384), W, H, .98)
    if role == 'ls_lr': return fit(G.xbox_stick('L', 'lr', 384), W, H, .98)
    if role == 'ls_ud': return fit(G.xbox_stick('L', 'ud', 384), W, H, .98)
    if role == 'ls_glow1': return glow(fit(G.xbox_stick('L', 'lr', 384), W, H, .8), .6)
    if role == 'ls_glow2': return glow(fit(G.xbox_stick('L', 'lr', 384), W, H, .8), 1.0)
    if role == 'coin': return fit(G.xbox_face('B', 384), W, H, .9)
    if role == 'coin_on': return glow(fit(G.xbox_face('B', 384), W, H, .82))
    if role == 'press_en': return press('PRESS', G.xbox_face('B', 384), W, H)
    if role == 'press_es': return press('PULSA', G.xbox_face('B', 384), W, H)
    raise KeyError(role)
# ---------- Teclado y raton ----------
def wasd(hi='wasd', size=(480, 384)):
    W, H = size; c = Image.new('RGBA', size, (0, 0, 0, 0)); k = int(H*.5)
    pos = {'W': ((W-k)//2, 0), 'A': ((W-k)//2 - k, H-k), 'S': ((W-k)//2, H-k), 'D': ((W-k)//2 + k, H-k)}
    for ch, (x, y) in pos.items():
        im = G.key(ch, (k, k)).copy()
        if ch.lower() not in hi: im.putalpha(im.split()[3].point(lambda v: v*45//100))
        c.alpha_composite(im, (x, y))
    return c
def arrows(hi, size=(480, 384)):
    W, H = size; c = Image.new('RGBA', size, (0, 0, 0, 0)); k = int(H*.5)
    pos = {'u': ((W-k)//2, 0, '↑'), 'l': ((W-k)//2 - k, H-k, '←'), 'd': ((W-k)//2, H-k, '↓'), 'r': ((W-k)//2 + k, H-k, '→')}
    for ch, (x, y, lab) in pos.items():
        im = G.key(lab, (k, k)).copy()
        if hi and ch not in hi: im.putalpha(im.split()[3].point(lambda v: v*45//100))
        c.alpha_composite(im, (x, y))
    return c
KB = {'a': ('mouse', 'l'), 'b': ('key', 'ESPACIO'), 'x': ('key', 'E'), 'y': ('key', 'Q'),
      'L': ('key', 'SHIFT'), 'R': ('key', 'F'), 'ZL': ('key', 'CTRL'), 'ZR': ('mouse', 'r'),
      'plus': ('key', 'ESC'), 'minus': ('key', 'TAB')}
def kbicon(spec, W, H, scale=.98):
    kind, v = spec
    if kind == 'mouse': return fit(G.mouse(v, 384), W, H, scale)
    n = len(v); kw = 384 if n <= 3 else (512 if n <= 5 else 640)
    return fit(G.key(v, (kw, 320) if n > 3 else (384, 384)), W, H, scale)
def teclado(role, W, H):
    if role in KB: return kbicon(KB[role], W, H)
    if role == 'a_small': return kbicon(KB['a'], W, H, .8)
    if role == 'a_glow': return glow(kbicon(KB['a'], W, H, .8))
    if role.startswith('dpad'):
        hi = {'dpad': '', 'dpad_l': 'l', 'dpad_r': 'r', 'dpad_lr': 'lr', 'dpad_ud': 'ud'}[role]
        return fit(arrows(hi), W, H, .98)
    if role == 'ls': return fit(wasd('wasd'), W, H, .98)
    if role == 'ls_lr': return fit(wasd('ad'), W, H, .98)
    if role == 'ls_ud': return fit(wasd('ws'), W, H, .98)
    if role == 'ls_glow1': return glow(fit(wasd('ad'), W, H, .85), .6)
    if role == 'ls_glow2': return glow(fit(wasd('ad'), W, H, .85), 1.0)
    if role == 'rs': return fit(G.mouse('move', 384), W, H, .98)
    if role == 'coin': return kbicon(KB['a'], W, H, .9)
    if role == 'coin_on': return glow(kbicon(KB['a'], W, H, .82))
    if role == 'press_en': return press('PRESS', G.mouse('l', 384), W, H)
    if role == 'press_es': return press('PULSA', G.mouse('l', 384), W, H)
    raise KeyError(role)
if __name__ == '__main__':
    for pack, fn in (('xbox', xbox), ('teclado', teclado)):
        d = OUT + pack + '/'
        if os.path.exists(d): shutil.rmtree(d)
        os.makedirs(d)
        for name, (w, h, role) in T.items():
            sc = 4 if w >= 256 else S
            im = fn(role, w*sc, h*sc)
            im.save(d + name + '.png', optimize=True)
        print(pack, len(os.listdir(d)))
