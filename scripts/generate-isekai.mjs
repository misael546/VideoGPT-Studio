import { GoogleGenAI } from '@google/genai';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('Falta configurar el secreto GEMINI_API_KEY en GitHub Actions.');
const ai = new GoogleGenAI({ apiKey });
const outDir = path.resolve('public/videos');
const workDir = path.resolve('.video-work');
const finalPath = path.join(outDir, 'isekai-test.mp4');
const model = process.env.VEO_MODEL || 'veo-3.1-fast-generate-preview';
const scenes = [
  ['01-old-man', 'Cinematic Japanese anime, hand-painted backgrounds, warm sunset. An elderly Japanese man with silver hair rests peacefully in a modest bedroom, closes his eyes with a faint smile as golden light enters through the window. Slow camera push-in, respectful peaceful passing, no horror, no text, landscape 16:9.'],
  ['02-between-worlds', 'Cinematic Japanese fantasy anime matching the previous scene. The same elderly man appears as a translucent glowing silhouette floating through a cosmic space with stars and golden particles. He looks in wonder toward a warm white-gold light. Slow drifting camera, ethereal, no text, landscape 16:9.'],
  ['03-newborn', 'Cinematic Japanese isekai anime, same art direction. In a cozy medieval fantasy cottage, a newborn baby with a tiny tuft of silver hair opens his eyes in a carved wooden cradle; a caring adult gently lifts him. The baby looks confused and curious, tiny fingers moving. Warm sunlight, family-friendly, no text, landscape 16:9.'],
  ['04-new-world', 'Cinematic Japanese fantasy anime establishing shot, matching previous scenes. Camera glides out of the cottage window to reveal a beautiful new world: medieval village, green hills, distant mountains, a majestic castle and faint magical lights in the sky. Wonder-filled sunrise, slow sweeping camera, no text, landscape 16:9.']
];
const run = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.once('error', reject);
  child.once('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} terminó con código ${code}`)));
});

try {
  await mkdir(outDir, { recursive: true });
  await mkdir(workDir, { recursive: true });
  const normalized = [];
  for (const [name, prompt] of scenes) {
    console.log(`Generando escena ${name}...`);
    let op = await ai.models.generateVideos({
      model, prompt,
      config: { aspectRatio: '16:9', resolution: '720p', durationSeconds: 8 }
    });
    while (!op.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      op = await ai.operations.getVideosOperation({ operation: op });
    }
    const video = op.response?.generatedVideos?.[0]?.video;
    if (!video) throw new Error(`El proveedor no devolvió un clip válido: ${name}`);
    const src = path.join(workDir, `${name}.mp4`);
    const dst = path.join(workDir, `${name}-normalized.mp4`);
    await ai.files.download({ file: video, downloadPath: src });
    await run('ffmpeg', ['-y', '-i', src, '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', dst]);
    normalized.push(dst);
  }
  const listPath = path.join(workDir, 'concat.txt');
  await writeFile(listPath, normalized.map(f => `file '${f}'`).join('\n') + '\n');
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', finalPath]);
  console.log(`Video final creado: ${finalPath}`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
