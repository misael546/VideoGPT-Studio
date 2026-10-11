import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEditPlan } from '../public/edit-plan.js';

test('acepta un plan v1 válido con las operaciones soportadas', () => {
  const result = validateEditPlan({
    version: 1,
    title: 'Reel',
    trim: { start: 2, end: 18 },
    speed: 1.25,
    aspect: 'portrait',
    volume: 80,
    fade: true
  }, 30);
  assert.equal(result.valid, true);
  assert.equal(result.plan.trim.end, 18);
});

test('rechaza comandos o propiedades desconocidas', () => {
  const result = validateEditPlan({ version: 1, speed: 1, command: 'rm -rf' }, 30);
  assert.equal(result.valid, false);
  assert.match(result.error, /Campo no permitido/);
});

test('rechaza propiedades desconocidas dentro del recorte', () => {
  const result = validateEditPlan({ version: 1, trim: { start: 1, end: 5, filter: 'evil' } }, 30);
  assert.equal(result.valid, false);
});

test('rechaza recortes negativos, invertidos y fuera de duración', () => {
  for (const trim of [
    { start: -1, end: 4 },
    { start: 5, end: 4 },
    { start: 1, end: 31 }
  ]) {
    assert.equal(validateEditPlan({ version: 1, trim }, 30).valid, false);
  }
});

test('rechaza end nulo si no se conoce la duración', () => {
  assert.equal(validateEditPlan({ version: 1, trim: { start: 0, end: null } }).valid, false);
});

test('rechaza números no finitos y tipos numéricos como texto', () => {
  assert.equal(validateEditPlan({ version: 1, speed: '1.5' }, 30).valid, false);
  assert.equal(validateEditPlan({ version: 1, volume: Infinity }, 30).valid, false);
});

test('rechaza velocidades, formatos y volúmenes no admitidos', () => {
  assert.equal(validateEditPlan({ version: 1, speed: 3 }, 30).valid, false);
  assert.equal(validateEditPlan({ version: 1, aspect: 'ultrawide' }, 30).valid, false);
  assert.equal(validateEditPlan({ version: 1, volume: 201 }, 30).valid, false);
});

test('rechaza planes sin operaciones y títulos demasiado largos', () => {
  assert.equal(validateEditPlan({ version: 1 }, 30).valid, false);
  assert.equal(validateEditPlan({ version: 1, title: 'x'.repeat(121), fade: true }, 30).valid, false);
});

test('no muta el plan recibido', () => {
  const plan = { version: 1, trim: { start: 2, end: 8 } };
  const before = JSON.stringify(plan);
  validateEditPlan(plan, 30);
  assert.equal(JSON.stringify(plan), before);
});
