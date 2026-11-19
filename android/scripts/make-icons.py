#!/usr/bin/env python3
"""Genera los iconos ADAPTATIVOS de Android a partir de desktop/icons/<id>.png (1024 px).

Android 8+ recorta los iconos con la forma del móvil (círculo, squircle, cuadrado redondeado…). Si la app solo trae un
PNG, el sistema lo mete dentro de una placa blanca: eso es lo que se veía en las primeras versiones.
Un icono adaptativo tiene dos capas de 108 dp, de las que se ven ~72 dp en el centro:
  - fondo: un color liso (el del propio icono, para que no se note la unión);
  - dibujo: el icono, centrado y a un tamaño que depende de su forma (ver AJUSTE).
Además se genera la capa monocroma (iconos temáticos de Android 13+).

Uso: python3 android/scripts/make-icons.py [--preview salida.png]
Escribe android/icons/<id>/mipmap-*/ic_launcher*.png, mipmap-anydpi-v26/ic_launcher*.xml y values/ic_launcher_background.xml.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APPS = json.load(open(os.path.join(ROOT, 'desktop', 'apps.json')))['apps']

# tamaño del dibujo en dp (de 108) y de dónde sale el color de fondo
#  - "a sangre": el dibujo llena todo el cuadrado → se agranda un poco para que cubra cualquier forma (los bordes no importan)
#  - "redondeado": cuadrado de esquinas redondas → el fondo es su mismo color, así sus esquinas desaparecen
#  - "marco" (Chuleta, Sample Pack Builder): su borde fino de color quedaría cortado a trozos en las formas redondas →
#    se agranda para que el borde quede fuera de la parte visible y solo se vea el fondo oscuro con el dibujo
#  - "circulo": FuzzHead, círculo naranja con etiqueta → fondo naranja y algo más pequeño para que la etiqueta no se corte
AJUSTE = {
    'sampler':   {'dp': 80, 'fondo': 'borde'},
    'crazyhead': {'dp': 80, 'fondo': 'borde'},
    'poppads':   {'dp': 80, 'fondo': 'borde'},
    'tuner':     {'dp': 80, 'fondo': 'borde'},
    'editor':    {'dp': 78, 'fondo': (0.5, 0.06)},
    'tonopad':   {'dp': 80, 'fondo': (0.5, 0.06)},
    'chuleta':   {'dp': 84, 'fondo': (0.5, 0.12)},
    'spb':       {'dp': 88, 'fondo': (0.12, 0.5)},
    'fuzzhead':  {'dp': 72, 'fondo': '#D9600B'},
}
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def color_de(im, how):
    if isinstance(how, str) and how.startswith('#'):
        return tuple(int(how[i:i + 2], 16) for i in (1, 3, 5))
    px = im.load(); w, h = im.size
    if how == 'borde':   # media de la franja exterior (3 %)
        b = max(2, w * 3 // 100); acc = [0, 0, 0]; n = 0
        for x in range(0, w, 4):
            for y in list(range(0, b, 2)) + list(range(h - b, h, 2)):
                r, g, bb, a = px[x, y]
                if a > 200: acc[0] += r; acc[1] += g; acc[2] += bb; n += 1
        for y in range(0, h, 4):
            for x in list(range(0, b, 2)) + list(range(w - b, w, 2)):
                r, g, bb, a = px[x, y]
                if a > 200: acc[0] += r; acc[1] += g; acc[2] += bb; n += 1
        return tuple(round(c / n) for c in acc)
    fx, fy = how   # media de un cuadradito alrededor de ese punto
    cx, cy, s = int(fx * w), int(fy * h), max(3, w // 100); acc = [0, 0, 0]; n = 0
    for x in range(cx - s, cx + s):
        for y in range(cy - s, cy + s):
            r, g, bb, a = px[x, y]
            if a > 200: acc[0] += r; acc[1] += g; acc[2] += bb; n += 1
    return tuple(round(c / n) for c in acc)


def capas(id_, size_px):
    src = Image.open(os.path.join(ROOT, 'desktop', 'icons', id_ + '.png')).convert('RGBA')
    aj = AJUSTE[id_]
    bg = color_de(src, aj['fondo'])
    s = round(size_px * aj['dp'] / 108)
    fg = Image.new('RGBA', (size_px, size_px), (0, 0, 0, 0))
    fg.alpha_composite(src.resize((s, s), Image.LANCZOS), ((size_px - s) // 2, (size_px - s) // 2))
    return bg, fg, src


def monocromo(id_, size_px):
    """Silueta para los iconos temáticos: lo que se distingue del fondo, en blanco con alfa."""
    bg, fg, _ = capas(id_, size_px)
    solid = Image.new('RGBA', fg.size, bg + (255,))
    diff = ImageChops.difference(Image.alpha_composite(solid, fg).convert('RGB'), solid.convert('RGB')).convert('L')
    alpha = diff.point(lambda v: 255 if v > 60 else int(v * 255 / 60))
    alpha = ImageChops.multiply(alpha, fg.split()[3])
    m = Image.new('RGBA', fg.size, (255, 255, 255, 0)); m.putalpha(alpha)
    return m


def write(id_):
    out = os.path.join(ROOT, 'android', 'icons', id_)
    for d, k in DENS.items():
        dd = os.path.join(out, 'mipmap-' + d); os.makedirs(dd, exist_ok=True)
        px = round(108 * k)
        bg, fg, src = capas(id_, px)
        fg.save(os.path.join(dd, 'ic_launcher_foreground.png'), optimize=True)
        monocromo(id_, px).save(os.path.join(dd, 'ic_launcher_monochrome.png'), optimize=True)
        # icono clásico (sin placa) para lanzadores antiguos: fondo + dibujo, recortado en cuadrado redondeado
        lp = round(48 * k); full = Image.new('RGBA', (px, px), bg + (255,)); full.alpha_composite(fg)
        cut = round(px * 18 / 108); leg = full.crop((cut, cut, px - cut, px - cut)).resize((lp, lp), Image.LANCZOS)
        mask = Image.new('L', (lp, lp), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, lp - 1, lp - 1), radius=lp * 0.22, fill=255)
        leg.putalpha(ImageChops.multiply(leg.split()[3], mask))
        leg.save(os.path.join(dd, 'ic_launcher.png'), optimize=True)
        leg.save(os.path.join(dd, 'ic_launcher_round.png'), optimize=True)
    any_ = os.path.join(out, 'mipmap-anydpi-v26'); os.makedirs(any_, exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@color/ic_launcher_background"/>\n'
           '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
           '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>\n')
    for n in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        open(os.path.join(any_, n), 'w').write(xml)
    vd = os.path.join(out, 'values'); os.makedirs(vd, exist_ok=True)
    bg = capas(id_, 108)[0]
    open(os.path.join(vd, 'ic_launcher_background.xml'), 'w').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#%02X%02X%02X</color>\n</resources>\n' % bg)
    return bg


def preview(path):
    """Cómo se verá con las formas más comunes de los móviles."""
    shapes = ['círculo', 'squircle', 'cuadrado redondeado', 'gota']
    S = 180; ids = [a['id'] for a in APPS if a['id'] in AJUSTE]
    sheet = Image.new('RGBA', (len(ids) * (S + 20) + 20, len(shapes) * (S + 20) + 20), (70, 70, 70, 255))
    for j, sh in enumerate(shapes):
        m = Image.new('L', (S, S), 0); dr = ImageDraw.Draw(m)
        if sh == 'círculo': dr.ellipse((0, 0, S - 1, S - 1), fill=255)
        elif sh == 'squircle':
            for x in range(S):
                for y in range(S):
                    u, v = abs(2 * x / (S - 1) - 1), abs(2 * y / (S - 1) - 1)
                    if u ** 4 + v ** 4 <= 1: m.putpixel((x, y), 255)
        elif sh == 'cuadrado redondeado': dr.rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 0.16, fill=255)
        else: dr.rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 0.5, fill=255); dr.rectangle((S // 2, S // 2, S - 1, S - 1), fill=255)
        for i, id_ in enumerate(ids):
            px = round(S * 108 / 72); bg, fg, _ = capas(id_, px)
            full = Image.new('RGBA', (px, px), bg + (255,)); full.alpha_composite(fg)
            c = (px - S) // 2; vis = full.crop((c, c, c + S, c + S)); vis.putalpha(m)
            sheet.alpha_composite(vis, (20 + i * (S + 20), 20 + j * (S + 20)))
    sheet.save(path)


if __name__ == '__main__':
    for id_ in AJUSTE:
        print(id_, 'fondo #%02X%02X%02X' % write(id_))
    if '--preview' in sys.argv: preview(sys.argv[sys.argv.index('--preview') + 1])
