const CSV_URL =
  'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/3d-heatmap/heatmap-data.csv';

let cached = null;

export async function loadAccidentsCsv() {
  if (cached) return cached;

  const response = await fetch(CSV_URL);
  const text = await response.text();

  cached = text
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((row) => {
      const [lng, lat] = row.split(',').map(Number);
      return { lng, lat };
    })
    .filter((d) => !isNaN(d.lng) && !isNaN(d.lat));

  return cached;
}
