# IoT Firmware — ESP32 + GY-NEO6MV2 + (optional) Arduino Nano

Firmware that transmits encrypted, HMAC-signed GPS coordinates to the ArmoryDB API every 30 seconds.

## Hardware

| Component | Role |
|---|---|
| **ESP32-WROOM-32** | Wi-Fi MCU, HTTPS client, payload signer |
| **GY-NEO6MV2** (u-blox NEO-6M) | GPS receiver |
| **Arduino Nano** *(optional)* | Power management, watchdog |
| 3.7 V Li-Po + TP4056 | Battery & charging |
| Tamper switch (NC reed) | Triggers `tamper` flag |

### Wiring (ESP32 ↔ NEO-6M)

| ESP32 | GY-NEO6MV2 |
|---|---|
| 3V3   | VCC |
| GND   | GND |
| GPIO16 (RX2) | TX |
| GPIO17 (TX2) | RX |

## Build

Open `firmware/firmware.ino` in **Arduino IDE 2.x**, install:

- *ESP32* board package (Espressif)
- `TinyGPSPlus`
- `ArduinoJson`
- `mbedtls` (bundled with ESP32 core — used for HMAC-SHA256)

Set the constants at the top of `firmware.ino`:

```cpp
const char* WIFI_SSID  = "10RCDG-Armory-AP";
const char* WIFI_PASS  = "REPLACE_ME";
const char* API_URL    = "https://armory.10rcdg.local/api/v1/gps/ingest";
const char* DEVICE_ID  = "ESP32-001-FIREARM-PA-M4-001";
const int   EQUIPMENT_ID = 1;
const char* HMAC_SECRET= "MUST_MATCH_LARAVEL_IOT_HMAC_SECRET";
const int   GPS_INTERVAL_MS = 30000;
```

Flash via USB. Open Serial Monitor at **115200**.

## Payload

Each transmission is a JSON body POSTed to `/api/v1/gps/ingest` with header
`X-Armory-Signature: <HMAC_SHA256(body, HMAC_SECRET) hex>`.

```json
{
  "equipment_id": 1,
  "device_id": "ESP32-001-FIREARM-PA-M4-001",
  "captured_at": "2026-05-09T05:42:11Z",
  "latitude": 8.484460,
  "longitude": 124.657010,
  "accuracy_meters": 4.5,
  "speed_mps": 0.0,
  "heading_deg": 152.3,
  "altitude_meters": 240.7,
  "satellites": 9,
  "battery_pct": 87
}
```

## Offline Buffering

If Wi-Fi or HTTPS POST fails, the latest 32 GPS fixes are buffered in non-volatile flash
(`Preferences`) and re-attempted with exponential backoff up to 5 minutes.

## Security

- HTTPS with cert pinning (replace `ROOT_CA_CERT` with your CA)
- HMAC-SHA256 over the entire body, hex-encoded in `X-Armory-Signature`
- Replay protection: server checks `captured_at` is within ±10 minutes
- Tamper interrupt fires extra alert with `payload.tamper = true`
