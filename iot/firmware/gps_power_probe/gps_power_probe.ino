/*
 * ArmoryDB · GPS power probe
 * ==========================
 * Finds out, without a multimeter, whether the GPS board has a short on its power input.
 * Serial Monitor: 115200 baud.
 *
 * A 330 ohm resistor sits between the ESP32's 3V3 pin and the GPS VCC pin, so even a dead short
 * can only draw about 10 mA. The ESP32 keeps its power. This sketch reads the voltage at the
 * GPS side of that resistor on pin D4:
 *
 *   ESP32 3V3 ---[330 ohm]---+--- GPS VCC
 *                            |
 *                            +--- ESP32 D4   (reads the voltage here)
 *   GPS GND ------------------- ESP32 GND
 *
 * Two readings tell the whole story:
 *   1. GPS VCC wire NOT connected (jumper end free): expect about 3.3 V. If it is low, the problem
 *      is in the breadboard or the wiring, not the GPS board.
 *   2. GPS VCC wire connected: if the voltage falls close to 0 V, the GPS board is shorted.
 *      Anywhere above about 0.5 V means no hard short.
 *
 * D4 is an ADC2 pin, which works because this sketch does not use Wi-Fi.
 */

static const int PROBE_PIN = 4;

void setup() {
  Serial.begin(115200);
  delay(300);
  analogSetPinAttenuation(PROBE_PIN, ADC_11db); /* measure the full 0 - 3.3 V range */
  Serial.println("\n=== GPS power probe ===");
  Serial.println("Reading the voltage on D4 (the GPS side of the 330 ohm resistor).");
}

void loop() {
  /* Is D4 really wired to the resistor? Pull it down for a moment. A pin held up by 3V3 through the
   * 330 ohm resistor barely moves; an unconnected (floating) pin falls to about 0 V. */
  pinMode(PROBE_PIN, INPUT_PULLDOWN);
  delay(10);
  float pulledDown = analogReadMilliVolts(PROBE_PIN) / 1000.0f;
  pinMode(PROBE_PIN, INPUT);
  delay(5);
  bool wired = pulledDown > 1.5f;

  /* Average a few samples; the ADC is noisy. */
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) {
    sum += analogReadMilliVolts(PROBE_PIN);
    delay(2);
  }
  float volts = (sum / 16.0f) / 1000.0f;

  const char* verdict;
  /* Used two ways: as the resistor test above, and to tell which breadboard rail is 3V3 and which is
   * ground by touching a jumper from D4 to each rail line. */
  if (volts > 3.0f)      verdict = "3V3 line (full power). In the resistor test this means nothing is drawing current.";
  else if (volts > 1.8f) verdict = "partly loaded or floating: neither a clean 3V3 nor ground.";
  else if (volts > 0.5f) verdict = "heavily loaded or floating.";
  else                   verdict = "GROUND line (about 0 V). In the resistor test with the GPS on, this means a dead short.";

  if (!wired) {
    Serial.printf("D4 is NOT CONNECTED to the resistor (it floated to %.2f V when pulled down). "
                  "Check jumper B: it must go from row Q (the resistor's far end) to D4.\n", pulledDown);
    delay(700);
    return;
  }

  Serial.printf("D4 wired OK. D4 = %.2f V   %s\n", volts, verdict);
  delay(700);
}
