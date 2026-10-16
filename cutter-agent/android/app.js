import { guessEpisodeNumber, sortEpisodeFiles, restoreEpisodeOrder } from "./episode-order.js";
import { loadProjectState, saveProjectState } from "./project-autosave.js";

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const filesInput = $("video-files");
  const episodeList = $("episode-list");
  const fileCount = $("file-count");
  const clearButton = $("clear-files");
  const watermarkText = $("watermark-text");
  const watermarkInput = $("watermark-file");
  const watermarkName = $("watermark-name");
  const exportStatus = $("export-status");
  let episodes = [];
  let watermark = null;
  let pendingRestore = null;
  let hasProject = false;

  const bytesLabel = bytes => bytes < 1048576
    ? (bytes / 1024).toFixed(0) + " KB"
    : (bytes / 1048576).toFixed(1) + " MB";

  try {
    pendingRestore = loadProjectState(window.localStorage);
    if (pendingRestore) {
      hasProject = true;
      watermarkText.value = pendingRestore.watermark?.text || "";
      if (pendingRestore.watermark?.image_name) {
        watermarkName.textContent = "Imagen anterior: " + pendingRestore.watermark.image_name + ". Vuelve a seleccionarla al reabrir la aplicación.";
      }
    }
  } catch {
    exportStatus.textContent = "El guardado automático no está disponible en este navegador.";
  }

  function persistProject() {
    if (!hasProject && episodes.length === 0 && !watermarkText.value.trim()) return;
    try {
      saveProjectState(window.localStorage, {
        episodes: episodes.map((episode, index) => ({
          order: index + 1,
          name: episode.file.name,
          size_bytes: episode.file.size,
          last_modified: episode.file.lastModified
        })),
        watermark: {
          text: watermarkText.value.trim(),
          image_name: watermark?.name || pendingRestore?.watermark?.image_name || null
        }
      });
      hasProject = true;
      exportStatus.textContent = "Guardado automáticamente en este dispositivo.";
    } catch {
      exportStatus.textContent = "No se pudo guardar automáticamente. Comprueba el espacio disponible del navegador.";
    }
  }

  function render() {
    episodeList.replaceChildren();
    fileCount.textContent = episodes.length + (episodes.length === 1 ? " archivo" : " archivos");
    clearButton.disabled = episodes.length === 0;
    if (!episodes.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = pendingRestore?.episodes?.length
        ? "Proyecto recuperado. Vuelve a seleccionar los videos originales para restaurar el orden."
        : "Aún no has seleccionado episodios.";
      episodeList.append(empty);
      $("order-summary").textContent = pendingRestore?.episodes?.length
        ? pendingRestore.episodes.map((item, i) => (i + 1) + ". " + item.name).join("\n")
        : "Añade episodios para preparar el orden.";
      $("order-summary").style.whiteSpace = "pre-line";
      if (!pendingRestore?.episodes?.length) persistProject();
      return;
    }

    episodes.forEach((episode, index) => {
      const li = document.createElement("li");
      li.className = "episode-row";
      const number = document.createElement("span");
      number.className = "episode-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const info = document.createElement("span");
      info.className = "episode-info";
      const name = document.createElement("span");
      name.className = "episode-name";
      name.textContent = episode.file.name;
      const size = document.createElement("span");
      size.className = "episode-size";
      size.textContent = bytesLabel(episode.file.size);
      info.append(name, size);
      const controls = document.createElement("span");
      controls.className = "move-buttons";
      [["↑", "Subir episodio", index - 1], ["↓", "Bajar episodio", index + 1]].forEach(([label, title, target]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "icon-button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title + ": " + episode.file.name);
        button.disabled = target < 0 || target >= episodes.length;
        button.addEventListener("click", () => {
          const [moved] = episodes.splice(index, 1);
          episodes.splice(target, 0, moved);
          render();
        });
        controls.append(button);
      });
      li.append(number, info, controls);
      episodeList.append(li);
    });

    $("order-summary").textContent = episodes.map((item, i) => (i + 1) + ". " + item.file.name).join("\n");
    $("order-summary").style.whiteSpace = "pre-line";
    persistProject();
  }

  filesInput.addEventListener("change", () => {
    const existing = new Set(episodes.map(episode => episode.key));
    for (const file of Array.from(filesInput.files || [])) {
      const key = [file.name, file.size, file.lastModified].join("|");
      if (!existing.has(key) && file.size > 0) {
        episodes.push({ key, file, detectedEpisode: guessEpisodeNumber(file.name) });
        existing.add(key);
      }
    }
    filesInput.value = "";
    if (pendingRestore?.episodes?.length) {
      const restored = restoreEpisodeOrder(episodes, pendingRestore.episodes);
      episodes = restored.episodes;
      const unmatched = restored.unmatched;
      pendingRestore = null;
      render();
      exportStatus.textContent = "Proyecto recuperado automáticamente." + (unmatched ? " No coincidieron " + unmatched + " episodio(s); revisa el orden." : "");
    } else {
      episodes = sortEpisodeFiles(episodes);
      render();
    }
  });

  clearButton.addEventListener("click", () => {
    episodes = [];
    pendingRestore = null;
    hasProject = true;
    render();
    persistProject();
  });

  watermarkText.addEventListener("input", persistProject);
  watermarkInput.addEventListener("change", () => {
    watermark = watermarkInput.files && watermarkInput.files[0] ? watermarkInput.files[0] : null;
    watermarkName.textContent = watermark ? watermark.name + " · " + bytesLabel(watermark.size) : "No se ha seleccionado una imagen.";
    persistProject();
  });

  render();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
