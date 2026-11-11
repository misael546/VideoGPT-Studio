"use strict";

import { moveEpisodeToPosition } from "./episode-order.js";

const state = { plan: null, filesByName: new Map(), previewUrl: null };
const ui = {
  planFile: document.getElementById("planFile"),
  videoFolder: document.getElementById("videoFolder"),
  status: document.getElementById("status"),
  scanWarnings: document.getElementById("scanWarnings"),
  scanWarningList: document.getElementById("scanWarningList"),
  summary: document.getElementById("summary"),
  episodeCount: document.getElementById("episodeCount"),
  cutCount: document.getElementById("cutCount"),
  approvedCount: document.getElementById("approvedCount"),
  pendingCount: document.getElementById("pendingCount"),
  previewVideo: document.getElementById("previewVideo"),
  previewFilename: document.getElementById("previewFilename"),
  previewHelp: document.getElementById("previewHelp"),
  filterStatus: document.getElementById("filterStatus"),
  episodeList: document.getElementById("episodeList"),
  exportPlan: document.getElementById("exportPlan"),
  stopReview: document.getElementById("stopReview"),
};

function setStatus(message, kind) {
  ui.status.textContent = message;
  if (kind) ui.status.dataset.kind = kind;
  else delete ui.status.dataset.kind;
}

function renderScanWarnings(plan) {
  const warnings = plan && Array.isArray(plan.scan_warnings) ? plan.scan_warnings : [];
  ui.scanWarningList.replaceChildren();
  ui.scanWarnings.hidden = warnings.length === 0;
  for (const warning of warnings) {
    const li = el("li", "", [
      warning.type === "audio_warning" ? "Audio" :
        warning.type === "visual_warning" ? "Visual" : "Vídeo",
      warning.filename || "archivo desconocido",
      warning.edge ? "(" + warning.edge + ")" : "",
      warning.message || "Error de análisis sin detalle",
    ].filter(Boolean).join(" — "));
    ui.scanWarningList.append(li);
  }
}

function loadedPlanStatus(plan, fromServer) {
  const warnings = plan && Array.isArray(plan.scan_warnings) ? plan.scan_warnings.length : 0;
  const prefix = fromServer ? "Plan cargado desde tu PC: " : "Plan cargado: ";
  const message = prefix + plan.episodes.length + " episodios y " + cutCountForPlan() + " candidatos." +
    (fromServer ? " Las vistas previas se generan localmente con FFmpeg." : " Selecciona la carpeta de vídeos para previsualizar.") +
    (warnings ? " Hay " + warnings + " advertencias del análisis; consulta el panel." : "");
  return { message: message, kind: warnings ? "warning" : "success" };
}

function formatSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "—";
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  const tenths = Math.floor((seconds - Math.floor(seconds)) * 10);
  return minutes > 0
    ? minutes + ":" + String(remainder).padStart(2, "0") + "." + tenths
    : remainder + "." + tenths + " s";
}

function isServerMode() {
  return window.location.protocol === "http:" && window.location.hostname === "127.0.0.1";
}

function basename(path) {
  return String(path || "").split(/[\\/]/).pop() || "";
}

function getCutState(cut) {
  if (cut.approved === true || cut.review_status === "approved") return "approved";
  if (cut.review_status === "rejected") return "rejected";
  return "pending";
}

function stateLabel(value) {
  const labels = {
    approved: "Aprobado para eliminar",
    rejected: "Conservar",
    pending: "Pendiente de revisión",
  };
  return labels[value] || labels.pending;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cutCountForPlan() {
  return (state.plan?.episodes || []).reduce(function (sum, episode) {
    return sum + (Array.isArray(episode.cuts) ? episode.cuts.length : 0);
  }, 0);
}

function updateCounters() {
  if (!state.plan) {
    ui.summary.hidden = true;
    ui.exportPlan.disabled = true;
    ui.filterStatus.disabled = true;
    return;
  }
  const episodes = state.plan.episodes || [];
  const cuts = episodes.flatMap(function (episode) {
    return Array.isArray(episode.cuts) ? episode.cuts : [];
  });
  const approved = cuts.filter(function (cut) { return getCutState(cut) === "approved"; }).length;
  const rejected = cuts.filter(function (cut) { return getCutState(cut) === "rejected"; }).length;
  ui.summary.hidden = false;
  ui.episodeCount.textContent = String(episodes.length);
  ui.cutCount.textContent = String(cuts.length);
  ui.approvedCount.textContent = String(approved);
  ui.pendingCount.textContent = String(cuts.length - approved - rejected);
  ui.filterStatus.disabled = false;
  ui.exportPlan.disabled = false;
}

function compactPath(path) {
  const parts = String(path || "").split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/");
}

function sourceDescription(cut) {
  const pathPairs = Array.isArray(cut.source_path_pairs) ? cut.source_path_pairs :
    Array.isArray(cut.source_path_pair) ? [cut.source_path_pair] : [];
  if (pathPairs.length) {
    return pathPairs.map(function (pair) {
      return Array.isArray(pair) ? pair.map(compactPath).join(" ↔ ") : "";
    }).filter(Boolean).join(" · ");
  }
  return (cut.source_pair || []).join(" ↔ ") || "no indicado";
}

function evidenceLabels(cut) {
  const quality = cut.match_quality && typeof cut.match_quality === "object" ? cut.match_quality : {};
  const nested = ["visual", "audio"].filter(function (key) {
    return quality[key] && typeof quality[key] === "object";
  });
  const modalities = Array.isArray(cut.modalities) && cut.modalities.length ? cut.modalities : nested;
  const labels = [];
  for (const modality of modalities) {
    const item = quality[modality];
    const mode = modality === "visual" ? "Visual" : modality === "audio" ? "Audio" : modality;
    if (item && typeof item === "object") {
      const level = item.level ? " · calidad " + item.level : "";
      const ratio = Number.isFinite(Number(item.match_ratio))
        ? " · " + Math.round(Number(item.match_ratio) * 100) + "% de muestras"
        : "";
      labels.push(mode + level + ratio);
    } else {
      labels.push(mode);
    }
  }
  if (!labels.length && quality.level) {
    labels.push("Coincidencia " + quality.level);
    if (Number.isFinite(Number(quality.match_ratio))) {
      labels.push(Math.round(Number(quality.match_ratio) * 100) + "% de muestras");
    }
  }
  if (cut.boundary_expanded) labels.push("Límite ampliado hasta el borde");
  if (Array.isArray(cut.source_pairs) && cut.source_pairs.length > 1) {
    labels.push("Repetido en " + cut.source_pairs.length + " comparaciones");
  }
  return labels.length ? labels : ["Sin métricas de coincidencia"];
}

async function preview(episode, cut, episodeIndex) {
  ui.previewFilename.textContent = episode.filename || basename(episode.path);
  ui.previewHelp.textContent = "Candidato " + (cut.id || "") + ": " + formatSeconds(cut.start_seconds) + "–" + formatSeconds(cut.end_seconds) + ". Comprueba ambos límites antes de aprobar.";
  document.querySelector(".preview-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  let nextUrl;
  let playbackStart = 0;

  if (isServerMode()) {
    setStatus("Preparando vista previa local en streaming…", "warning");
    const params = new URLSearchParams({
      episode: String(episodeIndex),
      episode_path: String(episode.path || ""),
      start: String(cut.start_seconds),
      end: String(cut.end_seconds),
    });
    // The server includes four seconds of context before the candidate. Point the
    // media element at the endpoint directly so it requests byte ranges instead
    // of downloading the entire preview into a JavaScript Blob first.
    const cutStart = Number(cut.start_seconds) || 0;
    playbackStart = Math.max(0, cutStart - 4);
    nextUrl = "/api/preview?" + params.toString();
  } else {
    const filename = String(episode.filename || basename(episode.path)).toLowerCase();
    const choices = state.filesByName.get(filename);
    if (!choices || choices.length === 0) {
      setStatus("Selecciona primero la carpeta que contiene los episodios para activar las previsualizaciones.", "warning");
      return;
    }
    if (choices.length > 1) {
      setStatus('Hay varios archivos llamados "' + episode.filename + '". Usa nombres únicos para previsualizarlos sin ambigüedad.', "warning");
      return;
    }
    nextUrl = URL.createObjectURL(choices[0]);
  }

  const oldUrl = state.previewUrl;
  ui.previewVideo.pause();
  ui.previewVideo.src = nextUrl;
  state.previewUrl = nextUrl;
  ui.previewVideo.load();
  ui.previewVideo.onloadedmetadata = function () {
    const start = Number(cut.start_seconds) || 0;
    const target = isServerMode() ? start - playbackStart : start - 5;
    ui.previewVideo.currentTime = Math.max(0, Math.min(target, Math.max(0, ui.previewVideo.duration - 0.1)));
    setStatus("Vista previa lista. Comprueba el inicio y el final del intervalo.", "success");
  };
  ui.previewVideo.onerror = function () {
    setStatus("El navegador no pudo reproducir la vista previa.", "warning");
  };
  if (oldUrl && oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
}

function makeCutCard(episode, cut, index, episodeIndex) {
  const card = el("article", "cut-card");
  const head = el("div", "cut-head");
  const titleBlock = el("div");
  titleBlock.append(el("h4", "", (cut.id || ("Candidato " + (index + 1))) + " · " + (cut.edge === "end" ? "Zona final" : "Zona inicial")));
  const subtitle = el("p", "cut-subtitle", "Tramo propuesto: " + formatSeconds(cut.start_seconds) + "–" + formatSeconds(cut.end_seconds) + " · Origen comparado: " + sourceDescription(cut));
  titleBlock.append(subtitle);
  const pill = el("span", "status-pill", stateLabel(getCutState(cut)));
  pill.dataset.state = getCutState(cut);
  head.append(titleBlock, pill);

  const evidence = el("div", "evidence");
  for (const label of evidenceLabels(cut)) evidence.append(el("span", "evidence-tag", label));
  const controls = el("div", "cut-controls");

  const startLabel = el("label");
  startLabel.append(el("span", "field-title", "Inicio del corte (segundos)"));
  const startInput = el("input");
  startInput.type = "number";
  startInput.min = "0";
  startInput.max = String(episode.duration_seconds);
  startInput.step = "0.1";
  startInput.value = String(cut.start_seconds);
  startLabel.append(startInput);

  const endLabel = el("label");
  endLabel.append(el("span", "field-title", "Final del corte (segundos)"));
  const endInput = el("input");
  endInput.type = "number";
  endInput.min = "0";
  endInput.max = String(episode.duration_seconds);
  endInput.step = "0.1";
  endInput.value = String(cut.end_seconds);
  endLabel.append(endInput);

  const stateLabelEl = el("label");
  stateLabelEl.append(el("span", "field-title", "Decisión"));
  const decision = el("select");
  for (const pair of [
    ["pending", "Pendiente de revisión"],
    ["approved", "Aprobar eliminación"],
    ["rejected", "Conservar (no eliminar)"],
  ]) {
    const option = el("option", "", pair[1]);
    option.value = pair[0];
    decision.append(option);
  }
  decision.value = getCutState(cut);
  stateLabelEl.append(decision);

  const previewButton = el("button", "secondary-button", "Ver candidato");
  previewButton.type = "button";
  previewButton.addEventListener("click", function () { preview(episode, cut, episodeIndex); });

  function handleTimeChange() {
    const start = Number(startInput.value);
    const end = Number(endInput.value);
    const duration = Number(episode.duration_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.05) {
      setStatus("Intervalo no válido en " + episode.filename + ": usa 0 ≤ inicio < fin ≤ " + formatSeconds(duration) + ".", "error");
      startInput.value = String(cut.start_seconds);
      endInput.value = String(cut.end_seconds);
      return;
    }
    cut.start_seconds = Math.round(start * 1000) / 1000;
    cut.end_seconds = Math.round(end * 1000) / 1000;
    subtitle.textContent = "Tramo propuesto: " + formatSeconds(cut.start_seconds) + "–" + formatSeconds(cut.end_seconds) + " · Origen comparado: " + ((cut.source_pair || []).join(" ↔ ") || "no indicado");
    setStatus("Cambios de tiempo guardados en memoria. Exporta el plan cuando termines.", "success");
  }
  startInput.addEventListener("change", handleTimeChange);
  endInput.addEventListener("change", handleTimeChange);

  decision.addEventListener("change", function () {
    cut.review_status = decision.value;
    cut.approved = decision.value === "approved";
    pill.textContent = stateLabel(getCutState(cut));
    pill.dataset.state = getCutState(cut);
    updateCounters();
    if (ui.filterStatus.value !== "all") renderPlan();
    setStatus(
      cut.approved ? "Corte aprobado para eliminar. Exporta el plan revisado antes de renderizar." :
        decision.value === "rejected" ? "Corte marcado para conservar." : "Corte pendiente; se conservará al renderizar.",
      cut.approved ? "warning" : "success"
    );
  });

  controls.append(startLabel, endLabel, stateLabelEl, previewButton);
  card.append(head, evidence, controls);
  return card;
}

function renderPlan() {
  ui.episodeList.replaceChildren();
  if (!state.plan) {
    ui.episodeList.append(el("div", "empty-state", "Carga un plan para ver los episodios y las coincidencias detectadas."));
    updateCounters();
    return;
  }
  const filter = ui.filterStatus.value;
  let visibleCuts = 0;
  state.plan.episodes.forEach(function (episode, episodeIndex) {
    const cuts = Array.isArray(episode.cuts) ? episode.cuts : [];
    const filteredCuts = cuts.map(function (cut, index) { return { cut: cut, index: index }; })
      .filter(function (item) { return filter === "all" || getCutState(item.cut) === filter; });
    if (filter !== "all" && filteredCuts.length === 0) return;

    const card = el("section", "episode-card");
    const header = el("div", "episode-header");
    const titleGroup = el("div", "episode-title-group");
    const seasonLabel = episode.season_number !== null && episode.season_number !== undefined
      ? "Temporada " + episode.season_number + " · "
      : "";
    titleGroup.append(
      el("h3", "", episode.filename || basename(episode.path)),
      el("p", "", seasonLabel + "Episodio " + (episode.episode_number ?? "sin número") + " · " + formatSeconds(episode.duration_seconds) + " · " + filteredCuts.length + " cortes mostrados")
    );

    const orderLabel = el("label", "episode-order");
    orderLabel.append(el("span", "field-title", "Orden de salida"));
    const orderSelect = el("select");
    const episodeCount = state.plan.episodes.length;
    orderSelect.setAttribute("aria-label", "Orden final para " + (episode.filename || basename(episode.path)));
    for (let position = 1; position <= episodeCount; position += 1) {
      const option = el("option", "", position + " de " + episodeCount);
      option.value = String(position);
      orderSelect.append(option);
    }
    orderSelect.value = String(episodeIndex + 1);
    orderSelect.addEventListener("change", function () {
      const requestedPosition = Number(orderSelect.value);
      try {
        moveEpisodeToPosition(state.plan.episodes, episodeIndex, requestedPosition);
      } catch (error) {
        setStatus(error.message || "No se pudo cambiar el orden de los episodios.", "error");
        renderPlan();
        return;
      }
      state.plan.episodes.forEach(function (item, index) { item.order = index + 1; });
      if (ui.filterStatus.value !== "all") ui.filterStatus.value = "all";
      renderPlan();
      const movedEpisode = state.plan.episodes[requestedPosition - 1];
      setStatus(
        "Orden actualizado: " + (movedEpisode.filename || basename(movedEpisode.path)) +
          " está en la posición " + requestedPosition + " de " + episodeCount +
          ". Exporta o guarda el plan revisado para conservar el cambio.",
        "success"
      );
    });
    orderLabel.append(orderSelect);
    header.append(titleGroup, orderLabel);
    const list = el("div", "cut-list");
    for (const item of filteredCuts) {
      visibleCuts += 1;
      list.append(makeCutCard(episode, item.cut, item.index, episodeIndex));
    }
    card.append(header, list);
    ui.episodeList.append(card);
  });
  if (!visibleCuts) ui.episodeList.append(el("div", "empty-state", "No hay candidatos para este filtro."));
  updateCounters();
}

function validatePlanForExport() {
  const errors = [];
  for (const episode of state.plan.episodes) {
    const duration = Number(episode.duration_seconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push((episode.filename || basename(episode.path)) + ": duración inválida.");
      continue;
    }
    const approvedIntervals = [];
    for (const cut of episode.cuts || []) {
      const start = Number(cut.start_seconds);
      const end = Number(cut.end_seconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.05) {
        errors.push((episode.filename || basename(episode.path)) + ", " + (cut.id || "corte") + ": intervalo fuera de la duración del episodio.");
        continue;
      }
      if (cut.approved === true) approvedIntervals.push([Math.max(0, start), Math.min(duration, end)]);
    }
    approvedIntervals.sort(function (a, b) { return a[0] - b[0]; });
    let cursor = 0;
    let remaining = 0;
    for (const interval of approvedIntervals) {
      if (interval[0] > cursor) remaining += interval[0] - cursor;
      cursor = Math.max(cursor, interval[1]);
    }
    remaining += Math.max(0, duration - cursor);
    if (remaining < 0.05) errors.push((episode.filename || basename(episode.path)) + ": los cortes aprobados eliminarían todo el episodio.");
  }
  return errors;
}

async function loadPlanFile(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed.schema !== "cutter-studio-edit-plan/v1" || !Array.isArray(parsed.episodes) || parsed.episodes.length === 0) {
      throw new Error("El archivo no es un plan cutter-studio-edit-plan/v1 válido.");
    }
    for (const episode of parsed.episodes) {
      if (!episode || !episode.path || !Number.isFinite(Number(episode.duration_seconds)) || !Array.isArray(episode.cuts)) {
        throw new Error("El plan contiene un episodio con campos inválidos.");
      }
      for (const cut of episode.cuts) {
        const isApproved = cut.approved === true || cut.review_status === "approved";
        const isRejected = !isApproved && cut.review_status === "rejected";
        cut.approved = isApproved;
        cut.review_status = isApproved ? "approved" : isRejected ? "rejected" : "pending";
      }
    }
    state.plan = parsed;
    renderPlan();
    renderScanWarnings(parsed);
    const status = loadedPlanStatus(parsed, false);
    setStatus(status.message, status.kind);
  } catch (error) {
    state.plan = null;
    renderPlan();
    renderScanWarnings(null);
    setStatus(error.message || "No se pudo leer el plan JSON.", "error");
  }
}

ui.planFile.addEventListener("change", async function () {
  const file = ui.planFile.files && ui.planFile.files[0];
  await loadPlanFile(file);
});

ui.videoFolder.addEventListener("change", function () {
  state.filesByName = new Map();
  const files = Array.from(ui.videoFolder.files || []);
  for (const file of files) {
    const key = file.name.toLowerCase();
    if (!state.filesByName.has(key)) state.filesByName.set(key, []);
    state.filesByName.get(key).push(file);
  }
  const duplicates = Array.from(state.filesByName.values()).filter(function (list) { return list.length > 1; }).length;
  const unique = Array.from(state.filesByName.values()).filter(function (list) { return list.length === 1; }).length;
  if (!files.length) setStatus("No se seleccionaron archivos en la carpeta.", "warning");
  else setStatus(
    "Carpeta cargada localmente: " + files.length + " archivos, " + unique + " nombres únicos" +
      (duplicates ? ", " + duplicates + " nombres duplicados no se previsualizarán automáticamente." : "."),
    duplicates ? "warning" : "success"
  );
});

ui.filterStatus.addEventListener("change", renderPlan);

async function exportPlan() {
  if (!state.plan) return false;
  const errors = validatePlanForExport();
  if (errors.length) {
    setStatus("No se puede exportar todavía: " + errors.slice(0, 3).join(" "), "error");
    return false;
  }
  const approved = state.plan.episodes.reduce(function (sum, episode) {
    return sum + episode.cuts.filter(function (cut) { return cut.approved === true; }).length;
  }, 0);
  if (isServerMode()) {
    setStatus("Guardando plan revisado localmente…", "warning");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.plan),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el plan.");
      setStatus("Plan guardado en tu PC: " + result.filename + ". " + approved + " cortes aprobados; los demás se conservarán.", "success");
      return true;
    } catch (error) {
      setStatus(error.message || "No se pudo guardar el plan local.", "error");
      return false;
    }
  }
  const blob = new Blob([JSON.stringify(state.plan, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = el("a");
  anchor.href = url;
  anchor.download = "edit-plan-reviewed.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Plan exportado. " + approved + " cortes quedaron aprobados; los demás se conservarán. Usa edit-plan-reviewed.json para generar el manifiesto.", "success");
  return true;
}
ui.exportPlan.addEventListener("click", exportPlan);

async function stopReviewServer() {
  if (!isServerMode() || !state.plan) return;
  if (!window.confirm("Cutter Studio guardará el plan revisado en tu PC y cerrará el revisor local. Los cortes pendientes o marcados para conservar no se eliminarán. ¿Continuar?")) return;

  ui.stopReview.disabled = true;
  const saved = await exportPlan();
  if (!saved) {
    ui.stopReview.disabled = false;
    return;
  }

  try {
    const response = await fetch("/api/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo cerrar el revisor local.");
    ui.exportPlan.disabled = true;
    setStatus("Plan guardado. El revisor local está cerrado; puedes cerrar esta pestaña y volver al lanzador.", "success");
  } catch (error) {
    ui.stopReview.disabled = false;
    setStatus(error.message || "No se pudo cerrar el revisor local. Puedes detenerlo con Ctrl+C en su ventana.", "error");
  }
}
ui.stopReview.addEventListener("click", stopReviewServer);

if (isServerMode()) {
  document.querySelector(".input-grid").hidden = true;
  document.getElementById("import-title").textContent = "Plan cargado desde tu PC";
  ui.exportPlan.textContent = "Guardar plan revisado en el PC";
  ui.stopReview.hidden = false;
  ui.videoFolder.closest("label").hidden = true;
  fetch("/api/plan", { cache: "no-store" })
    .then(async function (response) {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el plan.");
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      await loadPlanFile(blob);
      renderScanWarnings(data);
      const status = loadedPlanStatus(data, true);
      setStatus(status.message, status.kind);
    })
    .catch(function (error) {
      setStatus(error.message || "No se pudo cargar el plan desde el servidor local.", "error");
    });
}

window.addEventListener("beforeunload", function () {
  if (state.previewUrl && state.previewUrl.startsWith("blob:")) URL.revokeObjectURL(state.previewUrl);
});
