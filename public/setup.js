const $ = (selector) => document.querySelector(selector);

const SENSORS = [
  ['humidity', 'Humidity'],
  ['temperature', 'Temperature'],
  ['soilMoisture', 'Soil moisture'],
  ['light', 'Light'],
];

let plants = [];
let sketch = '';

$('#s-url').value = location.origin;
const lastPlant = localStorage.getItem('watermi.setup.plant');

const setConst = (source, name, value) =>
  source.replace(
    new RegExp(`(const char\\* ${name}\\s*=\\s*)"[^"]*";`),
    (_, head) => `${head}"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";`,
  );

function values() {
  return {
    WIFI_SSID: $('#s-ssid').value.trim(),
    WIFI_PASSWORD: $('#s-pass').value,
    SERVER_URL: $('#s-url').value.trim().replace(/\/+$/, ''),
    PLANT_ID: $('#s-plant').value,
    SENSOR_KEY: $('#s-key').value.trim(),
  };
}

function build() {
  let out = sketch;
  for (const [name, value] of Object.entries(values())) out = setConst(out, name, value);
  return out;
}

function refreshForm() {
  const v = values();
  $('#s-preview').textContent = [
    `WIFI_SSID     = "${v.WIFI_SSID}"`,
    `WIFI_PASSWORD = "${v.WIFI_PASSWORD ? '********' : ''}"`,
    `SERVER_URL    = "${v.SERVER_URL}"`,
    `PLANT_ID      = "${v.PLANT_ID}"`,
    `SENSOR_KEY    = "${v.SENSOR_KEY ? '********' : ''}"`,
  ].join('\n');
  $('#s-download').disabled = !(sketch && v.WIFI_SSID && v.SERVER_URL && v.PLANT_ID);
}

function renderLive() {
  const plant = plants.find((p) => p.id === $('#s-plant').value);
  const box = $('#live');
  box.replaceChildren();
  if (!plant) {
    $('#live-msg').textContent = 'Choose a plant in step 2.';
    return;
  }
  const sensors = plant.sensors ?? {};
  const any = SENSORS.some(([key]) => sensors[key]?.connected);
  $('#live-msg').textContent = any
    ? 'The board is sending data. This page refreshes every 3 seconds.'
    : 'Waiting for the board. Readings appear here a few seconds after it connects.';
  for (const [key, label] of SENSORS) {
    const s = sensors[key] ?? {};
    const connected = Boolean(s.connected);
    const hasValue = connected && Number.isFinite(s.value);
    const item = document.createElement('div');
    item.className = 'stat';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('strong');
    value.textContent = hasValue ? `${s.value}${s.unit === 'lux' ? ' lux' : (s.unit ?? '')}` : '—';
    const badge = document.createElement('span');
    badge.className = `badge ${connected ? 'healthy' : 'none'}`;
    badge.textContent = connected ? 'Connected' : 'Not connected';
    item.append(name, value, badge);
    box.append(item);
  }
}

async function loadPlants() {
  try {
    const res = await fetch('/api/plants');
    if (!res.ok) return;
    const latest = await res.json();
    const first = !plants.length;
    plants = latest;
    const select = $('#s-plant');
    const current = select.value || lastPlant;
    select.replaceChildren(...plants.map((p) => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      return option;
    }));
    if (plants.some((p) => p.id === current)) select.value = current;
    $('#s-noplant').hidden = plants.length > 0;
    if (first) refreshForm();
    renderLive();
  } catch {
    // The next poll tries again.
  }
}

async function init() {
  try {
    const res = await fetch('/arduino/watermi_esp32/watermi_esp32.ino');
    if (res.ok) sketch = await res.text();
  } catch {
    // The download button stays disabled without the sketch.
  }
  await loadPlants();
  refreshForm();
  setInterval(loadPlants, 3000);
}

for (const id of ['#s-ssid', '#s-pass', '#s-url', '#s-key']) $(id).addEventListener('input', refreshForm);
$('#s-plant').addEventListener('change', () => {
  localStorage.setItem('watermi.setup.plant', $('#s-plant').value);
  refreshForm();
  renderLive();
});
$('#s-download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([build()], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'watermi_esp32.ino';
  link.click();
  URL.revokeObjectURL(url);
});

init();
