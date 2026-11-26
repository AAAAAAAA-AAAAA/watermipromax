#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "DHT.h"

// ---------- Wi-Fi & WaterMI server settings ----------
// Replace these with your Wi-Fi credentials, WaterMI URL, and Plant ID.
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Use your deployed HTTPS URL (Railway / Fly.io), OR your local PC IP for LAN testing:
//   Cloud example: "https://watermi-production.up.railway.app"
//   Local example: "http://192.168.1.100:9999"
const char* SERVER_URL    = "https://YOUR-WATERMI-DOMAIN";
const char* PLANT_ID      = "YOUR_PLANT_ID"; // Copy from GET /api/plants
const char* SENSOR_KEY    = "";              // Optional: must match SENSOR_KEY in server env if set

// ---------- Pin definitions ----------
#define DHTPIN  4               // DHT22 data pin connected to GPIO 4
#define DHTTYPE DHT22           // Defining sensor type
const int soilMoisturePin = 34; // Soil moisture sensor AO connected to GPIO 34

// Optional analog light sensor (LDR / TEMT6000) on GPIO 35
// Set to true and connect AO to GPIO 35 to enable light readings
const bool LIGHT_SENSOR_ENABLED = false;
const int  lightPin             = 35;

// Soil moisture calibration (ESP32 ADC is 0..4095)
// Adjust these values based on your sensor:
// - SOIL_DRY_RAW: Measure in dry air (typically 3000-4000)
// - SOIL_WET_RAW: Measure in water (typically 0-1000)
const int SOIL_DRY_RAW = 4095;  // Raw value in dry conditions
const int SOIL_WET_RAW = 0;     // Raw value in wet conditions

// How often to send sensor readings (ms)
const unsigned long SEND_INTERVAL_MS = 2000;

DHT dht(DHTPIN, DHTTYPE);

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Connecting to Wi-Fi ");
  Serial.print(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected! ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi connection failed; will retry on next loop.");
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("Initializing WaterMI Plant Monitor...");
  dht.begin();
  connectWiFi();
}

void loop() {
  delay(SEND_INTERVAL_MS);

  // Read DHT22 values
  float humidity     = dht.readHumidity();
  float temperatureC = dht.readTemperature();

  // Read Soil Moisture analog value (ESP32 ADC is 0 to 4095)
  int soilRaw = analogRead(soilMoisturePin);
  int moisturePercent = map(soilRaw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  moisturePercent = constrain(moisturePercent, 0, 100);

  // Optional Light reading (approximate lux if enabled; otherwise null = Not connected)
  String lightJson = "null";
  if (LIGHT_SENSOR_ENABLED) {
    int lightRaw = analogRead(lightPin);
    // Convert ADC reading (0-4095) to approximate lux (0-20000)
    int lightLux = map(lightRaw, 0, 4095, 0, 20000);
    lightLux = constrain(lightLux, 0, 20000);
    lightJson = String(lightLux);
  }

  // Build JSON payload for WaterMI
  // null values mark sensors as "Not connected"
  String humidityJson = isnan(humidity) ? "null" : String(humidity, 1);
  String tempJson     = isnan(temperatureC) ? "null" : String(temperatureC, 1);
  String soilJson     = String(moisturePercent);

  String payload = "{";
  payload += "\"humidity\":" + humidityJson + ",";
  payload += "\"temperature\":" + tempJson + ",";
  payload += "\"soilMoisture\":" + soilJson + ",";
  payload += "\"light\":" + lightJson;
  payload += "}";

  Serial.print("Readings (soilRaw=");
  Serial.print(soilRaw);
  Serial.print("): ");
  Serial.println(payload);

  // Ensure Wi-Fi is connected before posting
  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return;

  String baseUrl = String(SERVER_URL);
  while (baseUrl.endsWith("/")) baseUrl.remove(baseUrl.length() - 1);
  String url = baseUrl + "/api/plants/" + PLANT_ID + "/sensors";

  HTTPClient http;
  WiFiClientSecure secureClient;
  bool isHttps = url.startsWith("https://");

  http.setTimeout(8000);
  if (isHttps) {
    secureClient.setInsecure(); // Skip CA verification for easy HTTPS deployment
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }

  http.addHeader("Content-Type", "application/json");
  if (strlen(SENSOR_KEY) > 0) {
    http.addHeader("x-sensor-key", SENSOR_KEY);
  }

  int statusCode = http.POST(payload);
  if (statusCode > 0) {
    Serial.print("POST ");
    Serial.print(statusCode);
    if (statusCode != 200) {
      Serial.print(" -> ");
      Serial.print(http.getString());
    }
    Serial.println();
  } else {
    Serial.print("HTTP error: ");
    Serial.println(http.errorToString(statusCode));
  }
  http.end();
}
