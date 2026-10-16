export const PROJECT_STORAGE_KEY = "cutter-studio-android-autosave-v1";

export function createProjectSnapshot(state) {
  return {
    schema: "cutter-studio-android-autosave/v1",
    saved_at: new Date().toISOString(),
    episodes: Array.isArray(state.episodes) ? state.episodes.map((episode, index) => ({
      order: index + 1,
      name: String(episode.name || ""),
      size_bytes: Number(episode.size_bytes) || 0,
      last_modified: Number(episode.last_modified) || 0
    })) : [],
    watermark: {
      text: String(state.watermark?.text || "").slice(0, 48),
      image_name: typeof state.watermark?.image_name === "string" ? state.watermark.image_name : null
    }
  };
}

export function saveProjectState(storage, state) {
  const snapshot = createProjectSnapshot(state);
  storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function loadProjectState(storage) {
  const raw = storage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) return null;
  const project = JSON.parse(raw);
  if (!project || project.schema !== "cutter-studio-android-autosave/v1" || !Array.isArray(project.episodes)) return null;
  return {
    episodes: project.episodes.filter(item => item && typeof item.name === "string").map(item => ({
      order: Number(item.order) || 0,
      name: item.name,
      size_bytes: Number(item.size_bytes) || 0,
      last_modified: Number(item.last_modified) || 0
    })),
    watermark: {
      text: typeof project.watermark?.text === "string" ? project.watermark.text : "",
      image_name: typeof project.watermark?.image_name === "string" ? project.watermark.image_name : null
    },
    saved_at: project.saved_at || null
  };
}
