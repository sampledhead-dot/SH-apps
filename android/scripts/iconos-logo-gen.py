# Iconos de la familia Sampled Head con el formato del logo: círculo naranja con sombra, aparato en crema con huecos naranjas,
# pegatina negra inclinada con el nombre. 512×512 (se exporta a 1024).
O='#d9600b';OS='#a94a07';C='#f3efe9';K='#111111';A='#ef7a22'
def wrap(body,label,mask=False,fs=44):
    bg=f'<rect width="512" height="512" fill="{O}"/>' if mask else ''
    lab=f'''<g transform="rotate(-4 256 440)"><rect x="{256-max(150,len(label)*fs*0.34+28)}" y="408" width="{2*max(150,len(label)*fs*0.34+28)}" height="64" rx="6" fill="{K}"/>
<text x="256" y="455" text-anchor="middle" font-family="Fira Sans" font-weight="900" font-style="italic" font-size="{fs}" fill="{C}" letter-spacing="1">{label}</text></g>''' if label else ''
    sc='translate(256 236) scale(0.86) translate(-256 -236)' if mask else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{bg}<g transform="{sc}">
<circle cx="256" cy="246" r="226" fill="{OS}"/><circle cx="256" cy="236" r="226" fill="{O}"/>{body}{lab}</g></svg>'''
I={}
# CHULETA: tarjeta de chuleta con pinza y rejilla de pads
I['chuleta']=('CHULETA',f'''<g transform="rotate(-6 256 220)">
<rect x="146" y="70" width="220" height="300" rx="10" fill="{C}"/>
<rect x="206" y="56" width="100" height="34" rx="8" fill="{K}"/><circle cx="256" cy="66" r="7" fill="{O}"/>
<rect x="170" y="112" width="172" height="20" rx="3" fill="{O}"/>
<g fill="{K}"><rect x="170" y="146" width="40" height="12" rx="2"/><rect x="216" y="146" width="12" height="12" rx="2"/><rect x="234" y="146" width="108" height="12" rx="2" fill="{A}"/>
<rect x="170" y="170" width="28" height="12" rx="2"/><rect x="204" y="170" width="12" height="12" rx="2"/><rect x="222" y="170" width="120" height="12" rx="2" fill="{A}"/></g>
<g fill="{O}">{''.join(f'<rect x="{180+c*40}" y="{204+r*40}" width="30" height="30" rx="3"/>' for r in range(4) for c in range(4))}</g>
<g fill="{K}"><rect x="220" y="244" width="30" height="30" rx="3"/><rect x="300" y="284" width="30" height="30" rx="3"/></g></g>''')
# EDITOR: aparato con pantalla y forma de onda
I['editor']=('EDITOR',f'''<rect x="120" y="86" width="272" height="272" rx="12" fill="{C}"/>
<rect x="142" y="108" width="228" height="150" rx="6" fill="{K}"/>
<g fill="{C}">{''.join(f'<rect x="{154+i*16}" y="{183-h}" width="9" height="{2*h}" rx="4"/>' for i,h in enumerate([10,22,40,58,30,64,44,24,52,36,18,28,12,6]))}</g>
<rect x="258" y="114" width="5" height="138" fill="{O}"/>
<g fill="{O}"><circle cx="170" cy="300" r="20"/><circle cx="226" cy="300" r="20"/><rect x="266" y="282" width="100" height="14" rx="3"/><rect x="266" y="306" width="64" height="14" rx="3"/></g>
<path d="M164 291 l14 9 -14 9z" fill="{C}"/><rect x="219" y="293" width="14" height="14" fill="{C}"/>''')
# TONOPAD: 4x4 pads partidos (arriba/abajo) con perillas
I['tonopad']=('TONOPAD',f'''<rect x="126" y="66" width="260" height="304" rx="12" fill="{C}"/>
<g fill="{O}"><circle cx="166" cy="104" r="16"/><circle cx="214" cy="104" r="16"/></g><g fill="{C}"><rect x="164" y="90" width="4" height="14"/><rect x="212" y="90" width="4" height="14"/></g>
<rect x="246" y="92" width="116" height="26" rx="4" fill="{K}"/><g fill="{A}"><rect x="254" y="100" width="34" height="10" rx="2"/><rect x="294" y="100" width="20" height="10" rx="2" fill="{C}"/></g>
<g fill="{O}">{''.join(f'<rect x="{150+c*54}" y="{140+r*54}" width="44" height="44" rx="5"/>' for r in range(2) for c in range(4))}</g>
<g fill="{K}">{''.join(f'<rect x="{150+c*54}" y="{256+r*54}" width="44" height="44" rx="5"/>' for r in range(2) for c in range(4))}</g>
<rect x="150" y="247" width="206" height="4" rx="2" fill="{A}"/>''')
# TUNER: afinador con aguja
I['tuner']=('TUNER',f'''<rect x="120" y="76" width="272" height="290" rx="14" fill="{C}"/>
<rect x="144" y="100" width="224" height="150" rx="8" fill="{K}"/>
<g stroke="{C}" stroke-width="6" stroke-linecap="round">{''.join(f'<line x1="{256+110*__import__("math").sin(a)}" y1="{240-110*__import__("math").cos(a)}" x2="{256+(92 if i%3 else 84)*__import__("math").sin(a)}" y2="{240-(92 if i%3 else 84)*__import__("math").cos(a)}"/>' for i,a in enumerate([x*0.13 for x in range(-6,7)]))}</g>
<line x1="256" y1="240" x2="282" y2="134" stroke="{O}" stroke-width="9" stroke-linecap="round"/><circle cx="256" cy="240" r="13" fill="{O}"/>
<text x="256" y="330" text-anchor="middle" font-family="Fira Sans" font-weight="900" font-size="66" fill="{O}">A</text>
<g fill="{O}"><circle cx="170" cy="310" r="14"/><circle cx="342" cy="310" r="14"/></g>''')
# SPB: caja de sample pack con forma de onda
I['spb']=('SAMPLE PACK',f'''<path d="M136 170 L256 120 L376 170 L376 330 L256 380 L136 330Z" fill="{C}"/>
<path d="M136 170 L256 220 L376 170 L256 120Z" fill="#fffaf2"/><path d="M256 220 L256 380" stroke="{OS}" stroke-width="3"/>
<path d="M136 170 L96 210 L216 262 L256 220Z" fill="{C}" stroke="{OS}" stroke-width="2"/><path d="M376 170 L416 210 L296 262 L256 220Z" fill="{C}" stroke="{OS}" stroke-width="2"/>
<g fill="{O}">{''.join(f'<rect x="{150+i*13}" y="{300-h+i*0}" width="8" height="{2*h}" rx="4" transform="skewY(22.6) translate(0 {-62-i*0})"/>' for i,h in enumerate([10,24,36,20,40,28,14]))}</g>
<g fill="{K}">{''.join(f'<rect x="{272+i*13}" y="{300-h}" width="8" height="{2*h}" rx="4" transform="skewY(-22.6) translate(0 {124})"/>' for i,h in enumerate([14,30,22,38,18,26,10]))}</g>''',36)
# POCKETHEAD: pedal multiefectos de bolsillo
I['pockethead']=('POCKETHEAD',f'''<rect x="150" y="62" width="212" height="316" rx="18" fill="{C}"/>
<rect x="172" y="86" width="168" height="92" rx="6" fill="{K}"/>
<rect x="184" y="100" width="90" height="10" rx="2" fill="{C}"/><g fill="{O}"><rect x="184" y="124" width="30" height="34" rx="3"/><rect x="220" y="124" width="30" height="34" rx="3" fill="{A}"/><rect x="256" y="124" width="30" height="34" rx="3"/><rect x="292" y="124" width="30" height="34" rx="3" fill="{C}"/></g>
<circle cx="256" cy="232" r="34" fill="{O}"/><rect x="252" y="198" width="8" height="30" rx="3" fill="{C}"/>
<g fill="{K}"><circle cx="196" cy="328" r="26"/><circle cx="316" cy="328" r="26"/></g><g fill="{C}"><circle cx="196" cy="328" r="11"/><circle cx="316" cy="328" r="11"/></g>''',40)
# CRAZYHEAD: aparato con plato en espiral y cortes
I['crazyhead']=('CRAZYHEAD',f'''<rect x="140" y="62" width="232" height="320" rx="14" fill="{C}"/>
<circle cx="256" cy="168" r="82" fill="{K}"/>
<g fill="none" stroke="#3a3632" stroke-width="3"><circle cx="256" cy="168" r="70"/><circle cx="256" cy="168" r="58"/><circle cx="256" cy="168" r="46"/></g>
<path d="M256 168 L256 86 A82 82 0 0 1 327 127Z" fill="{O}"/><path d="M262 160 L268 80 A82 82 0 0 1 341 124Z" fill="{A}" transform="translate(8 -6)"/>
<circle cx="256" cy="168" r="24" fill="{O}"/><circle cx="256" cy="168" r="6" fill="{C}"/>
<g fill="{O}">{''.join(f'<rect x="{164+c*48}" y="{272+r*48}" width="40" height="40" rx="5"/>' for r in range(2) for c in range(4))}</g>
<g fill="{K}"><rect x="212" y="272" width="40" height="40" rx="5"/><rect x="308" y="320" width="40" height="40" rx="5"/></g>''',40)
import os
for k,(lab,body,*fs) in I.items():
    f=fs[0] if fs else 44
    open(f'{k}.svg','w').write(wrap(body,lab,False,f));open(f'{k}-maskable.svg','w').write(wrap(body,lab,True,f))
print(list(I))
