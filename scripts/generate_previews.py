#!/usr/bin/env python3
"""Generate original, explicitly labeled design previews; these are not simulator captures."""
from pathlib import Path
from html import escape
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parents[1]
assets = ROOT / 'Lyrica/Assets.xcassets'
(assets/'Contents.json').write_text(json.dumps({'info': {'author':'xcode','version':1}}, indent=2)+'\n')
(assets/'AccentColor.colorset/Contents.json').write_text(json.dumps({'colors':[{'idiom':'universal','color':{'color-space':'srgb','components':{'red':'0.686','green':'0.294','blue':'0.208','alpha':'1.000'}}}], 'info':{'author':'xcode','version':1}}, indent=2)+'\n')
S = 2048
im=Image.new('RGB',(S,S),'#24241F'); d=ImageDraw.Draw(im)
# The letter is a quiet reading mark, with two aligned strokes suggesting bilingual text.
font=ImageFont.truetype('/usr/share/fonts/opentype/urw-base35/P052-Italic.otf',1450)
d.text((400,150),'l',font=font,fill='#F4EEE2',stroke_width=0)
for y,w in [(1180,360),(1390,250)]:
    d.rounded_rectangle((1120,y,1120+w,y+62),radius=31,fill='#C98466')
im.resize((1024,1024),Image.Resampling.LANCZOS).save(assets/'AppIcon.appiconset/AppIcon.png')
(assets/'AppIcon.appiconset/Contents.json').write_text(json.dumps({'images':[{'filename':'AppIcon.png','idiom':'universal','platform':'ios','size':'1024x1024'}], 'info':{'author':'xcode','version':1}}, indent=2)+'\n')

OUT=ROOT/'docs/previews'; OUT.mkdir(parents=True,exist_ok=True)
W,H=430,932
FG='#25251F'; MUTED='#78776E'; BG='#F7F5EF'; LINE='#E5E1D8'; RUST='#AF4B35'
def txt(x,y,s,size=16,color=FG,weight='400',family='-apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif',anchor='start'):
    return f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{escape(s)}</text>'
def rect(x,y,w,h,fill,rx=0,stroke='none'):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"/>'
def art(x,y,n=68,variant=0):
    # Original abstract album art. No album covers or third-party artwork are embedded.
    palettes=[('#C77F5B','#EDCBA3','#6B554B'),('#6A7770','#D7D4B6','#364C41'),('#766C84','#D6C3B9','#4B4358')]
    a,b,c=palettes[variant%3]
    return rect(x,y,n,n,a,10)+f'<circle cx="{x+n*.75}" cy="{y+n*.28}" r="{n*.28}" fill="{b}"/><path d="M{x},{y+n*.8} Q{x+n*.45},{y+n*.3} {x+n},{y+n*.7} V{y+n} H{x}Z" fill="{c}"/>'
def header():
    return rect(0,0,W,H,BG,32)+txt(30,36,'9:41',15,weight='600')+rect(164,16,102,28,FG,18)+txt(391,36,'▰',18,anchor='end')
def footer(selected):
    out=rect(0,836,W,96,BG)+f'<path d="M0 836 H430" stroke="{LINE}"/>'
    for x,label,icon in [(76,'Search','⌕'),(215,'Library','▤'),(354,'Settings','⚙')]:
        c=RUST if label==selected else MUTED
        out+=txt(x,870,icon,25,c,anchor='middle')+txt(x,892,label,11,c,anchor='middle')
    return out+rect(150,916,130,5,FG,3)
def wrap(body,name):
    s=f'<svg xmlns="http://www.w3.org/2000/svg" width="430" height="932" viewBox="0 0 430 932" role="img" aria-label="Lyrica {name}: illustrated design preview, not a simulator screenshot"><title>Lyrica {name} — design preview</title>{body}</svg>'
    (OUT/(name+'.svg')).write_text(s+'\n')

b=header()+txt(28,98,'Lyrica',38,weight='500',family='Georgia, serif')+txt(29,126,'Every song, a little closer.',15,MUTED)
b+=rect(24,154,382,54,'#EDEAE2',16)+txt(43,188,'⌕',27,MUTED)+txt(76,187,'Song, artist, album or Apple Music link',14,MUTED)
b+=txt(28,245,'FIND YOUR NEXT FAVORITE',11,MUTED,'600')+txt(28,281,'Words beyond borders.',27,family='Georgia, serif')
b+=txt(28,311,'Search a song. Read it in your language.',14,MUTED)
b+=rect(24,346,382,174,'#EAE4D8',20)+txt(46,383,'MADE FOR THE WORDS',10,RUST,'600')+txt(46,418,'Two languages.',24,family='Georgia, serif')+txt(46,448,'One feeling.',24,family='Georgia, serif')+txt(46,490,'On-device translation · No subscription',12,MUTED)
b+=txt(28,566,'Recent searches',19,weight='600')+txt(397,566,'Clear',13,RUST,anchor='end')
for i,s in enumerate(['Spanish acoustic','Luna de papel','French indie']):
    y=610+i*58
    b+=txt(29,y,'◷',22,MUTED)+txt(65,y-1,s,16)+txt(392,y,'↗',19,MUTED,anchor='end')
    if i<2:b+=f'<path d="M65 {y+22} H402" stroke="{LINE}"/>'
wrap(b+footer('Search'),'search')

b=header()+txt(26,91,'‹',32,RUST)+txt(52,87,'Search',15,RUST)+txt(398,89,'♡',27,RUST,anchor='end')
b+=art(26,112,82)+txt(125,140,'Luna de papel',24,family='Georgia, serif')+txt(125,168,'Mar Sol · Original demo',14,MUTED)+txt(125,190,'3:24 · Lyrics reader',12,MUTED)
b+=rect(24,222,382,50,'#EDEAE2',14)+txt(42,253,'Spanish',14,weight='500')+txt(209,253,'→',18,MUTED,anchor='middle')+txt(234,253,'English',14,RUST,'500')+txt(385,253,'⌄',16,RUST,anchor='end')
b+=txt(27,309,'ORIGINAL',10,MUTED,'600')+txt(231,309,'TRANSLATION',10,RUST,'600')+f'<path d="M215 332 V724" stroke="{LINE}"/>'
rows=[(['La luna guarda','mi canción.'],['The moon keeps','my song.']),(['Camino lento','hacia el sol.'],['I walk slowly','toward the sun.']),([],[]),(['Si cambia el viento,'],['If the wind changes,']),(['me quedo aquí.'],['I stay right here.']),(['En cada palabra,'],['In every word,']),(['un mundo para ti.'],['a world for you.'])]
y=354
for i,(left,right) in enumerate(rows):
    if not left:y+=25;continue
    if i==3:b+=rect(17,y-25,396,52,'#EADDD1',10)
    for j,line in enumerate(left):b+=txt(27,y+j*27,line,18,family='Georgia, serif')
    for j,line in enumerate(right):b+=txt(231,y+j*27,line,18,RUST if i==3 else '#66655C',family='Georgia, serif')
    y+=max(len(left),len(right))*27+22
b+=txt(27,779,'Tap a line to keep your place.',12,MUTED)+txt(27,803,'Demo lyrics written for this preview.',10,MUTED)
b+=rect(24,839,382,51,'#EDEAE2',16)+txt(42,871,'Aa',20)+txt(130,870,'Side by side',13,MUTED)+txt(380,870,'⋮',22,MUTED,anchor='end')+rect(150,916,130,5,FG,3)
wrap(b,'reader')

b=header()+txt(27,101,'Your library',36,family='Georgia, serif')+txt(28,131,'Keep the words that stay with you.',15,MUTED)
b+=rect(24,155,382,50,'#EDEAE2',15)+txt(43,188,'⌕',26,MUTED)+txt(76,187,'Search your songs',15,MUTED)
b+=rect(24,224,184,40,FG,12)+txt(116,250,'Favorites',14,'#F7F5EF','500',anchor='middle')+txt(308,250,'Recently viewed',14,MUTED,anchor='middle')
b+=txt(28,304,'SAVED FOR LATER',10,MUTED,'600')+txt(401,304,'3 songs',12,MUTED,anchor='end')
for i,(title,artist,lang) in enumerate([('Luna de papel','Mar Sol','Spanish → English'),('Les heures bleues','Émile Lune','French → English'),('Verso il mare','Luca Riva','Italian → English')]):
    y=327+i*126
    b+=art(25,y,88,i)+txt(129,y+26,title,20,family='Georgia, serif')+txt(129,y+50,artist,14,MUTED)+txt(129,y+75,lang,12,RUST)+txt(397,y+30,'♥',16,RUST,anchor='end')
    if i<2:b+=f'<path d="M129 {y+105} H402" stroke="{LINE}"/>'
b+=rect(24,736,382,65,'#EDEAE2',14)+txt(43,763,'Available offline',13,weight='600')+txt(43,785,'Lyrics saved with your permission.',12,MUTED)
wrap(b+footer('Library'),'library')
print('Generated icon and three original design previews.')
