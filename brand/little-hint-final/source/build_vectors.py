"""Build Little Hint's outlined SVG masters. Requires fonttools and uharfbuzz."""
from pathlib import Path
from io import BytesIO
import json
import html
import re
import math
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'source/fonts/Fraunces-variable.ttf'
COLORS = {'sienna':'#AA4D37', 'blush':'#E9B5A5', 'ivory':'#FFF8F0', 'umber':'#2B201D', 'darkAccent':'#F1BEAD'}
VARIANTS = ['color', 'dark', 'black', 'white', 'adaptive']
OUTER = 'M96 18H160Q168 18 174 24L206 56Q212 62 212 71V220Q212 238 194 238H62Q44 238 44 220V71Q44 62 50 56L82 24Q88 18 96 18Z'
HEART = 'M128 196C116 187 80 163 80 138C80 113 108 106 128 128C148 106 176 113 176 138C176 163 140 187 128 196Z'
MICRO_HEART = 'M128 189C115 180 75 153 75 126C75 99 107 92 128 116C149 92 181 99 181 126C181 153 141 180 128 189Z'
HOLE = 'M138 54A10 10 0 1 0 118 54A10 10 0 1 0 138 54Z'
# Custom logo lettering, not a modified font file. Keeps Fraunces' stem,
# crossbar and rounded foot while replacing its curled f head with a plain arch.
TAGLINE_F = 'M447 170Q447 139 459 122Q471 105 497 102L590 92Q614 89 625 76Q636 64 636 44Q636 0 584 0H132Q108 0 94 12Q80 23 80 43Q80 63 91 74Q102 86 124 93L166 102Q191 108 204 124Q217 140 217 170V733Q217 756 206 770Q196 783 166 793L119 807Q88 819 74 832Q61 845 61 863Q61 881 73 892Q86 904 108 904H217V1120C217 1328 340 1444 508 1444C592 1444 656 1415 690 1360Q706 1334 699 1315Q691 1296 672 1297Q651 1298 637 1320C606 1356 568 1370 535 1370C474 1370 447 1324 447 1230V904H631Q656 904 669 894Q682 884 682 864Q682 836 657 818Q632 800 576 800H447Z'

def n(value):
    return f'{value:.3f}'.rstrip('0').rstrip('.')

def outline(text, weight=650, opsz=60, soft=65, wonk=1, tracking=0, pair_spacing=None, simple_f=False):
    font = instantiateVariableFont(TTFont(FONT), {'wght':weight,'opsz':opsz,'SOFT':soft,'WONK':wonk}, inplace=True)
    stream = BytesIO(); font.save(stream)
    hfont = hb.Font(hb.Face(stream.getvalue()))
    hfont.scale = (font['head'].unitsPerEm, font['head'].unitsPerEm)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hfont, buf, {'kern':True, 'liga':not simple_f})
    glyphset = font.getGlyphSet(); order=font.getGlyphOrder()
    parts=[]; bounds=[]; x=0; y=0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        glyph=glyphset[order[info.codepoint]]
        px=x+pos.x_offset; py=y+pos.y_offset
        custom_f = simple_f and order[info.codepoint]=='f'
        pen=SVGPathPen(glyphset, ntos=n)
        if custom_f: parse_path(TAGLINE_F,pen)
        else: glyph.draw(pen)
        if pen.getCommands():
            parts.append(f'<path transform="translate({n(px)} {n(py)})" d="{pen.getCommands()}"/>')
            bp=BoundsPen(glyphset)
            if custom_f: parse_path(TAGLINE_F,bp)
            else: glyph.draw(bp)
            a,b,c,d=bp.bounds; bounds.append((a+px,b+py,c+px,d+py))
        pair=text[info.cluster:info.cluster+2]
        x+=pos.x_advance+tracking+(pair_spacing or {}).get(pair,0); y+=pos.y_advance
    x0=min(v[0] for v in bounds); y0=min(v[1] for v in bounds)
    x1=max(v[2] for v in bounds); y1=max(v[3] for v in bounds)
    return f'<g transform="translate({n(-x0)} {n(y1)}) scale(1 -1)">{"".join(parts)}</g>', x1-x0, y1-y0

# Keep the approved letter height and tag proportions while allowing the new name more width.
PAIR_SPACING = {'Li':-20,'tt':-18,'tl':-15,'le':-15,'Hi':-50,'in':-22,'nt':-8,' H':-60}
WORD, WW, WH = outline('Little Hint', pair_spacing=PAIR_SPACING)
WORD_HEIGHT = 95.40783021308606
WORD_WIDTH = WW / WH * WORD_HEIGHT
TAGLINE, TW, TH = outline('Gift ideas, shared thoughtfully.', 480, 60, 65, 1, simple_f=True)
LOGO_WIDTH = math.ceil(216 + WORD_WIDTH + 26)
TAGLINE_GAP = 12
TAGLINE_Y = 50 + WORD_HEIGHT + TAGLINE_GAP
TAGLINE_WIDTH = WORD_WIDTH * .86
TAGLINE_HEIGHT = TH/TW*TAGLINE_WIDTH
# Match the tag's lower edge to the bottom of the complete text block.
angle=math.radians(14); c=math.cos(angle); s=math.sin(angle)
tag_bounds=BoundsPen(None)
parse_path(OUTER,TransformPen(tag_bounds,(c,s,-s,c,128-128*c+128*s,128-128*s-128*c)))
TAGLINE_TAG_SCALE=.78
TAGLINE_TAG_CY=TAGLINE_Y+TAGLINE_HEIGHT-TAGLINE_TAG_SCALE*(tag_bounds.bounds[3]-128)

def text_at(body, width, height, x, y, target_width, cls='word'):
    scale=target_width/width
    return f'<g class="{cls}" transform="translate({n(x)} {n(y)}) scale({n(scale)})">{body}</g>'

def tag(cls='mark', micro=False, scale=.94, cx=128, cy=128):
    d=OUTER+(MICRO_HEART if micro else HEART+HOLE)
    return f'<g transform="translate({n(cx)} {n(cy)}) scale({n(scale)}) translate(-128 -128)"><path class="{cls}" fill-rule="evenodd" transform="rotate(14 128 128)" d="{d}"/></g>'

def style(variant, tile=False):
    if tile:
        bg, fg = (COLORS['umber'], COLORS['darkAccent']) if variant=='dark' else (COLORS['sienna'], COLORS['ivory'])
        css=f'.tile{{fill:{bg}}}.mark{{fill:{fg}}}'
        if variant=='adaptive':
            css+='@media(prefers-color-scheme:dark){.tile{fill:%s}.mark{fill:%s}}' % (COLORS['umber'],COLORS['darkAccent'])
        return css
    if variant=='dark': mark,word=COLORS['darkAccent'],COLORS['ivory']
    elif variant=='black': mark=word='#000000'
    elif variant=='white': mark=word='#FFFFFF'
    else: mark=word=COLORS['sienna']
    css=f'.mark{{fill:{mark}}}.word{{fill:{word}}}'
    if variant=='adaptive':
        css+='@media(prefers-color-scheme:dark){.mark{fill:%s}.word{fill:%s}}' % (COLORS['darkAccent'],COLORS['ivory'])
    return css

def svg(width,height,body,css,title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}"><title>{html.escape(title)}</title><style>{css}</style>{body}</svg>\n'

def save(path,content):
    path=ROOT/path; path.parent.mkdir(parents=True,exist_ok=True); path.write_text(content)

for variant in VARIANTS:
    css=style(variant)
    mark=tag(scale=.80,cx=110,cy=120)
    main=mark+text_at(WORD,WW,WH,216,(240-WORD_HEIGHT)/2-3,WORD_WIDTH)
    save(f'logos/little-hint-horizontal-{variant}.svg',svg(LOGO_WIDTH,240,main,css,'Little Hint'))
    tagword=text_at(WORD,WW,WH,216,50,WORD_WIDTH)
    tagline=text_at(TAGLINE,TW,TH,219,TAGLINE_Y,TAGLINE_WIDTH)
    save(f'logos/little-hint-tagline-{variant}.svg',svg(LOGO_WIDTH,224,tag(scale=TAGLINE_TAG_SCALE,cx=110,cy=TAGLINE_TAG_CY)+tagword+tagline,css,'Little Hint. Gift ideas, shared thoughtfully.'))
    stack=tag(scale=.78,cx=310,cy=116)+text_at(WORD,WW,WH,50,242,520)
    save(f'logos/little-hint-stacked-{variant}.svg',svg(620,360,stack,css,'Little Hint'))
    word_height=WH/WW*580
    save(f'logos/little-hint-wordmark-{variant}.svg',svg(620,170,text_at(WORD,WW,WH,20,(170-word_height)/2,580),css,'Little Hint'))
    save(f'symbols/little-hint-tag-{variant}.svg',svg(256,256,tag(),css,'Little Hint gift tag'))
    save(f'symbols/little-hint-tag-micro-{variant}.svg',svg(256,256,tag(micro=True),css,'Little Hint small gift tag'))

for variant in ['color','dark','adaptive']:
    css=style(variant,tile=True)
    for kind,scale,rx,micro in [('app',.85,0,False),('maskable',.68,0,False),('favicon',.98,56,True)]:
        body=f'<rect class="tile" width="256" height="256" rx="{rx}"/>'+tag(scale=scale,micro=micro)
        folder='favicons' if kind=='favicon' else 'icons'
        save(f'{folder}/little-hint-{kind}-{variant}.svg',svg(256,256,body,css,'Little Hint'))

# A black silhouette with transparent cutouts for browser pinned-tab masks.
save('favicons/safari-pinned-tab.svg',svg(256,256,tag(micro=True),style('black'),'Little Hint'))
save('tokens.json', json.dumps({'version':1,'status':'Final Little Hint identity','colors':COLORS,'wordmark':{'font':'Fraunces','axes':{'wght':650,'opsz':60,'SOFT':65,'WONK':1},'pairAdjustmentsFontUnits':PAIR_SPACING,'fontUnitsPerEm':2000,'wordSpaceAdjustmentFontUnits':-60,'wordSpaceReductionPercent':15.04},'tagline':{'axes':{'wght':480,'opsz':60,'SOFT':65,'WONK':1},'customGlyphs':'Simplified outlined lowercase f; original font file unchanged','tagAlignment':'Lower edge aligned to complete text block','gapSvgUnits':TAGLINE_GAP,'gapRelativeToLetterHeight':TAGLINE_GAP/WORD_HEIGHT,'widthRelativeToWordmark':.86,'layout':'Tagline integrated in the SVG, left aligned below the wordmark'},'tagRotationDegrees':14,'microMark':'Larger heart; punched hole omitted'},indent=2)+'\n')
save('tokens.css', ':root {\n'+''.join(f'  --little-hint-{re.sub(r"([A-Z])",r"-\1",k).lower()}: {v};\n' for k,v in COLORS.items())+'}\n')
print('SVG masters written:',len(list(ROOT.rglob('*.svg'))))
