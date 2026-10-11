#!/usr/bin/env python3
"""Create a short illustrated isekai video without paid APIs or API keys."""
from PIL import Image, ImageDraw, ImageFont
import math, os, subprocess, wave, struct

W, H = 1280, 720
OUT = "public/videos"
WORK = ".free-video-work"
FPS = 25
SCENE_SECONDS = 6
LINES = [
    ("Una vida larga llegó tranquilamente a su final, bajo la última luz del atardecer.",
     "old"),
    ("Entre estrellas y destellos dorados, su alma cruzó el umbral hacia otro mundo.",
     "soul"),
    ("Volvió a abrir los ojos como un bebé de cabello plateado, en una tierra desconocida.",
     "baby"),
    ("A lo lejos, un castillo anunciaba el comienzo de una nueva aventura.",
     "kingdom"),
]
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

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
    # Cinematic title band
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((45,35, min(W-45, 45+len(title)*25), 100), radius=14, fill=(18,22,43))
    d.text((68,49), title, font=font(28), fill=(255,238,195), stroke_width=1, stroke_fill=(40,32,48))
    im.save(path, quality=95)

def run(args):
    subprocess.run(args, check=True)

def make_voice():
    wavs=[]
    for i,(line,kind) in enumerate(LINES):
        p=f"{WORK}/voice-{i}.wav"
        run(["espeak-ng","-v","es","-s","145","-p","42","-w",p,line])
        wavs.append(p)
    # Concatenate PCM audio with short pauses, preserving format.
    combined=f"{WORK}/narration.wav"
    with wave.open(wavs[0],"rb") as first:
        params=first.getparams()
        chunks=[]
        for i,p in enumerate(wavs):
            with wave.open(p,"rb") as f:
                if f.getparams()[:3] != params[:3]:
                    raise RuntimeError("Formato de narración incompatible")
                chunks.append(f.readframes(f.getnframes()))
                if i < len(wavs)-1:
                    chunks.append(b"\x00" * int(params.framerate*0.45)*params.sampwidth*params.nchannels)
        with wave.open(combined,"wb") as out:
            out.setparams(params)
            out.writeframes(b"".join(chunks))
    return combined

def main():
    clips=[]
    for i,(line,kind) in enumerate(LINES):
        img=f"{WORK}/scene-{i}.png"
        clip=f"{WORK}/clip-{i}.mp4"
        make_scene(kind,img)
        # Gentle camera movement, fades, and a Spanish caption at the bottom.
        caption=f"{WORK}/caption-{i}.txt"
        with open(caption,"w",encoding="utf-8") as f: f.write(line)
        vf=(f"zoompan=z='min(zoom+0.0007,1.04)':d={FPS*SCENE_SECONDS}:"
            f"s={W}x{H}:fps={FPS},fade=t=in:st=0:d=0.5,"
            f"fade=t=out:st={SCENE_SECONDS-0.5}:d=0.5,"
            f"drawbox=x=30:y=590:w=1220:h=90:color=black@0.58:t=fill,"
            f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:"
            f"textfile={caption}:fontcolor=white:fontsize=27:"
            f"x=(w-text_w)/2:y=620")
        run(["ffmpeg","-y","-loop","1","-i",img,"-vf",vf,"-t",str(SCENE_SECONDS),
             "-r",str(FPS),"-an","-c:v","libx264","-preset","veryfast","-crf","24",
             "-pix_fmt","yuv420p",clip])
        clips.append(clip)
    concat=f"{WORK}/concat.txt"
    with open(concat,"w",encoding="utf-8") as f:
        f.write("".join(f"file '{os.path.abspath(c)}'\n" for c in clips))
    silent=f"{WORK}/video.mp4"
    run(["ffmpeg","-y","-f","concat","-safe","0","-i",concat,"-c","copy","-movflags","+faststart",silent])
    voice=make_voice()
    final=f"{OUT}/isekai-test.mp4"
    # A quiet synthesized ambient bed keeps the short cinematic without external assets.
    run(["ffmpeg","-y","-i",silent,"-i",voice,"-f","lavfi","-i",
         "sine=frequency=110:sample_rate=44100:duration=24",
         "-filter_complex","[1:a]volume=1.0[voice];[2:a]volume=0.035,lowpass=f=320[amb];[voice][amb]amix=inputs=2:duration=longest:dropout_transition=1[a]",
         "-map","0:v:0","-map","[a]","-t",str(len(LINES)*SCENE_SECONDS),
         "-c:v","copy","-c:a","aac","-b:a","128k","-movflags","+faststart",final])
    run(["ffprobe","-v","error","-show_entries","format=duration,size","-of","default=noprint_wrappers=1",final])
    print(f"Video gratuito validado: {final}")

if __name__ == "__main__":
    try:
        main()
    finally:
        import shutil
        shutil.rmtree(WORK, ignore_errors=True)
