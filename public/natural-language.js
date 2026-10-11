const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const normalize = (value) => value.toLocaleLowerCase('es').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[,]/g, '.').replace(/\s+/g, ' ').trim();

const number = '(\\d+(?:\\.\\d+)?)';
const timeWord = '(?:segundos?|seg|secs?|s)';

function matchOne(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

export function interpretVideoInstructions(input, durationSeconds = 0) {
  const text = normalize(String(input || ''));
  if (!text) return { status: 'clarify', question: '¿Qué quieres cambiar del video? Puedes decirme el recorte, formato, velocidad o volumen.' };

  const plan = {};
  const understood = [];
  const questions = [];
  let recognized = 0;

  const range = matchOne(text, [
    new RegExp('(?:de|desde|del segundo)\\s*' + number + '\\s*(?:a|hasta|al)\\s*' + number + '(?:\\s*' + timeWord + ')?'),
    new RegExp('entre\\s*' + number + '\\s*y\\s*' + number + '\\s*' + timeWord)
  ]);
  const start = matchOne(text, [
    new RegExp('(?:quita|elimina|corta|recorta|salta|omite)\\s+(?:los\\s+)?primeros?\\s*' + number + '\\s*' + timeWord),
    new RegExp('(?:empieza|inicia|comienza|arranca|parte)\\s+(?:en|desde|a partir de)\\s*' + number + '\\s*' + timeWord),
    new RegExp('(?:desde|inicio|comienzo)\\s*(?:el segundo)?\\s*' + number + '\\s*' + timeWord)
  ]);
  const end = matchOne(text, [
    new RegExp('(?:termina|acaba|finaliza|corta|recorta|dejalo|dejalo hasta|que termine)\\s+(?:en|hasta|al)\\s*' + number + '\\s*' + timeWord),
    new RegExp('(?:hasta|final|finaliza en)\\s*(?:el segundo)?\\s*' + number + '\\s*' + timeWord)
  ]);

  if (range) {
    plan.trim = { start: Number(range[1]), end: Number(range[2]) };
    understood.push('recortar de ' + range[1] + ' a ' + range[2] + ' segundos');
    recognized++;
  } else {
    if (start) {
      plan.trim = { start: Number(start[1]), end: durationSeconds || null };
      understood.push('empezar en ' + start[1] + ' segundos');
      recognized++;
    }
    if (end) {
      plan.trim = { ...(plan.trim || { start: 0 }), end: Number(end[1]) };
      understood.push('terminar en ' + end[1] + ' segundos');
      recognized++;
    }
  }

  const speed = matchOne(text, [
    new RegExp('(?:velocidad|rapidez|acelera(?:lo|r)?|mas rapido|mas lenta|mas despacio|a camara lenta|ponlo a|pon la velocidad en)\\s*(?:a|en)?\\s*' + number + '\\s*(?:x|veces)?'),
    new RegExp('(' + SPEEDS.map(String).join('|').replace(/\\./g, '\\.') + ')\\s*x')
  ]);
  if (speed) {
    const value = Number(speed[1]);
    if (SPEEDS.includes(value)) {
      plan.speed = value;
      understood.push('velocidad ' + value + 'x');
      recognized++;
    } else if (/velocidad|rapido|rapida|lenta|despacio|camara lenta|acelera/.test(text)) {
      questions.push('¿Qué velocidad quieres: 0.5x, 0.75x, 1x, 1.25x, 1.5x o 2x?');
    }
  } else if (/camara lenta|muy lento|super lento|despacio/.test(text)) {
    plan.speed = 0.5;
    understood.push('cámara lenta');
    recognized++;
  } else if (/acelera|mas rapido|mas rapida|mas velocidad/.test(text)) {
    plan.speed = 1.5;
    understood.push('velocidad rápida 1.5x');
    recognized++;
  } else if (/velocidad|rapidez/.test(text)) {
    questions.push('¿A qué velocidad lo quieres: 0.5x, 0.75x, 1x, 1.25x, 1.5x o 2x?');
  }

  if (/vertical|tiktok|reels?|shorts?|retrato|9:16|historia de instagram/.test(text)) {
    plan.aspect = 'portrait'; understood.push('formato vertical'); recognized++;
  } else if (/cuadrado|1:1|post cuadrado/.test(text)) {
    plan.aspect = 'square'; understood.push('formato cuadrado'); recognized++;
  } else if (/horizontal|paisaje|youtube|16:9|pantalla ancha/.test(text)) {
    plan.aspect = 'landscape'; understood.push('formato horizontal'); recognized++;
  } else if (/formato|proporcion|aspecto|orientacion/.test(text)) {
    questions.push('¿Lo quieres vertical 9:16, horizontal 16:9 o cuadrado 1:1?');
  }

  const volume = matchOne(text, [
    new RegExp('(?:volumen|audio|sonido)\\s*(?:original\\s*)?(?:al|a|en|de)?\\s*' + number + '\\s*%'),
    new RegExp('(?:baja|bajar|reduce|reducir|sube|subir|aumenta|aumentar)\\s+(?:el\\s+)?(?:volumen|audio|sonido)\\s+(?:al|a|en)\\s*' + number + '\\s*%')
  ]);
  if (/silencia|silenciar|sin sonido|sin audio|quita el audio|mutea|mute/.test(text)) {
    plan.volume = 0; understood.push('silenciar audio'); recognized++;
  } else if (volume) {
    const value = Math.round(Number(volume[1]) / 10) * 10;
    if (value >= 0 && value <= 200) {
      plan.volume = value; understood.push('volumen ' + value + '%'); recognized++;
    } else questions.push('El volumen admite de 0% a 200%. ¿Qué porcentaje quieres usar?');
  } else if (/volumen|audio|sonido/.test(text)) {
    questions.push('¿Qué volumen quieres: 0% (silencio), 50%, 70%, 100% u otro porcentaje entre 0% y 200%?');
  }

  if (/fundido|fundidos|transicion suave|transiciones suaves|entrada suave|salida suave|fade/.test(text)) {
    plan.fade = !/sin fundido|sin fundidos|quita los fundidos|quitar fundidos|sin transiciones/.test(text);
    understood.push(plan.fade ? 'fundidos suaves' : 'sin fundidos');
    recognized++;
  }

  const unsupported = text.split(/\s+/).filter(word =>
    /\b(efecto|efectos|subtitulos|subtitulos automaticos|traduce|traducir|elimina el fondo|quita el fondo|estabiliza|estabilizar|color cinematografico|corrige el color|mejora la calidad|4k|8k|ia|inteligencia artificial|voz de|narracion|musica|cancion|zoom|transicion|transiciones|filtro|filtros)\b/.test(word)
  );
  if (recognized === 0 && questions.length === 0) {
    return {
      status: 'clarify',
      question: 'No entendí qué cambio quieres hacer. ¿Me lo puedes explicar de otra forma? Por ahora puedo recortar, cambiar formato, ajustar velocidad o volumen y añadir fundidos suaves.',
      understood
    };
  }
  if (questions.length) {
    return { status: 'clarify', question: questions.join(' '), understood, partialPlan: plan };
  }
  if (plan.trim && plan.trim.end === null) {
    return { status: 'clarify', question: 'Entendí el inicio del recorte, pero necesito saber dónde terminar. ¿Hasta qué segundo quieres conservar el video?', understood, partialPlan: plan };
  }
  if (plan.trim && durationSeconds > 0 && plan.trim.end > durationSeconds) {
    return { status: 'clarify', question: 'El final que pediste supera la duración del video (' + durationSeconds.toFixed(1) + ' s). ¿Quieres usar el final del video o indicar otro segundo?', understood, partialPlan: plan };
  }
  if (unsupported.length) {
    return { status: 'partial', question: 'Entendí: ' + understood.join(', ') + '. Hay otra petición que todavía no puedo aplicar con seguridad. ¿Quieres generar con estos cambios o explicarme esa parte?', understood, plan };
  }
  return { status: 'ok', understood, plan };
}
