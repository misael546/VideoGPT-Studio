const ALLOWED_PLAN_KEYS = new Set(['version', 'title', 'trim', 'speed', 'aspect', 'volume', 'fade']);
const ALLOWED_TRIM_KEYS = new Set(['start', 'end']);
const ALLOWED_SPEEDS = new Set([0.5, 0.75, 1, 1.25, 1.5, 2]);
const ALLOWED_ASPECTS = new Set(['original', 'landscape', 'portrait', 'square']);

function fail(message) {
  return { valid: false, error: message };
}

/**
 * Validate the editor's existing JSON plan v1 without changing any UI state.
 * durationSeconds is optional for structural validation, but trim.end=null
 * requires a known positive duration.
 */
export function validateEditPlan(plan, durationSeconds = 0) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return fail('El plan debe ser un objeto JSON.');
  }

  for (const key of Object.keys(plan)) {
    if (!ALLOWED_PLAN_KEYS.has(key)) {
      return fail('Campo no permitido en el plan: ' + key + '.');
    }
  }

  if (plan.version !== 1) return fail('El plan debe usar version: 1.');

  if (plan.title !== undefined &&
      (typeof plan.title !== 'string' || plan.title.length > 120)) {
    return fail('El título debe ser texto de hasta 120 caracteres.');
  }

  const normalized = { version: 1 };
  if (plan.title !== undefined) normalized.title = plan.title;
  let operationCount = 0;

  if (plan.trim !== undefined) {
    if (!plan.trim || typeof plan.trim !== 'object' || Array.isArray(plan.trim)) {
      return fail('El campo trim debe ser un objeto con start y end.');
    }
    for (const key of Object.keys(plan.trim)) {
      if (!ALLOWED_TRIM_KEYS.has(key)) return fail('Campo no permitido en trim: ' + key + '.');
    }

    const start = plan.trim.start === undefined ? 0 : plan.trim.start;
    const rawEnd = plan.trim.end;
    const end = rawEnd === null || rawEnd === undefined ? Number(durationSeconds) : rawEnd;
    if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) {
      return fail('trim.start debe ser un número finito mayor o igual a 0.');
    }
    if (typeof end !== 'number' || !Number.isFinite(end) || end <= start) {
      return fail('trim.end debe ser mayor que trim.start y requiere una duración conocida si es null.');
    }
    if (Number.isFinite(durationSeconds) && durationSeconds > 0 && end > durationSeconds) {
      return fail('trim.end no puede superar la duración del video.');
    }
    normalized.trim = { start, end };
    operationCount++;
  }

  if (plan.speed !== undefined) {
    if (typeof plan.speed !== 'number' || !ALLOWED_SPEEDS.has(plan.speed)) {
      return fail('speed debe ser 0.5, 0.75, 1, 1.25, 1.5 o 2.');
    }
    normalized.speed = plan.speed;
    operationCount++;
  }

  if (plan.aspect !== undefined) {
    if (typeof plan.aspect !== 'string' || !ALLOWED_ASPECTS.has(plan.aspect)) {
      return fail('aspect debe ser original, landscape, portrait o square.');
    }
    normalized.aspect = plan.aspect;
    operationCount++;
  }

  if (plan.volume !== undefined) {
    if (typeof plan.volume !== 'number' || !Number.isFinite(plan.volume) ||
        plan.volume < 0 || plan.volume > 200) {
      return fail('volume debe ser un número entre 0 y 200.');
    }
    normalized.volume = plan.volume;
    operationCount++;
  }

  if (plan.fade !== undefined) {
    if (typeof plan.fade !== 'boolean') return fail('fade debe ser true o false.');
    normalized.fade = plan.fade;
    operationCount++;
  }

  if (!operationCount) return fail('El plan debe incluir al menos una operación compatible.');
  return { valid: true, plan: normalized };
}
