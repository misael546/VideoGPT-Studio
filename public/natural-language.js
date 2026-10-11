const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const normalize = (value) => String(value || '').toLocaleLowerCase('es')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, '').replace(/[,]/g, '.').replace(/\s+/g, ' ').trim();

const number = '(\\d+(?:\\.\\d+)?)';
const timeWord = '(?:segundos?|seg|secs?|s)';
const has = (text, pattern) => pattern.test(text);

function matchOne(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function detectAdvancedIntent(text) {
  return {
    story: has(text, /\b(historia|story|narrativ[oa]|montaje|resumen|recap|escenas?|momentos importantes|fotogramas?|cuadros clave|estilo cinematografico)\b/),
    dialogue: has(text, /\b(dialogos?|conversaciones?|lo que dicen|transcrib(?:e|ir|irlos)|subtitulos?|letras|texto en pantalla|palabras que aparecen)\b/),
    narration: has(text, /\b(narracion|narrador|voz masculina|voz de hombre|voz masculina|voz en off|locucion|que una voz|voz generada|hablado por)\b/),
    visualAnalysis: has(text, /\b(analiza|analizar|observa|revisa|detecta|reconoce|identifica)\b/) &&
      has(text, /\b(video|escenas?|personajes?|acciones?|fotogramas?|dialogos?|letras|texto)\b/)
  };
}

function advancedMessage(intents, understood) {
  const requested = [];
  if (intents.story) requested.push('revisar fotogramas y localizar posibles cambios de escena para preparar un montaje tipo historia');
  if (intents.dialogue) requested.push('transcribir diálogos o letras');
  if (intents.narration) requested.push('añadir narración');
  if (intents.visualAnalysis && !intents.story) requested.push('analizar visualmente el video');
  const parts = [];
  if (requested.length) parts.push('Entendí que quieres ' + requested.join(', ') + '.');
  if (understood.length) parts.push('También entendí estos ajustes compatibles: ' + understood.join(', ') + '.');
  if (intents.story) parts.push('Puedo analizar cambios visuales y mostrar fotogramas para que elijas puntos de corte. Esta versión todavía no retoca automáticamente la calidad de cada imagen ni une escenas seleccionadas en un montaje narrativo completo; no voy a fingir que ya lo hizo.');
  if (intents.imagePolish) parts.push('El retoque automático de imágenes aún no está implementado.');
  if (intents.dialogue || intents.narration) parts.push('Usa las herramientas de transcripción o narración solo si también las necesitas; no hacen falta para analizar escenas.');
  return parts.join(' ');
}

export function interpretVideoInstructions(input, durationSeconds = 0) {
  const text = normalize(input);
  if (!text) return { status: 'clarify', question: '¿Qué quieres cambiar del video? Puedes describir el resultado final con tus propias palabras.' };

  const plan = {};
  const understood = [];
  const questions = [];
  let recognized = 0;
  const advanced = detectAdvancedIntent(text);

  const range = text.match(/(?:\bde\b|\bdesde\b|\bdel segundo\b|\bentre\b)\s*(?:el(?:\s+segundo)?\s*)?(\d+(?:\.\d+)?)\s*(?:a|hasta|al|y)\s*(?:el(?:\s+segundo)?\s*)?(\d+(?:\.\d+)?)(?:\s*(?:segundos?|seg|s))?/) ||
    text.match(/(?:corta|recorta|conserva|deja)\s+(?:el video\s+)?(?:desde\s+)?(\d+(?:\.\d+)?)\s*(?:a|hasta|al)\s*(\d+(?:\.\d+)?)/);
  const start = matchOne(text, [
    new RegExp('(?:quita|elimina|corta|recorta|salta|omite|borra)\\s+(?:(?:los|las)\\s+)?primeros?\\s*' + number + '\\s*' + timeWord),
    new RegExp('(?:quita|elimina|corta|recorta|salta|omite)\\s+(?:la\\s+)?(?:intro(?:duccion)?|parte inicial|inicio)'),
    new RegExp('(?:empieza|inicia|comienza|arranca|parte|deja que empiece)\\s+(?:en|desde|a partir de)\\s*' + number + '\\s*' + timeWord),
    new RegExp('(?:desde|inicio|comienzo)\\s*(?:el segundo)?\\s*' + number + '\\s*' + timeWord)
  ]);
  const end = matchOne(text, [
    new RegExp('(?:termina|acaba|finaliza|corta|recorta|dejalo|dejala|conservalo|conservala)\\s+(?:en|hasta|al)\\s*' + number + '\\s*' + timeWord),
    new RegExp('(?:hasta|final|finaliza en)\\s*(?:el segundo)?\\s*' + number + '\\s*' + timeWord),
    new RegExp('(?:quita|elimina|corta)\\s+(?:los|las)\\s+ultimos?\\s*' + number + '\\s*' + timeWord)
  ]);

  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    const removeTail = /(?:quita|elimina|corta)\s+(?:los|las)\s+ultimos?/i.test(text);
    if (removeTail && durationSeconds > 0) {
      plan.trim = { start: 0, end: Math.max(0, durationSeconds - b) };
      understood.push('quitar los últimos ' + b + ' segundos');
    } else {
      plan.trim = { start: a, end: b };
      understood.push('recorte de ' + a + ' a ' + b + ' segundos');
    }
    recognized++;
  } else {
    if (start) {
      const isBeginningRemoval = /(?:primeros?|intro|introduccion|parte inicial|inicio)/.test(start[0]);
      if (isBeginningRemoval && !/\d/.test(start[0])) {
        questions.push('¿Cuántos segundos quieres quitar del inicio?');
      } else {
        const value = Number(start[1]);
        plan.trim = { start: value, end: durationSeconds || null };
        understood.push('empezar en ' + value + ' segundos');
        recognized++;
      }
    }
    if (end) {
      const value = Number(end[1]);
      if (/(?:ultimos?)/.test(end[0]) && durationSeconds > 0) {
        plan.trim = { start: Number(plan.trim?.start || 0), end: durationSeconds - value };
        understood.push('quitar los últimos ' + value + ' segundos');
      } else {
        plan.trim = { ...(plan.trim || { start: 0 }), end: value };
        understood.push('terminar en ' + value + ' segundos');
      }
      recognized++;
    }
  }

  const speed = matchOne(text, [
    new RegExp('(?:velocidad|rapidez|acelera(?:lo|r)?|mas rapido|mas lenta|mas despacio|a camara lenta|ponlo a|pon la velocidad en|hazlo a)\\s*(?:a|en)?\\s*' + number + '\\s*(?:x|veces)?'),
    new RegExp('(' + SPEEDS.map(String).join('|').replace(/\./g, '\\.') + ')\\s*x')
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
  } else if (/camara lenta|muy lento|super lento|despacio|mas lenta/.test(text)) {
    plan.speed = 0.5; understood.push('cámara lenta'); recognized++;
  } else if (/acelera|mas rapido|mas rapida|mas velocidad|ritmo mas rapido/.test(text)) {
    plan.speed = 1.5; understood.push('velocidad rápida 1.5x'); recognized++;
  } else if (/velocidad|rapidez/.test(text)) {
    questions.push('¿A qué velocidad lo quieres: 0.5x, 0.75x, 1x, 1.25x, 1.5x o 2x?');
  }

  if (/\b(vertical|tiktok|reels?|shorts?|retrato|9:16|historia de instagram|story de instagram|formato de celular|vertical|tiktok|reels?|shorts?|retrato|9:16|historia de instagram|story de instagram|estilo historia|formato historia|historia para instagram|story format|formato de celular|pantalla del telefono)\b/.test(text)) {
    plan.aspect = 'portrait'; understood.push('formato vertical'); recognized++;
  } else if (/\b(cuadrado|1:1|post cuadrado)\b/.test(text)) {
    plan.aspect = 'square'; understood.push('formato cuadrado'); recognized++;
  } else if (/\b(horizontal|paisaje|youtube|16:9|pantalla ancha)\b/.test(text)) {
    plan.aspect = 'landscape'; understood.push('formato horizontal'); recognized++;
  } else if (/formato|proporcion|aspecto|orientacion/.test(text)) {
    questions.push('¿Lo quieres vertical 9:16, horizontal 16:9 o cuadrado 1:1?');
  }

  const volume = matchOne(text, [
    new RegExp('(?:volumen|audio|sonido)\\s*(?:original\\s*)?(?:al|a|en|de)?\\s*' + number + '\\s*%'),
    new RegExp('(?:baja|bajar|reduce|reducir|sube|subir|aumenta|aumentar|deja)\\s+(?:el\\s+)?(?:volumen|audio|sonido)\\s+(?:al|a|en)\\s*' + number + '\\s*%')
  ]);
  if (/silencia|silenciar|sin sonido|sin audio|quita el audio|mutea|mute|deja mudo/.test(text)) {
    plan.volume = 0; understood.push('silenciar audio'); recognized++;
  } else if (volume) {
    const value = Math.round(Number(volume[1]) / 10) * 10;
    if (value >= 0 && value <= 200) {
      plan.volume = value; understood.push('volumen ' + value + '%'); recognized++;
    } else questions.push('El volumen admite de 0% a 200%. ¿Qué porcentaje quieres usar?');
  } else if (/volumen|audio|sonido/.test(text) && !advanced.dialogue) {
    questions.push('¿Qué volumen quieres: 0% (silencio), 50%, 70%, 100% u otro porcentaje entre 0% y 200%?');
  }

  if (/fundido|fundidos|transicion suave|transiciones suaves|entrada suave|salida suave|fade|desvanecimiento/.test(text)) {
    plan.fade = !/sin fundido|sin fundidos|quita los fundidos|quitar fundidos|sin transiciones/.test(text);
    understood.push(plan.fade ? 'fundidos suaves' : 'sin fundidos');
    recognized++;
  }

  if (advanced.story || advanced.dialogue || advanced.narration || advanced.visualAnalysis) {
    const question = advancedMessage(advanced, understood);
    return {
      status: 'partial',
      question,
      understood,
      requestedFeatures: advanced,
      ...(recognized ? { plan } : {})
    };
  }

  if (questions.length) {
    return { status: 'clarify', question: questions.join(' '), understood, partialPlan: plan };
  }
  if (recognized === 0) {
    return {
      status: 'clarify',
      question: 'Todavía no identifiqué una acción concreta. Dime el resultado que buscas y te preguntaré solo por los detalles que falten. Puedo recortar, cambiar entre vertical/horizontal/cuadrado, ajustar velocidad o volumen y aplicar fundidos.',
      understood
    };
  }
  if (plan.trim && plan.trim.end === null) {
    return { status: 'clarify', question: 'Entendí el inicio del recorte, pero necesito saber dónde terminar. ¿Hasta qué segundo quieres conservar el video?', understood, partialPlan: plan };
  }
  if (plan.trim && (plan.trim.start < 0 || plan.trim.end <= plan.trim.start)) {
    return { status: 'clarify', question: 'El recorte no parece válido. Dime el segundo inicial y el final; por ejemplo, “conserva del segundo 3 al 20”.', understood, partialPlan: plan };
  }
  if (plan.trim && durationSeconds > 0 && plan.trim.end > durationSeconds) {
    return { status: 'clarify', question: 'El final que pediste supera la duración del video (' + durationSeconds.toFixed(1) + ' s). ¿Quieres usar el final del video o indicar otro segundo?', understood, partialPlan: plan };
  }
  return { status: 'ok', understood, plan };
}
