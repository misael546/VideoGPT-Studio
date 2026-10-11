import { interpretVideoInstructions } from './natural-language.js';

// Lightweight Spanish normalization for casual spelling, missing accents,
// voice transcription mistakes and common chat abbreviations. This is a
// deterministic local layer: it never sends the user's video or prompt away.
const phraseCorrections = [
  [/\bprofecional\b/g, 'profesional'],
  [/\bprofecion(al|ales)?\b/g, 'profesional'],
  [/\bvos\b/g, 'voz'],
  [/\bboz\b/g, 'voz'],
  [/\bhaser\b/g, 'hacer'],
  [/\baser\b/g, 'hacer'],
  [/\bhaslo\b/g, 'hazlo'],
  [/\baslo\b/g, 'hazlo'],
  [/\bponle\b/g, 'ponle'],
  [/\bmas\b/g, 'más'],
  [/\bpa\s+que\b/g, 'para que'],
  [/\bpal\b/g, 'para el'],
  [/\bvideo\s+mas\s+largo\b/g, 'video más largo'],
  [/\bmas\s+larg[oa]\b/g, 'más largo'],
  [/\bquitalo\b/g, 'quítalo'],
  [/\bcortalo\b/g, 'córtalo'],
  [/\bdejalo\b/g, 'déjalo'],
  [/\bponlo\b/g, 'ponlo'],
];

export function normalizeCasualSpanish(input) {
  let text = String(input ?? '').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of phraseCorrections) text = text.replace(pattern, replacement);
  return text;
}

function inferQualityPlan(text, durationSeconds) {
  const normalized = normalizeCasualSpanish(text).toLocaleLowerCase('es');
  const asksPolish = /\b(profesional|pulido|mejoralo|mejorarlo|mejorar el video|que se vea mejor|mas atractivo|mas dinamico)\b/.test(normalized);
  if (!asksPolish) return null;

  // Only choose conservative, reversible edits. Never invent a trim or crop.
  const plan = { fade: true, volume: 90 };
  const understood = ['fundidos suaves', 'audio original al 90%'];
  if (/\b(mas dinamico|ritmo dinamico|mas rapido)\b/.test(normalized)) {
    plan.speed = 1.25;
    understood.push('velocidad 1.25x para un ritmo más dinámico');
  }
  return { plan, understood, durationSeconds };
}

export function planVideoInstruction(input, durationSeconds = 0) {
  const corrected = normalizeCasualSpanish(input);
  const base = interpretVideoInstructions(corrected, durationSeconds);
  const quality = inferQualityPlan(corrected, durationSeconds);

  if (base.status === 'clarify' && quality) {
    return {
      status: 'ok',
      plan: quality.plan,
      understood: quality.understood,
      correctedInput: corrected,
      explanation: 'Interpreté la petición como una mejora conservadora; no recorté ni cambié el formato.'
    };
  }

  if (quality && base.status === 'ok') {
    return {
      ...base,
      plan: { ...quality.plan, ...base.plan },
      understood: [...quality.understood, ...base.understood],
      correctedInput: corrected
    };
  }

  return { ...base, correctedInput: corrected };
}
