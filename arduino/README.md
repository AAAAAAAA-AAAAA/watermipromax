# WaterMI ESP32 sensor setup

Send live **humidity**, **temperature**, **soil moisture** and optional **light** readings from an ESP32 to WaterMI.

## The easy way: use the setup page

1. Open your WaterMI site and go to **`/setup.html`** (for example `https://your-app.onrender.com/setup.html`). You can also click **How to connect your sensors** in any plant's detail view.
2. Pick your plant, enter your Wi-Fi name and password, and click **Download sketch**. The page fills in the server address and plant ID for you. Your Wi-Fi password stays in your browser.
3. Open the downloaded `watermi_esp32.ino` in Arduino IDE and click **Upload** (see "One-time Arduino IDE setup" below).
4. Watch the **Live check** section on the same page. Readings and **Connected** badges appear within a few seconds.

## What you need

- ESP32 board with Wi-Fi (2.4 GHz only, 5 GHz does not work)
- DHT22 temperature and humidity sensor
- Analog soil moisture sensor with an `AO` pin
- *(Optional)* Analog light sensor (LDR or TEMT6000)
- Jumper wires and a USB cable

## Wiring

| Sensor | Sensor pin | ESP32 pin |
| --- | --- | --- |
| DHT22 | VCC | `3.3V` |
| DHT22 | DATA | `GPIO 4` |
| DHT22 | GND | `GND` |
| Soil moisture | VCC | `3.3V` |
| Soil moisture | AO | `GPIO 34` |
| Soil moisture | GND | `GND` |
| Light *(optional)* | AO | `GPIO 35` |

GPIO 34 and 35 are on ADC1, which keeps working while Wi-Fi is on. A bare DHT22 (not on a breakout board) needs a 10 kΩ resistor between DATA and `3.3V`.

## One-time Arduino IDE setup

1. Install [Arduino IDE](https://www.arduino.cc/en/software).
2. **Tools → Board → Boards Manager**: install **esp32** by Espressif Systems.
3. **Sketch → Include Library → Manage Libraries**: install **DHT sensor library** by Adafruit. Accept the extra **Adafruit Unified Sensor** dependency.
4. Choose your ESP32 board and port under **Tools**, then click **Upload**.
5. Open **Serial Monitor** at `115200` baud. You should see `Wi-Fi connected!` and `POST 200` every 2 seconds.

## Editing the sketch by hand

Open [watermi_esp32/watermi_esp32.ino](watermi_esp32/watermi_esp32.ino) and customize these constants at the top:

```cpp
// Wi-Fi credentials
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// WaterMI server URL
const char* SERVER_URL    = "https://your-app.onrender.com";
const char* PLANT_ID      = "YOUR_PLANT_ID";
const char* SENSOR_KEY    = "";

// Pin assignments (edit these to match your wiring)
#define DHTPIN  4               // DHT22 data pin
const int soilMoisturePin = 34; // Soil moisture AO pin
const bool LIGHT_SENSOR_ENABLED = false;  // Set to true to enable light sensor
const int  lightPin             = 35;     // Light sensor AO pin

// Soil calibration (adjust based on your sensor)
const int SOIL_DRY_RAW = 4095;   // Raw value in dry air
const int SOIL_WET_RAW = 0;      // Raw value in water

// How often to send readings (milliseconds)
const unsigned long SEND_INTERVAL_MS = 2000;
```

### Customization Options

- **SERVER_URL**: Use your deployed `https://` address, or `http://YOUR-PC-IP:PORT` when WaterMI runs on the same Wi-Fi (set `HOST=0.0.0.0` in `.env`).
- **PLANT_ID**: The `id` of your plant from `/api/plants`.
- **SENSOR_KEY**: Leave empty unless you set `SENSOR_KEY` on the server.
- **LIGHT_SENSOR_ENABLED**: Set to `true` and wire an analog light sensor to GPIO 35.
- **SOIL_DRY_RAW / SOIL_WET_RAW**: Calibrate for your specific sensor (measure in dry air and in water).
- **SEND_INTERVAL_MS**: Lower for faster updates (minimum 1000ms), higher for less frequent uploads.

## Soil moisture calibration

Every probe reads a little differently.

1. In Serial Monitor, hold the probe in dry air and note `soilRaw=...`. Put that number in `SOIL_DRY_RAW`.
2. Dip the probe up to its marked line (never the electronics) in a cup of water and note `soilRaw=...`. Put that in `SOIL_WET_RAW`.
3. Upload again.

## How it works

The sketch posts JSON every 2 seconds to `POST /api/plants/:id/sensors`:

```json
{ "humidity": 64.2, "temperature": 27.5, "soilMoisture": 48, "light": null }
```

- A number marks that sensor **Connected**.
- `null` marks it **Not connected**.
- If nothing arrives for 30 seconds (change with `SENSOR_TIMEOUT_MS`), every sensor shows **Not connected**.
- If `SENSOR_KEY` is set on the server, requests must send it in an `x-sensor-key` header. The sketch does this when its `SENSOR_KEY` is filled in.

Test without hardware:

```bash
curl -X POST https://your-app.onrender.com/api/plants/PLANT_ID/sensors \
  -H "Content-Type: application/json" \
  -d '{"humidity":64.2,"temperature":27.5,"soilMoisture":48,"light":null}'
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Never connects to Wi-Fi | Use a 2.4 GHz network and check the name and password. |
| `POST 404` | The plant was deleted or the server data was reset. Download the sketch again from the setup page. |
| `POST 401` | The sensor key does not match the server's `SENSOR_KEY`. |
| `HTTP error: connection refused` | The address is wrong. For a local server, set `HOST=0.0.0.0` and allow the port through the firewall. |
| Humidity and temperature show Not connected | Check the DHT22 data wire on GPIO 4 and its 3.3V and GND. |
| Everything goes Not connected after 30 seconds | The board stopped sending. Check power and Wi-Fi. |
| Free Render service reset your plants | Add the plant again, then download and upload a fresh sketch so `PLANT_ID` matches. |
