// Optional second opinion from the Pl@ntNet recognition API (https://my.plantnet.org).
// Nothing here may stop an analysis: every failure just means "no suggestions".

const BASE_URL = 'https://my-api.plantnet.org/v2';
const TIMEOUT_MS = 12_000;
const MIN_SCORE = 0.1; // weaker matches are close to random guesses
const MAX_MATCHES = 3;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

const label = (value) => (typeof value === 'string' ? value.trim().slice(0, 200) : '');

// Also used on reports sent back by the browser, so it accepts only the expected fields.
function matches(list, toMatch) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({ ...toMatch(item ?? {}), score: item?.score }))
    .filter((m) => m.name && Number.isFinite(m.score) && m.score >= MIN_SCORE && m.score <= 1)
    .slice(0, MAX_MATCHES);
}

const plantMatch = (name, commonNames) => ({
  name: label(name),
  common_names: (Array.isArray(commonNames) ? commonNames : []).map(label).filter(Boolean).slice(0, MAX_MATCHES),
});

export function cleanSuggestions(plants, diseases) {
  const result = {
    plants: matches(plants, (p) => plantMatch(p.name, p.common_names)),
    diseases: matches(diseases, (d) => ({ name: label(d.name) })),
  };
  return result.plants.length || result.diseases.length ? result : null;
}

async function ask(fetch, key, path, image) {
  // The URL holds the key, so neither it nor the error text is ever logged.
  const url = `${BASE_URL}/${path}?api-key=${encodeURIComponent(key)}&lang=en&nb-results=${MAX_MATCHES}`;
  const form = new FormData();
  form.append('organs', 'auto');
  form.append('images', new Blob([image.bytes], { type: image.mimeType }), `plant.${image.ext}`);
  try {
    const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404) return []; // Pl@ntNet's answer for "no plant recognised"
    if (!res.ok) {
      const hint = { 401: ' (check PLANTNET_API_KEY)', 429: ' (daily limit reached)' }[res.status] ?? '';
      console.error(`Pl@ntNet ${path} returned ${res.status}${hint}; continuing without it`);
      return [];
    }
    const body = await res.json();
    return Array.isArray(body?.results) ? body.results : [];
  } catch (err) {
    console.error(`Pl@ntNet ${path} failed (${err.name}); continuing without it`);
    return [];
  }
}

// Each call uses two requests of the daily Pl@ntNet allowance.
export async function plantnetSuggestions({ fetch, key }, image) {
  if (!key || !ACCEPTED_TYPES.includes(image.mimeType)) return null;
  const [species, diseases] = await Promise.all([
    ask(fetch, key, 'identify/all', image),
    ask(fetch, key, 'diseases/identify', image),
  ]);
  // Translate Pl@ntNet's reply into our own shape before filtering.
  return cleanSuggestions(
    species.map((r) => ({
      name: r?.species?.scientificNameWithoutAuthor,
      common_names: r?.species?.commonNames,
      score: r?.score,
    })),
    diseases.map((r) => ({ name: r?.description || r?.name, score: r?.score })),
  );
}
