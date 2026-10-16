export function guessEpisodeNumber(name) {
  const normalized = String(name || "").normalize("NFKC");
  const patterns = [
    /(?:^|[^a-z0-9])s\d{1,3}\s*e\s*0*(\d{1,4})(?=$|[^0-9])/i,
    /(?:episode|episodio|chapter|capitulo|capítulo|cap|ep)[ ._-]*0*(\d{1,4})(?=$|[^0-9])/i,
    /(?:^|[^a-z0-9])e[ ._-]*0*(\d{1,4})(?=$|[^0-9])/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return Number(match[1]);
  }
  const numbers = normalized.match(/(?<!\d)\d{1,3}(?!\d)/g);
  return numbers ? Number(numbers[numbers.length - 1]) : null;
}

export function sortEpisodeFiles(files) {
  return Array.from(files || []).sort((a, b) => {
    const aNumber = guessEpisodeNumber(a.name || a.file?.name);
    const bNumber = guessEpisodeNumber(b.name || b.file?.name);
    if (aNumber !== null && bNumber === null) return -1;
    if (aNumber === null && bNumber !== null) return 1;
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return aNumber - bNumber;
    return String(a.name || a.file?.name || "").localeCompare(String(b.name || b.file?.name || ""), "es", { numeric: true, sensitivity: "base" });
  });
}

export function restoreEpisodeOrder(currentEpisodes, savedEpisodes) {
  const remaining = Array.from(currentEpisodes || []);
  const ordered = [];
  let unmatched = 0;
  const requested = Array.isArray(savedEpisodes) ? [...savedEpisodes].sort((a, b) => Number(a?.order) - Number(b?.order)) : [];
  for (const saved of requested) {
    if (!saved || typeof saved.name !== "string") {
      unmatched++;
      continue;
    }
    let index = -1;
    if (Number.isFinite(Number(saved.size_bytes))) {
      index = remaining.findIndex(item =>
        item.file?.name === saved.name &&
        item.file?.size === Number(saved.size_bytes) &&
        Number.isFinite(Number(saved.last_modified)) &&
        item.file?.lastModified === Number(saved.last_modified)
      );
      if (index < 0) {
        index = remaining.findIndex(item =>
          item.file?.name === saved.name && item.file?.size === Number(saved.size_bytes)
        );
      }
    }
    if (index < 0) {
      const sameName = remaining.map((item, i) => item.file?.name === saved.name ? i : -1).filter(i => i >= 0);
      if (sameName.length === 1) index = sameName[0];
    }
    if (index < 0) {
      unmatched++;
      continue;
    }
    ordered.push(remaining.splice(index, 1)[0]);
  }
  return { episodes: [...ordered, ...remaining], unmatched };
}
