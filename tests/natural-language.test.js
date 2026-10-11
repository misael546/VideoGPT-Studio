import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretVideoInstructions } from '../public/natural-language.js';

test('understands Spanish variants, decimal commas, trim, speed, format and volume', () => {
  const result = interpretVideoInstructions('Córtalo desde el segundo 2 hasta el 18, ponlo a 1,5x, en formato vertical y deja el audio al 70%', 48);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.plan.trim, { start: 2, end: 18 });
  assert.equal(result.plan.speed, 1.5);
  assert.equal(result.plan.aspect, 'portrait');
  assert.equal(result.plan.volume, 70);
});

test('recognizes common social video vocabulary', () => {
  for (const phrase of ['Hazlo para TikTok', 'formato para Reels', 'preparalo para YouTube', 'ponlo cuadrado', 'hazlo para la pantalla del telefono']) {
    assert.equal(interpretVideoInstructions(phrase, 30).status, 'ok', phrase);
  }
});

test('asks a specific question when a format is missing', () => {
  const result = interpretVideoInstructions('cambia el formato', 30);
  assert.equal(result.status, 'clarify');
  assert.match(result.question, /vertical|horizontal|cuadrado/i);
});

test('recognizes an unknown creative request without pretending to execute it', () => {
  const result = interpretVideoInstructions('haz que parezca profesional con magia', 30);
  assert.equal(result.status, 'clarify');
  assert.match(result.question, /acción concreta/i);
});

test('understands removing the first few seconds as a trim to the end', () => {
  const result = interpretVideoInstructions('quita los primeros 3 segundos', 30);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.plan.trim, { start: 3, end: 30 });
});

test('understands removing an intro as a request for the missing duration', () => {
  const result = interpretVideoInstructions('quita la intro', 30);
  assert.equal(result.status, 'clarify');
  assert.match(result.question, /cuántos segundos/i);
});

test('understands removing the last seconds', () => {
  const result = interpretVideoInstructions('quita los últimos 4 segundos', 30);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.plan.trim, { start: 0, end: 26 });
});

test('asks when trim end exceeds source duration', () => {
  const result = interpretVideoInstructions('recorta de 2 a 60 segundos', 30);
  assert.equal(result.status, 'clarify');
  assert.match(result.question, /supera la duración/i);
});

test('maps speed up and slow motion phrases to supported speeds', () => {
  assert.equal(interpretVideoInstructions('hazlo más rápido', 30).plan.speed, 1.5);
  assert.equal(interpretVideoInstructions('ponlo en cámara lenta', 30).plan.speed, 0.5);
});

test('understands silence and soft transitions', () => {
  const result = interpretVideoInstructions('silencia el audio y pon una transición suave', 30);
  assert.equal(result.status, 'ok');
  assert.equal(result.plan.volume, 0);
  assert.equal(result.plan.fade, true);
});

test('recognizes story edit, scene/frame analysis, dialogue/text and male narration requests explicitly', () => {
  const result = interpretVideoInstructions('Corta por fotogramas y escenas para crear una historia más pulida, detecta los diálogos y letras y agrega una voz de hombre', 48);
  assert.equal(result.status, 'partial');
  assert.equal(result.requestedFeatures.story, true);
  assert.equal(result.requestedFeatures.dialogue, true);
  assert.equal(result.requestedFeatures.narration, true);
  assert.match(result.question, /no puede reconocer automáticamente/i);
  assert.match(result.question, /voz masculina/i);
});

test('advanced request can also preserve understood basic changes without claiming advanced features', () => {
  const result = interpretVideoInstructions('Hazlo vertical para Reels, sube el volumen al 70% y añade narración masculina', 48);
  assert.equal(result.status, 'partial');
  assert.equal(result.plan.aspect, 'portrait');
  assert.equal(result.plan.volume, 70);
  assert.equal(result.requestedFeatures.narration, true);
});
