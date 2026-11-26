# WaterMI ESP32 Live Sensors Guide

Stream live **humidity**, **temperature**, **soil moisture**, and optional **light** readings from an **ESP32** directly into the WaterMI Plant Detail dashboard.

## What you need

- **ESP32** development board (with Wi-Fi)
- **DHT22** temperature & humidity sensor
- **Analog soil moisture sensor** (capacitive or resistive with `AO` pin)
- *(Optional)* Analog light sensor (LDR / TEMT6000) for `light`
- Jumper wires and a USB cable

## Wiring

| Sensor | Pin on Sensor | ESP32 Pin |
| --- | --- | --- |
| **DHT22** | VCC | `3.3V` |
| **DHT22** | DATA | `GPIO 4` |
| **DHT22** | GND | `GND` |
| **Soil Moisture** | VCC | `3.3V` |
| **Soil Moisture** | AO (Analog Out) | `GPIO 34` (ADC1 input-only) |
| **Soil Moisture** | GND | `GND` |
| **Light Sensor** *(optional)* | AO | `GPIO 35` |

> **Tip:** `GPIO 34` and `GPIO 35` are on ADC1, which works reliably while Wi-Fi is active on ESP32 (ADC2 pins cannot be used with Wi-Fi).

## 1. Prepare the WaterMI server

1. Open `leafwise/.env` and make sure the server accepts connections on your local Wi-Fi network:
   ```env
   PORT=9999
   HOST=0.0.0.0
   ```
   *(Optional)* You can customize how long WaterMI waits before marking a silent ESP32 as **Not connected** (default is `30000` ms = 30 seconds):
   ```env
   SENSOR_TIMEOUT_MS=30000
   ```
2. Start (or restart) the WaterMI server:
   ```bash
   cd /home/pobtum/Downloads/leafwise-project/leafwise
   node --env-file-if-exists=.env server.js
   ```
3. Find your computer's local IP address:
   ```bash
   hostname -I
   ```
   Use the first address (for example `192.168.1.100`).
4. Find the **Plant ID** you want to attach the ESP32 to:
   ```bash
   curl -s http://127.0.0.1:9999/api/plants | node -e "for (const p of JSON.parse(require('fs').readFileSync(0,'utf8'))) console.log(p.id, '-', p.name);"
   ```

## 2. Set up Arduino IDE

1. Install the **ESP32** board package in Arduino IDE (*Tools -> Board -> Boards Manager -> search `esp32` by Espressif Systems*).
2. Install the **DHT sensor library** (*Sketch -> Include Library -> Manage Libraries -> search `DHT sensor library` by Adafruit* — install its dependency *Adafruit Unified Sensor* when prompted).
3. Open `arduino/watermi_esp32/watermi_esp32.ino`.
4. Update the configuration constants at the top of the sketch:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_NAME";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

   // Use your deployed HTTPS URL (Railway / Fly.io) OR local LAN IP:
   const char* SERVER_URL    = "http://192.168.1.100:9999";
   const char* PLANT_ID      = "YOUR_PLANT_ID";
   const char* SENSOR_KEY    = ""; // Optional: only if SENSOR_KEY is set on the server
   ```
5. Select your ESP32 board and port under *Tools*, then click **Upload**.
6. Open **Serial Monitor** at `115200` baud to verify readings and `POST 200` responses.

## 3. View live readings in WaterMI

1. Open http://localhost:9999 in your browser.
2. Click your plant card on the Dashboard.
3. The **Sensors** panel on the right automatically refreshes every **3 seconds**:
   - **Humidity** and **Temperature** show **Connected** when the DHT22 returns valid readings, or **Not connected** if the DHT22 is unplugged/failing.
   - **Soil moisture** shows **Connected** with the live percentage.
   - **Light** shows **Not connected** until you wire a light sensor and set `LIGHT_SENSOR_ENABLED = true`.
   - If the ESP32 is unplugged or loses Wi-Fi for more than **30 seconds**, all sensors automatically switch to **Not connected**.

## 4. Calibrating the soil moisture sensor

Every soil moisture probe has slightly different dry/wet raw readings:

1. Open the Serial Monitor (`115200` baud) and note `soilRaw=...` while holding the sensor in **dry air** -> set `SOIL_DRY_RAW` to that number.
2. Dip the probe (up to the marked line only—never submerge the electronics!) into a **cup of water** and note `soilRaw=...` -> set `SOIL_WET_RAW` to that number.
3. Re-upload the sketch.

## 5. Sensor API reference

The sketch posts JSON to:

```http
POST /api/plants/:id/sensors
Content-Type: application/json

{
  "humidity": 64.2,
  "temperature": 27.5,
  "soilMoisture": 48,
  "light": null
}
```

- A numeric value sets that sensor to `connected: true` (rounded to 1 decimal place).
- `null` sets that sensor to `connected: false` with `value: null`.
- You can also test it manually from your terminal without hardware:
  ```bash
  curl -X POST http://127.0.0.1:9999/api/plants/<PLANT_ID>/sensors \
    -H "Content-Type: application/json" \
    -d '{"humidity":64.2,"temperature":27.5,"soilMoisture":48,"light":null}'
  ```

## Troubleshooting

- **`HTTP error: connection refused`**: Make sure `HOST=0.0.0.0` is set in `.env`, the WaterMI server was restarted, and your computer's firewall allows TCP port `9999` on your local network.
- **`POST 404`**: Double-check `PLANT_ID` matches an existing plant from `GET /api/plants`.
- **DHT22 shows `Not connected` / `null`**: Check the `GPIO 4` data wire and `3.3V`/`GND` connections. Some bare DHT22 sensors (not on a breakout module) need a 10kΩ pull-up resistor between DATA and `3.3V`.
- **ESP32 won't connect to Wi-Fi**: ESP32 only supports **2.4 GHz** Wi-Fi networks (not 5 GHz).
