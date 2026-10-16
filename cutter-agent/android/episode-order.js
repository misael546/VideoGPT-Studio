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
  const numbers = normalized.match(/\d{1,4}/g);
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
