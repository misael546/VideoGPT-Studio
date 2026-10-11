#!/usr/bin/env python3
"""Create a short illustrated isekai video without paid APIs or API keys."""
from PIL import Image, ImageDraw, ImageFont
import math, os, subprocess, wave, struct, json
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "recursos" / "catalogo.json"

def load_resource_catalog():
    """Load optional reusable resources; a missing/invalid catalog never breaks the free generator."""
    try:
        data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        resources = data.get("resources", []) if isinstance(data, dict) else []
        return [item for item in resources if isinstance(item, dict)] if isinstance(resources, list) else []
    except (OSError, json.JSONDecodeError, AttributeError):
        print("Aviso: catálogo de recursos no disponible; se usarán las escenas base.")
        return []

def apply_image_overlays(image, scene_kind, resources):
    """Composite catalogued transparent images over a scene, if matching files exist."""
    from PIL import Image
    for item in resources:
        if item.get("type") != "image_overlay":
            continue
        scenes = item.get("scenes", ["all"])
        if not isinstance(scenes, list) or (scene_kind not in scenes and "all" not in scenes):
            continue
        rel_path = item.get("path")
        if not isinstance(rel_path, str) or not rel_path.strip():
            continue
        asset_path = (ROOT / rel_path).resolve()
        # Do not allow catalog entries to read files outside this repository.
        if ROOT.resolve() not in asset_path.parents or not asset_path.is_file():
            continue
        try:
            if asset_path.suffix.lower() == ".svg":
                import cairosvg
                overlay_bytes = cairosvg.svg2png(url=str(asset_path))
                overlay = Image.open(BytesIO(overlay_bytes)).convert("RGBA")
            else:
                overlay = Image.open(asset_path).convert("RGBA")
            target_width = item.get("width")
            target_height = item.get("height")
            if isinstance(target_width, int) and target_width > 0:
                if isinstance(target_height, int) and target_height > 0:
                    size = (target_width, target_height)
                else:
                    size = (target_width, max(1, round(overlay.height * target_width / overlay.width)))
                overlay = overlay.resize(size, Image.Resampling.LANCZOS)
            x = item.get("x", 0)
            y = item.get("y", 0)
            if not isinstance(x, int) or not isinstance(y, int):
                continue
            image.paste(overlay, (x, y), overlay)
        except (OSError, ValueError) as exc:
            print(f"Aviso: se omitió recurso visual {rel_path}: {exc}")

W, H = 1280, 720
OUT = "public/videos"
WORK = ".free-video-work"
FPS = 25
SCENE_SECONDS = 8
# Eight distinct chapters create a longer story rather than stretching or repeating the old four scenes.
LINES = [
    ("Al final de una vida larga, un anciano contempló en silencio la última luz de su hogar.", "old"),
    ("Cuando cerró los ojos, una corriente de estrellas lo llevó más allá del cielo conocido.", "soul"),
    ("Despertó convertido en un bebé de cabello plateado, protegido por una familia desconocida.", "baby"),
    ("Años después, salió de su aldea y vio un reino que parecía sacado de una leyenda.", "kingdom"),
    ("En el bosque antiguo, aprendió a escuchar la magia escondida entre las raíces.", "forest"),
    ("En una aldea al pie de las montañas, encontró aliados y la primera pista de su destino.", "village"),
    ("Un dragón despertó entre las ruinas; su sombra cubrió el valle y encendió el cielo.", "dragon"),
    ("Sin huir, reunió su valor y cruzó el portal, decidido a escribir su propia historia.", "portal"),
]
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
RESOURCE_CATALOG = load_resource_catalog()
print(f"Recursos reutilizables cargados: {len(RESOURCE_CATALOG)}")

def font(size):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def gradient(top, bottom):
    im = Image.new("RGB", (W,H))
    px = im.load()
    for y in range(H):
        t = y/(H-1)
        c = tuple(int(top[i]*(1-t)+bottom[i]*t) for i in range(3))
        for x in range(W): px[x,y] = c
    return im

def starfield(draw, count=150, color=(255,239,190)):
    import random
    rng = random.Random(27)
    for _ in range(count):
        x, y = rng.randrange(W), rng.randrange(H)
        r = rng.choice([1,1,2,3])
        draw.ellipse((x-r,y-r,x+r,y+r), fill=color)

def make_scene(kind, path):
    if kind == "old":
        im = gradient((65,73,126),(247,143,83)); d=ImageDraw.Draw(im)
        d.ellipse((850,115,1040,305), fill=(255,216,133))
        for x,y,s in [(100,470,1),(270,510,.8),(1100,480,1.1)]:
            d.polygon([(x,y),(x+80*s,y-240*s),(x+165*s,y)], fill=(54,62,94))
        d.rectangle((0,535,W,H), fill=(45,49,75))
        d.rectangle((690,250,1110,560), fill=(89,55,59))
        d.polygon([(650,270),(900,120),(1150,270)], fill=(53,43,65))
        d.rectangle((755,305,1035,535), fill=(42,43,62))
        d.rectangle((830,320,960,480), fill=(255,193,104))
        # peaceful elderly silhouette by window
        d.ellipse((430,325,520,415), fill=(39,39,55))
        d.polygon([(425,400),(520,400),(565,585),(385,585)], fill=(43,47,68))
        d.line((445,365,480,375), fill=(223,208,183), width=5)
        title="EL ÚLTIMO ATARDECER"
    elif kind == "soul":
        im=gradient((12,16,54),(100,45,117)); d=ImageDraw.Draw(im); starfield(d,260)
        for r in range(230,40,-30):
            d.ellipse((640-r,345-r,640+r,345+r), outline=(255,190,94), width=3)
        d.ellipse((575,210,705,350), fill=(255,232,185))
        d.ellipse((598,230,682,325), fill=(255,255,236))
        d.polygon([(610,315),(670,315),(710,465),(570,465)], fill=(255,221,160))
        for x,y in [(370,240),(900,180),(840,460),(440,510),(1010,370)]:
            d.ellipse((x-6,y-6,x+6,y+6), fill=(255,226,147))
        title="ENTRE DOS MUNDOS"
    elif kind == "baby":
        im=gradient((255,204,142),(111,123,164)); d=ImageDraw.Draw(im)
        d.rectangle((0,500,W,H), fill=(99,64,65))
        # cottage wall and bright window
        d.rectangle((120,100,1160,570), fill=(229,190,144))
        d.rectangle((800,145,1085,420), fill=(255,230,163))
        d.line((942,145,942,420), fill=(145,93,75), width=14)
        d.line((800,280,1085,280), fill=(145,93,75), width=14)
        # cradle
        d.rounded_rectangle((355,395,835,585), radius=35, fill=(103,58,46), outline=(57,43,48), width=8)
        d.ellipse((425,350,765,525), fill=(244,230,204), outline=(119,79,66), width=8)
        d.ellipse((500,355,690,490), fill=(235,187,150))
        d.ellipse((490,325,700,445), fill=(236,204,173), outline=(133,85,77), width=5)
        d.ellipse((505,325,685,420), fill=(224,225,234))
        d.ellipse((535,370,560,395), fill=(64,73,109)); d.ellipse((630,370,655,395), fill=(64,73,109))
        d.arc((565,385,625,425), 10, 160, fill=(126,67,73), width=4)
        title="UNA SEGUNDA VIDA"
    elif kind == "forest":
        im=gradient((15,45,63),(80,132,105)); d=ImageDraw.Draw(im)
        for x,h in [(60,470),(210,390),(390,500),(880,420),(1060,510),(1210,430)]:
            d.rectangle((x-22,300,x+22,690),fill=(57,54,55))
            for j in range(4):
                yy=260-j*55
                d.polygon([(x-110+j*8,yy+90),(x,yy-70),(x+115-j*8,yy+90)],fill=(25+j*5,76+j*5,69+j*3))
        d.ellipse((500,150,780,430),fill=(178,224,165),outline=(232,255,196),width=7)
        d.ellipse((550,200,730,380),fill=(229,255,207))
        d.polygon([(0,590),(260,510),(450,620),(700,500),(930,615),(1280,520),(1280,720),(0,720)],fill=(28,76,61))
        for x,y in [(440,520),(820,560),(355,610),(930,625)]:
            d.ellipse((x-5,y-5,x+5,y+5),fill=(238,255,176))
        title="EL BOSQUE ANTIGUO"
    elif kind == "village":
        im=gradient((93,154,202),(255,205,141)); d=ImageDraw.Draw(im)
        d.ellipse((965,90,1105,230),fill=(255,237,177))
        d.polygon([(0,430),(180,240),(390,435),(610,205),(840,440),(1050,250),(1280,430),(1280,720),(0,720)],fill=(115,137,148))
        d.rectangle((0,535,W,H),fill=(75,118,79))
        for x,y,scale in [(160,365,1),(440,410,.8),(820,365,1.05),(1050,425,.75)]:
            ww=int(170*scale); hh=int(150*scale)
            d.rectangle((x,y,x+ww,y+hh),fill=(214,177,130),outline=(99,73,70),width=5)
            d.polygon([(x-15,y+8),(x+ww//2,y-hh//2),(x+ww+15,y+8)],fill=(131,74,77))
            d.rectangle((x+ww//2-18,y+hh-58,x+ww//2+18,y+hh),fill=(86,61,60))
            d.rectangle((x+20,y+35,x+52,y+70),fill=(255,226,154))
        d.polygon([(550,720),(610,610),(660,580),(720,610),(790,720)],fill=(181,155,115))
        title="UN LUGAR AL QUE PERTENECER"
    elif kind == "dragon":
        im=gradient((27,30,61),(166,68,70)); d=ImageDraw.Draw(im); starfield(d,95,(255,207,156))
        d.ellipse((900,85,1040,225),fill=(255,169,119))
        d.polygon([(0,520),(200,280),(380,510),(580,260),(800,530),(1010,300),(1280,520),(1280,720),(0,720)],fill=(62,57,78))
        d.polygon([(690,355),(505,210),(350,170),(450,330),(280,300),(480,430),(585,455)],fill=(39,35,53))
        d.polygon([(720,360),(900,190),(1090,155),(1010,315),(1170,280),(940,435),(800,455)],fill=(39,35,53))
        d.ellipse((580,330,820,500),fill=(35,32,48))
        d.polygon([(735,390),(850,300),(925,320),(870,390),(940,420),(825,435)],fill=(35,32,48))
        d.polygon([(600,435),(475,530),(360,525),(505,465)],fill=(35,32,48))
        d.ellipse((855,350,875,370),fill=(255,207,97)); d.ellipse((885,350,905,370),fill=(255,207,97))
        d.polygon([(0,610),(260,560),(440,625),(690,570),(970,625),(1280,555),(1280,720),(0,720)],fill=(48,49,62))
        for x,y in [(250,580),(310,615),(1000,575),(1080,610)]:
            d.line((x,y,x+12,y-28),fill=(255,114,78),width=5)
        title="EL GUARDIÁN DE LAS RUINAS"
    elif kind == "portal":
        im=gradient((14,22,58),(75,49,112)); d=ImageDraw.Draw(im); starfield(d,240)
        for r in range(210,50,-20):
            d.ellipse((640-r,365-r,640+r,365+r),outline=(102+r//3,165+r//4,255),width=4)
        d.ellipse((570,245,710,490),fill=(180,151,255),outline=(231,224,255),width=8)
        d.ellipse((592,265,688,468),fill=(60,94,154))
        d.polygon([(0,600),(240,530),(430,610),(650,550),(850,615),(1100,525),(1280,600),(1280,720),(0,720)],fill=(29,35,65))
        d.polygon([(540,720),(590,520),(640,485),(690,520),(750,720)],fill=(115,96,118))
        for x,y in [(450,300),(820,250),(820,450),(460,470),(720,180)]:
            d.ellipse((x-5,y-5,x+5,y+5),fill=(255,230,172))
        title="EL DESTINO LO ELIGE ÉL"
    else:
        im=gradient((90,153,210),(255,202,139)); d=ImageDraw.Draw(im)
        d.ellipse((925,95,1085,255), fill=(255,237,174))
        # distant mountains
        d.polygon([(0,510),(190,280),(360,505),(570,245),(810,510),(1000,310),(1280,520),(1280,720),(0,720)], fill=(104,133,151))
        d.polygon([(0,585),(280,405),(480,600),(730,390),(960,590),(1160,430),(1280,520),(1280,720),(0,720)], fill=(63,112,109))
        # castle
        d.rectangle((480,305,820,570), fill=(222,203,177), outline=(103,91,105), width=5)
        d.rectangle((430,360,520,570), fill=(190,172,164)); d.rectangle((780,360,870,570), fill=(190,172,164))
        d.polygon([(420,360),(475,260),(530,360)], fill=(120,74,84))
        d.polygon([(770,360),(825,260),(880,360)], fill=(120,74,84))
        d.rectangle((580,235,720,570), fill=(236,218,189))
        d.polygon([(560,240),(650,130),(740,240)], fill=(113,66,87))
        d.rectangle((620,420,680,570), fill=(78,64,79))
        for x in [505,565,735,795]:
            d.rectangle((x,405,x+28,450), fill=(255,222,150))
        # foreground hills
        d.polygon([(0,610),(250,540),(460,620),(700,550),(970,620),(1280,535),(1280,720),(0,720)], fill=(56,128,85))
        title="EL COMIENZO DE LA AVENTURA"
    # Additional hand-drawn environmental layers add depth and visual richness.
    if kind == "old":
        # Wooden floorboards, bedside books, candlelight and window mullions.
        for yy in range(555, H, 28):
            d.line((0,yy,W,yy-8), fill=(104,72,68), width=2)
        for xx in range(0,W,180):
            d.line((xx,555,xx+35,H), fill=(86,61,63), width=2)
        d.rectangle((170,380,300,525), fill=(67,49,61), outline=(137,91,75), width=5)
        for yy in (405,438,471,504):
            d.line((180,yy,288,yy), fill=(181,130,88), width=3)
        d.rectangle((340,440,360,500), fill=(255,205,112))
        d.polygon([(330,440),(350,412),(370,440)], fill=(255,230,157))
        for x in (870,920,970):
            d.line((x,250,x,535), fill=(117,76,69), width=5)
    elif kind == "soul":
        # Aurora ribbons and distant celestial arches.
        for j in range(6):
            y = 90 + j * 34
            d.arc((-200,y,1450,y+330), 195, 345, fill=(119,193,223,95), width=5)
        for x in range(80, W, 160):
            d.line((x,80,x+35,115), fill=(255,225,161), width=2)
            d.line((x+35,80,x,115), fill=(255,225,161), width=2)
        d.ellipse((90,160,250,320), outline=(172,123,225), width=3)
        d.ellipse((103,173,237,307), outline=(172,123,225), width=2)
    elif kind == "baby":
        # Curtains, wall beams, crib rails and warm nursery details.
        d.polygon([(135,105),(290,120),(255,395),(145,395)], fill=(183,112,111))
        d.polygon([(1090,120),(1145,105),(1135,395),(1035,395)], fill=(183,112,111))
        for x in range(385,820,48):
            d.line((x,430,x+10,570), fill=(155,104,72), width=5)
        d.rectangle((840,430,1070,452), fill=(125,79,62))
        for x in range(860,1060,38):
            d.ellipse((x,408,x+22,432), fill=(244,159,131))
            d.ellipse((x+6,400,x+16,414), fill=(255,222,162))
        d.line((145,150,230,150), fill=(238,177,143), width=6)
    elif kind == "kingdom":
        # Banners, crenellations, a winding path and layered foreground foliage.
        d.rectangle((475,300,495,330), fill=(222,203,177))
        d.rectangle((805,300,825,330), fill=(222,203,177))
        d.line((650,135,650,205), fill=(76,56,79), width=5)
        d.polygon([(653,138),(715,158),(653,180)], fill=(176,66,83))
        d.line((465,370,465,420), fill=(91,61,78), width=4)
        d.polygon([(468,372),(510,388),(468,404)], fill=(191,83,82))
        d.polygon([(560,720),(610,610),(660,585),(710,610),(780,720)], fill=(151,132,100))
        for x,y in [(75,580),(150,610),(1090,600),(1190,570),(1030,640)]:
            d.ellipse((x-45,y-70,x+45,y+30), fill=(42,95,72))
            d.ellipse((x-30,y-95,x+25,y-25), fill=(57,119,82))
    # Optional catalogued PNG overlays add reusable characters/objects to compatible scenes.
    apply_image_overlays(im, kind, RESOURCE_CATALOG)
    # Cinematic title band
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((45,35, min(W-45, 45+len(title)*25), 100), radius=14, fill=(18,22,43))
    d.text((68,49), title, font=font(28), fill=(255,238,195), stroke_width=1, stroke_fill=(40,32,48))
    im.save(path, quality=95)

def make_animation_frame(base_path, out_path, kind, frame, total):
    """Render an individual hand-crafted frame; the MP4 is assembled from this image stack."""
    im = Image.open(base_path).convert("RGB")
    d = ImageDraw.Draw(im, "RGBA")
    t = frame / max(1, total - 1)
    import math, random
    rng = random.Random(frame * 37 + {"old": 1, "soul": 2, "baby": 3, "kingdom": 4}[kind])
    # Each frame gets changing particles, light and small motion cues rather than a static slide.
    if kind == "old":
        glow = int(100 + 65 * (0.5 + 0.5 * math.sin(frame * 0.35)))
        d.ellipse((805, 260, 980, 485), fill=(255, 167, 82, glow // 3))
        d.ellipse((840, 315, 950, 465), fill=(255, 206, 121, glow // 2))
        # Fireflies drifting around the window.
        for j in range(12):
            x = int(865 + math.sin(frame * .17 + j) * (35 + j * 2))
            y = int(365 + math.cos(frame * .12 + j * 1.7) * (24 + j))
            r = 2 + (j % 3)
            d.ellipse((x-r,y-r,x+r,y+r), fill=(255, 229, 156, 180))
    elif kind == "soul":
        cx, cy = 640, int(345 + 12 * math.sin(frame * .22))
        for j in range(18):
            a = frame * .13 + j * math.tau / 18
            radius = 75 + (j % 4) * 28
            x = int(cx + math.cos(a) * radius)
            y = int(cy + math.sin(a) * radius * .72)
            r = 2 + j % 3
            d.ellipse((x-r,y-r,x+r,y+r), fill=(255, 228, 148, 190))
        d.ellipse((cx-72,cy-115,cx+72,cy+35), outline=(255,242,191,100), width=4)
    elif kind == "baby":
        # Soft magical dust and a gentle rocking light across the cradle.
        shift = int(4 * math.sin(frame * .24))
        d.ellipse((430, 380+shift, 755, 445+shift), fill=(255, 244, 218, 28))
        for j in range(9):
            x = int(410 + ((j * 83 + frame * (2 + j % 3)) % 420))
            y = int(280 + ((j * 61 - frame * (1 + j % 2)) % 270))
            d.ellipse((x-2,y-2,x+2,y+2), fill=(255, 238, 180, 165))
        if frame % 22 in (0, 1):
            # Blink animation: briefly cover and redraw the eyes.
            d.ellipse((530, 365, 568, 390), fill=(235, 199, 172, 255))
            d.ellipse((625, 365, 663, 390), fill=(235, 199, 172, 255))
            d.line((536, 379, 562, 379), fill=(70, 66, 87, 255), width=4)
            d.line((631, 379, 657, 379), fill=(70, 66, 87, 255), width=4)
    elif kind == "forest":
        beam_x = int(560 + 24 * math.sin(frame * .08))
        d.polygon([(beam_x-22,0),(beam_x+22,0),(beam_x+150,560),(beam_x+70,560)], fill=(210,255,180,18))
        for j in range(18):
            x = int(350 + ((j*71 + frame*(1+j%3)) % 600))
            y = int(170 + ((j*43 - frame*(1+j%2)) % 440))
            d.ellipse((x-2,y-2,x+3,y+3), fill=(222,255,165,150))
    elif kind == "village":
        for j in range(5):
            x = int(280 + j*185 + 8*math.sin(frame*.12+j))
            y = int(285 - ((frame*1.4+j*13)%70))
            d.ellipse((x-10,y-14,x+10,y+14), fill=(240,229,214,35))
        for j in range(12):
            x = int((j*113 + frame*1.3) % W)
            y = int(470 + 30*math.sin(frame*.08+j))
            d.ellipse((x-2,y-2,x+2,y+2), fill=(255,225,155,100))
    elif kind == "dragon":
        pulse = int(70 + 45*(.5+.5*math.sin(frame*.24)))
        d.ellipse((820,315,940,410), fill=(255,65,45,pulse//5))
        for j in range(20):
            x = int((j*83 + frame*(1.3+j%3)) % W)
            y = int(490 + 130*math.sin(frame*.07+j))
            d.ellipse((x-2,y-2,x+2,y+2), fill=(255,145,77,150))
    elif kind == "portal":
        pulse = int(2 + 3*(.5+.5*math.sin(frame*.16)))
        d.ellipse((570-pulse,240-pulse,710+pulse,495+pulse), outline=(193,176,255,170), width=3)
        for j in range(16):
            a = frame*.09 + j*math.tau/16
            x = int(640+math.cos(a)*(105+j%3*12))
            y = int(365+math.sin(a)*(155+j%3*10))
            d.ellipse((x-2,y-2,x+2,y+2), fill=(228,222,255,180))
    else:
        # Cloud wisps and drifting embers in front of the distant kingdom.
        for j in range(10):
            x = int((j * 157 + frame * (1.4 + j % 3)) % (W + 100) - 50)
            y = 190 + j * 23
            d.ellipse((x-28,y-5,x+28,y+5), fill=(255, 245, 224, 25))
        for j in range(8):
            x = int((j * 191 + frame * 2.3) % W)
            y = int(520 + 20 * math.sin(frame * .1 + j))
            d.ellipse((x-2,y-2,x+2,y+2), fill=(255, 221, 145, 140))
    # Subtle grain makes the illustrated layers feel less like flat presentation slides.
    for _ in range(180):
        x, y = rng.randrange(W), rng.randrange(H)
        shade = rng.choice([0, 255])
        d.point((x, y), fill=(shade, shade, shade, 10))
    im.save(out_path, quality=94)

def run(args):
    subprocess.run(args, check=True)

def make_voice():
    """Prefer free neural Spanish male narration; fall back to a deeper local voice."""
    wavs=[]
    for i,(line,kind) in enumerate(LINES):
        mp3=f"{WORK}/voice-{i}.mp3"
        wav_path=f"{WORK}/voice-{i}.wav"
        try:
            # Mexican Spanish male voice; slower and lower-pitched for a mature, resonant narrator.
            run(["edge-tts","--voice","es-MX-JorgeNeural","--rate=-16%","--pitch=-12Hz",
                 "--text",line,"--write-media",mp3])
            run(["ffmpeg","-y","-i",mp3,"-ar","24000","-ac","1",wav_path])
        except (subprocess.CalledProcessError, FileNotFoundError):
            run(["espeak-ng","-v","es+m3","-s","122","-p","28","-a","175","-w",wav_path,line])
        wavs.append(wav_path)
    combined=f"{WORK}/narration.wav"
    with wave.open(wavs[0],"rb") as first:
        params=first.getparams()
        chunks=[]
        for i,p in enumerate(wavs):
            with wave.open(p,"rb") as audio:
                if audio.getparams()[:3] != params[:3]:
                    normalized=f"{WORK}/normalized-{i}.wav"
                    run(["ffmpeg","-y","-i",p,"-ar",str(params.framerate),"-ac",str(params.nchannels),normalized])
                    p=normalized
                with wave.open(p,"rb") as audio:
                    chunks.append(audio.readframes(audio.getnframes()))
                    if i < len(wavs)-1:
                        chunks.append(b"\x00" * int(params.framerate*0.7)*params.sampwidth*params.nchannels)
        with wave.open(combined,"wb") as out:
            out.setparams(params)
            out.writeframes(b"".join(chunks))
    return combined

def make_sound_effects(path, duration):
    """Create free synthesized wind, soft footsteps, transition swishes and magic chimes."""
    import random
    rate = 44100
    count = int(rate * duration)
    rng = random.Random(91027)
    samples = []
    # Four short events: gentle room/wind ambience, transition swishes and tiny magical chimes.
    for n in range(count):
        t = n / rate
        ambient = 0.025 * math.sin(2 * math.pi * 72 * t) + 0.012 * math.sin(2 * math.pi * 94 * t)
        # Soft wind-like noise with a slow amplitude envelope.
        noise = (rng.random() * 2 - 1) * (0.012 + 0.012 * (0.5 + 0.5 * math.sin(t * 0.55)))
        effect = 0.0
        transition_events = tuple(i * SCENE_SECONDS - 0.55 for i in range(1, len(LINES)))
        for event in transition_events:
            local = t - event
            if 0 <= local <= 0.85:
                envelope = math.sin(math.pi * local / 0.85) ** 2
                effect += envelope * (0.08 * math.sin(2 * math.pi * (160 - 95 * local) * local))
                effect += envelope * 0.025 * math.sin(2 * math.pi * 540 * local)
        # Tiny sparkling tones appear in the magical soul and rebirth scenes.
        magic_events = tuple(i * SCENE_SECONDS + offset for i, (_, kind) in enumerate(LINES)
                             if kind in {"soul", "baby", "forest", "portal"}
                             for offset in (1.4, 3.1, 5.2))
        for event in magic_events:
            local = t - event
            if 0 <= local <= 0.35:
                envelope = math.exp(-local * 9)
                effect += 0.045 * envelope * math.sin(2 * math.pi * (880 - 200 * local) * local)
        value = max(-0.8, min(0.8, ambient + noise + effect))
        samples.append(int(value * 32767))
    with wave.open(path, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(struct.pack("<" + "h" * len(samples), *samples))

def main():
    clips=[]
    frame_rate = 8
    frames_per_scene = frame_rate * SCENE_SECONDS
    # Every scene is rendered as a stack of individual images, then assembled as moving footage.
    for i,(line,kind) in enumerate(LINES):
        base=f"{WORK}/scene-{i}.jpg"
        make_scene(kind,base)
        frame_dir=f"{WORK}/frames-{i}"
        os.makedirs(frame_dir,exist_ok=True)
        for frame in range(frames_per_scene):
            frame_path=f"{frame_dir}/frame-{frame:03d}.jpg"
            make_animation_frame(base,frame_path,kind,frame,frames_per_scene)
        clip=f"{WORK}/clip-{i}.mp4"
        caption=f"{WORK}/caption-{i}.txt"
        with open(caption,"w",encoding="utf-8") as f: f.write(line)
        # Frame-by-frame animation first, then smooth output cadence and cinematic captions.
        vf=(f"fps={FPS},fade=t=in:st=0:d=0.45,"
            f"fade=t=out:st={SCENE_SECONDS-0.45}:d=0.45,"
            f"drawbox=x=30:y=590:w=1220:h=90:color=black@0.58:t=fill,"
            f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:"
            f"textfile={caption}:fontcolor=white:fontsize=27:"
            f"x=(w-text_w)/2:y=620")
        run(["ffmpeg","-y","-framerate",str(frame_rate),"-i",f"{frame_dir}/frame-%03d.jpg",
             "-vf",vf,"-t",str(SCENE_SECONDS),"-r",str(FPS),"-an",
             "-c:v","libx264","-preset","veryfast","-crf","22","-pix_fmt","yuv420p",clip])
        clips.append(clip)
    concat=f"{WORK}/concat.txt"
    with open(concat,"w",encoding="utf-8") as f:
        f.write("".join(f"file '{os.path.abspath(c)}'\n" for c in clips))
    silent=f"{WORK}/video.mp4"
    run(["ffmpeg","-y","-f","concat","-safe","0","-i",concat,"-c","copy","-movflags","+faststart",silent])
    voice=make_voice()
    duration=len(LINES)*SCENE_SECONDS
    effects=f"{WORK}/effects.wav"
    make_sound_effects(effects,duration)
    final=f"{OUT}/isekai-mejorado.mp4"
    # Voice remains clear; effects add wind, swishes and magical chimes without external audio assets.
    run(["ffmpeg","-y","-i",silent,"-i",voice,"-i",effects,
         "-filter_complex",
         "[1:a]highpass=f=75,lowpass=f=9500,acompressor=threshold=0.12:ratio=2.8:attack=18:release=220,volume=1.35[voice];"
         "[2:a]volume=0.72[fx];[voice][fx]amix=inputs=2:duration=longest:dropout_transition=1[a]",
         "-map","0:v:0","-map","[a]","-t",str(duration),
         "-c:v","copy","-c:a","aac","-b:a","160k","-movflags","+faststart",final])
    # Validate duration, size and playable video/audio streams before updating the gallery.
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_type",
         "-of", "json", final], check=True, capture_output=True, text=True)
    metadata = json.loads(probe.stdout)
    actual_duration = float(metadata.get("format", {}).get("duration", 0))
    actual_size = int(metadata.get("format", {}).get("size", 0))
    stream_types = {stream.get("codec_type") for stream in metadata.get("streams", [])}
    if actual_duration < 55 or actual_size <= 100_000 or not {"video", "audio"}.issubset(stream_types):
        raise RuntimeError(f"El MP4 no pasó validación: duration={actual_duration}, size={actual_size}, streams={stream_types}")
    gallery_path = ROOT / "public" / "videos" / "gallery.json"
    try:
        gallery = json.loads(gallery_path.read_text(encoding="utf-8"))
        if not isinstance(gallery, list):
            gallery = []
    except (OSError, json.JSONDecodeError):
        gallery = []
    relative_src = "videos/isekai-mejorado.mp4"
    gallery = [entry for entry in gallery if not (isinstance(entry, dict) and entry.get("src") == relative_src)]
    gallery.append({
        "title": "El comienzo de una segunda vida — versión extendida",
        "description": "Corto ilustrado extendido de fantasía: ocho escenas animadas, narración en español y efectos sonoros originales.",
        "src": relative_src,
        "category": "Fantasía"
    })
    gallery_path.write_text(json.dumps(gallery, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
    print(f"Video gratuito validado: {final} ({actual_duration:.1f}s, {actual_size} bytes)")


if __name__ == "__main__":
    try:
        main()
    finally:
        import shutil
        shutil.rmtree(WORK, ignore_errors=True)
