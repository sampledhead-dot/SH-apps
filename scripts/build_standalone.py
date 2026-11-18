# Genera portal-standalone.html: el portal en un solo archivo (CSS, JS e imágenes incrustados).
# Uso: python3 scripts/build_standalone.py   (desde la raíz del repo)
import base64, re
def uri(path):
    mt = 'image/svg+xml' if path.endswith('.svg') else 'image/png'
    return 'data:%s;base64,%s' % (mt, base64.b64encode(open(path, 'rb').read()).decode())
html = open('index.html', encoding='utf-8').read()
css = open('styles.css', encoding='utf-8').read()
js = open('app.js', encoding='utf-8').read()
for f in ['logo.png', 'eye-white.png', 'eye-pupil.png', 'eye-lid.png']:
    js = js.replace('"%s"' % f, '"%s"' % uri(f))
js = re.sub(r'local: "(icons/[^"]+)"', lambda m: 'local: "%s"' % uri(m.group(1)), js)
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<link rel="icon" type="image/png" href="icon-192.png">', '<link rel="icon" type="image/png" href="%s">' % uri('icon-192.png'))
html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)
html = html.replace('<script src="app.js"></script>', '<script>\n' + js.replace('</script', '<\\/script') + '\n</script>')
open('portal-standalone.html', 'w', encoding='utf-8').write(html)
print('portal-standalone.html', len(html) // 1024, 'KB')
