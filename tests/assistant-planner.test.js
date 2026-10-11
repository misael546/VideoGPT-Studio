import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCasualSpanish, planVideoInstruction } from '../public/assistant-planner.js';

test('corrects common spelling mistakes without changing the intended request', () => {
  assert.match(normalizeCasualSpanish('hazlo mas profecional y ponle una vos de hombre'), /más profesional.*voz de hombre/i);
});

test('turns a vague professional polish request into a conservative, explicit plan', () => {
  const result = planVideoInstruction('As que el video se vea mas profecional', 40);
  assert.equal(result.status, 'ok');
  assert.equal(result.plan.fade, true);
  assert.equal(result.plan.volume, 90);
  assert.equal(result.plan.trim, undefined);
});

test('combines a creative goal with explicit compatible instructions', () => {
  const result = planVideoInstruction('Hazlo más profesional, córtalo desde el segundo 2 hasta el 18 y ponlo vertical', 40);
  assert.ok(['ok', 'partial'].includes(result.status));
  assert.deepEqual(result.plan.trim, { start: 2, end: 18 });
  assert.equal(result.plan.aspect, 'portrait');
  assert.equal(result.plan.fade, true);
});

test('does not pretend a male voice request is complete; exposes available advanced tool guidance', () => {
  const result = planVideoInstruction('Hazlo vertical y ponle una vos de hombre', 40);
  assert.equal(result.status, 'partial');
  assert.equal(result.plan.aspect, 'portrait');
  assert.equal(result.requestedFeatures.narration, true);
  assert.match(result.question, /añadir narración/i);
});

test('combines story format and automatic image polish without asking the user to operate tools', () => {
  const result = planVideoInstruction('Quiero que cortes fotograma por fotograma el video y pulas las imágenes y que las unas en un vídeo estilo historia', 48);
  assert.equal(result.status, 'partial');
  assert.equal(result.plan.aspect, 'portrait');
  assert.equal(result.plan.fade, true);
  assert.equal(result.plan.volume, 90);
  assert.equal(result.requestedFeatures.story, true);
  assert.equal(result.requestedFeatures.imagePolish, true);
});
