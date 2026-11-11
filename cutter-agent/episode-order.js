/**
 * Move an episode to a 1-based output position without losing its cut decisions.
 * The array order is the source of truth used by the render-manifest generator.
 */
export function moveEpisodeToPosition(episodes, currentIndex, requestedPosition) {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    throw new TypeError("episodes debe ser una lista no vacía.");
  }
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= episodes.length) {
    throw new RangeError("El episodio actual está fuera de la lista.");
  }
  if (!Number.isInteger(requestedPosition) || requestedPosition < 1 || requestedPosition > episodes.length) {
    throw new RangeError("La posición final debe estar entre 1 y el número de episodios.");
  }

  const targetIndex = requestedPosition - 1;
  if (targetIndex === currentIndex) return episodes;

  const [episode] = episodes.splice(currentIndex, 1);
  episodes.splice(targetIndex, 0, episode);
  episodes.forEach((item, index) => {
    if (item && typeof item === "object") item.order = index + 1;
  });
  return episodes;
}
