import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretVideoInstructions } from '../public/natural-language.js';

test('understands Spanish variants and decimal commas for trim, speed, format and volume', () => {
  const result = interpretVideoInstructions('Córtalo desde el segundo 2 hasta el 18, ponlo a 1,5x, en formato vertical y deja el audio al 70%', 48);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.plan.trim, { start: 2, end: 18 });
  assert.equal(result.plan.speed, 1.5);
  assert.equal(result.plan.aspect, 'portrait');
  assert.equal(result.plan.volume, 70);
});

test('recognizes common social video vocabulary', () => {
  for (const phrase of ['Hazlo para TikTok', 'formato para Reels', 'preparalo para YouTube', 'ponlo cuadrado']) {
    assert.equal(interpretVideoInstructions(phrase, 30).status, 'ok', phrase);
  }
});

test('asks for clarification when a requested value is missing', () => {
  const result = interpretVideoInstructions('cambia el formato', 30);
  assert.equal(result.status, 'clarify');
  assert.match(result.question, /vertical|horizontal|cuadrado/i);
});

test('asks when the instruction is not understood', () => {
  const result = interpretVideoInstructions('haz que parezca profesional con magia', 30);
  assert.equal(result.status, 'clarify');
  assert.match(result.question, /No entendí/i);
});

test('asks where to end if only a new start is given', () => {
  const result = interpretVideoInstructions('quita los primeros 3 segundos', 30);
  assert.equal(result.status, 'clarify');
  assert.match(result.question, /dónde terminar/i);
});

test('rejects trim end beyond the source duration with a question', () => {
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
