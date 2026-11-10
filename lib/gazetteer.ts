export function parsePipe(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.split("|").map((cell) => cell.trim()) ?? [];
  return lines.slice(1).map((line) => {
    const cells = line.split("|");
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

export function centroidsFromRows(rows: Record<string, string>[]): Record<string, [number, number]> {
  const centroids: Record<string, [number, number]> = {};
  for (const row of rows) {
    const lat = Number(row.INTPTLAT);
    const lon = Number(row.INTPTLONG);
    if (/^\d{5}$/.test(row.GEOID ?? "") && Number.isFinite(lat) && Number.isFinite(lon)) {
      centroids[row.GEOID] = [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5];
    }
  }
  return centroids;
}
