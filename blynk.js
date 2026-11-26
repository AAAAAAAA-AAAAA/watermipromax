// Optional Blynk Cloud integration (https://docs.blynk.io/en/blynk.cloud/https-api-overview).
// Failures never block WaterMI sensor ingestion, and the auth token is never logged.

const DEFAULT_BASE_URL = 'https://blynk.cloud/external/api';
const TIMEOUT_MS = 5_000;

export const DEFAULT_BLYNK_PINS = {
  temperature: 'V0',
  humidity: 'V1',
  soilMoisture: 'V2',
  light: 'V3',
};

export async function pushToBlynk(
  { fetch, token, baseUrl = DEFAULT_BASE_URL, pins = DEFAULT_BLYNK_PINS },
  sensors,
  signal,
) {
  if (!token || !sensors || typeof sensors !== 'object') {
    return { ok: false, skipped: true };
  }

  const params = new URLSearchParams({ token });
  let count = 0;
  for (const [key, pin] of Object.entries(pins)) {
    if (!pin) continue;
    const s = sensors[key];
    if (s && s.connected && typeof s.value === 'number' && Number.isFinite(s.value)) {
      params.set(pin, String(s.value));
      count++;
    }
  }
  if (!count) return { ok: false, skipped: true };

  const url = `${baseUrl.replace(/\/+$/, '')}/batch/update?${params.toString()}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Blynk update returned ${res.status}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status, sent: count };
  } catch (err) {
    console.error(`Blynk update failed (${err.name || 'error'})`);
    return { ok: false, status: 0 };
  }
}

export async function pullFromBlynk(
  { fetch, token, baseUrl = DEFAULT_BASE_URL, pins = DEFAULT_BLYNK_PINS },
  signal,
) {
  if (!token) return { ok: false, error: 'BLYNK_AUTH_TOKEN is not configured' };

  const root = baseUrl.replace(/\/+$/, '');
  const query = `token=${encodeURIComponent(token)}`;
  try {
    const sig = signal ?? AbortSignal.timeout(TIMEOUT_MS);
    const [dataRes, connRes] = await Promise.all([
      fetch(`${root}/getAll?${query}`, { method: 'GET', signal: sig }),
      fetch(`${root}/isHardwareConnected?${query}`, { method: 'GET', signal: sig }),
    ]);
    if (!dataRes.ok) {
      return { ok: false, status: dataRes.status, error: `Blynk returned ${dataRes.status}` };
    }
    const raw = await dataRes.json();
    const hardwareConnected = connRes.ok ? (await connRes.text()).trim() === 'true' : true;
    const sensors = {};
    for (const [key, pin] of Object.entries(pins)) {
      if (!pin) continue;
      const val = raw?.[pin] ?? raw?.[pin.toLowerCase()] ?? raw?.[pin.toUpperCase()];
      if (val !== undefined && val !== null && val !== '') {
        const n = Number(val);
        if (Number.isFinite(n)) {
          sensors[key] = { connected: hardwareConnected, value: Math.round(n * 10) / 10 };
        }
      }
    }
    return { ok: true, hardwareConnected, sensors };
  } catch (err) {
    return { ok: false, status: 0, error: `Blynk request failed (${err.name || 'error'})` };
  }
}
