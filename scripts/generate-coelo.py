#!/usr/bin/env python3
"""Render a short Coelo demo with the project's free local tools only."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math, subprocess, shutil, base64, json

ROOT=Path(__file__).resolve().parents[1]
B64=ROOT/'recursos/imagenes/personajes/coelo.png.b64'
ASSET=ROOT/'recursos/imagenes/personajes/coelo.png'
OUT=ROOT/'public/videos/coelo-demo.mp4'
WORK=ROOT/'.coelo-render'
W,H,FPS,SECONDS=960,540,25,7
LINE='Que onda! Soy Coelo. Tengo patas rapidas y mucha actitud. Nos vemos en Nexora!'

def run(args): subprocess.run(args,check=True)
def font(n,bold=False):
 p=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
 return ImageFont.truetype(str(p),n) if p.exists() else ImageFont.load_default()

def main():
 if not ASSET.exists():
  ASSET.parent.mkdir(parents=True,exist_ok=True)
  ASSET.write_bytes(base64.b64decode(B64.read_text().strip()))
 sprite=Image.open(ASSET).convert('RGBA')
 sprite.thumbnail((850,365),Image.Resampling.LANCZOS)
 frames=WORK/'frames'; frames.mkdir(parents=True,exist_ok=True)
 for i in range(FPS*SECONDS):
  t=i/FPS
  im=Image.new('RGBA',(W,H),(20,31,49,255)); d=ImageDraw.Draw(im,'RGBA')
  for y in range(H):
   k=y/H; d.line((0,y,W,y),fill=(int(20+10*k),int(31+15*k),int(49+18*k),255))
  d.ellipse((205,390,770,480),fill=(3,8,14,90))
  bob=math.sin(t*math.tau*1.15)*9
  angle=math.sin(t*math.tau*.55)*1.2
  if 1<t<5.8: angle+=math.sin(t*math.tau*2)*.45
  posed=sprite.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
  im.alpha_composite(posed,((W-posed.width)//2-4,int(65+bob)))
  d=ImageDraw.Draw(im,'RGBA')
  if .35<t<6.55:
   d.rounded_rectangle((18,18,455,112),radius=22,fill=(248,245,231,245),outline=(43,51,65,255),width=4)
   d.polygon([(365,109),(403,109),(388,137)],fill=(248,245,231,245))
   d.text((42,35),'QUE ONDA! SOY COELO',font=font(23,True),fill=(40,49,62,255))
   d.text((42,72),'Tengo patas rapidas y mucha actitud.',font=font(15),fill=(52,59,68,255))
  im.convert('RGB').save(frames/f'{i:04d}.jpg',quality=93)
 voice=WORK/'voice.wav'; tts=shutil.which('espeak-ng') or shutil.which('espeak')
 if not tts: raise RuntimeError('No se encontro espeak-ng/espeak')
 run([tts,'-v','es','-s','148','-p','37','-a','175','-w',str(voice),LINE])
 OUT.parent.mkdir(parents=True,exist_ok=True)
 run(['ffmpeg','-y','-framerate',str(FPS),'-i',str(frames/'%04d.jpg'),'-i',str(voice),
      '-vf','fade=t=in:st=0:d=0.25,fade=t=out:st=6.5:d=0.5','-t',str(SECONDS),
      '-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',str(OUT)])
 p=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height','-of','json',str(OUT)],check=True,capture_output=True,text=True)
 data=json.loads(p.stdout); streams=data.get('streams',[])
 assert any(s.get('codec_type')=='video' and s.get('codec_name')=='h264' and s.get('width')==W and s.get('height')==H for s in streams)
 assert any(s.get('codec_type')=='audio' and s.get('codec_name')=='aac' for s in streams)
 assert float(data['format']['duration'])>=6
 print(f"COELO_DEMO_OK {data['format']['duration']}s {data['format']['size']} bytes")
if __name__=='__main__':
 try: main()
 finally: shutil.rmtree(WORK,ignore_errors=True)
