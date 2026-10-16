import { loadProjectState, saveProjectState } from "./project-autosave.js";

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const episodeList = $("episode-list");
  const fileCount = $("file-count");
  const clearButton = $("clear-files");
  const watermarkText = $("watermark-text");
  const watermarkInput = $("watermark-file");
  const watermarkName = $("watermark-name");
  const exportStatus = $("export-status");
  const connectButton = $("connect-pc");
  const createButton = $("create-video");
  const pcAddress = $("pc-address");
  let project = null;
  let watermarkImageName = null;

  const bytesLabel = bytes => bytes < 1048576
    ? (bytes / 1024).toFixed(0) + " KB"
    : (bytes / 1048576).toFixed(1) + " MB";

  try {
    project = loadProjectState(window.localStorage);
    if (project) {
      watermarkText.value = project.watermark?.text || "";
      watermarkImageName = project.watermark?.image_name || null;
      if (watermarkImageName) {
        watermarkName.textContent = "Imagen guardada: " + watermarkImageName + ". Vuelve a seleccionarla en la PC para usarla.";
      }
    }
  } catch {
    exportStatus.textContent = "El guardado automático no está disponible en este navegador.";
  }

  function persistProject() {
    try {
      saveProjectState(window.localStorage, {
        episodes: (project?.episodes || []).map((item, index) => ({
          order: index + 1,
          name: item.name,
          size_bytes: item.size_bytes,
          last_modified: item.last_modified
        })),
        watermark: {
          text: watermarkText.value.trim(),
          image_name: watermarkImageName
        }
      });
      exportStatus.textContent = "Configuración ligera guardada automáticamente en este dispositivo.";
    } catch {
      exportStatus.textContent = "No se pudo guardar la configuración automáticamente.";
    }
  }

  function renderEpisodes() {
    const episodes = project?.episodes || [];
    episodeList.replaceChildren();
    fileCount.textContent = episodes.length + (episodes.length === 1 ? " episodio" : " episodios");
    clearButton.disabled = episodes.length === 0;
    if (!episodes.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Conecta la PC para cargar la lista de episodios. No selecciones vídeos desde Android.";
      episodeList.append(empty);
      $("order-summary").textContent = "El orden de salida aparecerá cuando la PC comparta el proyecto.";
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
      name.textContent = episode.name;
      const size = document.createElement("span");
      size.className = "episode-size";
      size.textContent = bytesLabel(episode.size_bytes || 0) + " · archivo en PC";
      info.append(name, size);
      const controls = document.createElement("span");
      controls.className = "move-buttons";
      [[ "↑", index - 1, "Subir episodio" ], [ "↓", index + 1, "Bajar episodio" ]].forEach(([label, target, title]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "icon-button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title + ": " + episode.name);
        button.disabled = target < 0 || target >= episodes.length;
        button.addEventListener("click", () => {
          const [moved] = project.episodes.splice(index, 1);
          project.episodes.splice(target, 0, moved);
          renderEpisodes();
          persistProject();
        });
        controls.append(button);
      });
      li.append(number, info, controls);
      episodeList.append(li);
    });
    $("order-summary").textContent = episodes.map((item, index) => (index + 1) + ". " + item.name).join("\n");
    $("order-summary").style.whiteSpace = "pre-line";
  }

  connectButton.addEventListener("click", () => {
    $("pc-status").textContent = "No conectada";
    $("connection-status").textContent = "El agente remoto seguro de Windows todavía no está disponible. No se ha intentado una conexión ni se ha enviado ningún archivo.";
    $("preview-status").textContent = "La previsualización por transmisión se habilitará cuando el agente de la PC esté implementado.";
    $("render-status").textContent = "La creación está deshabilitada hasta verificar la conexión segura con la PC.";
    createButton.disabled = true;
  });

  createButton.addEventListener("click", () => {
    $("render-status").textContent = "No se inició ningún renderizado: el agente remoto de la PC aún no está conectado.";
  });

  clearButton.addEventListener("click", () => {
    if (!project) return;
    project.episodes = [];
    renderEpisodes();
    persistProject();
  });

  watermarkText.addEventListener("input", persistProject);
  watermarkInput.addEventListener("change", () => {
    const file = watermarkInput.files?.[0];
    watermarkImageName = file?.name || watermarkImageName;
    watermarkName.textContent = file
      ? file.name + " · " + bytesLabel(file.size) + " · seleccionada en este dispositivo; selecciona la imagen original en la PC para renderizar."
      : "No se ha seleccionado una imagen.";
    persistProject();
  });

  renderEpisodes();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
