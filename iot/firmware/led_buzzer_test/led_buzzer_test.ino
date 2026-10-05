/*
 * ArmoryDB · LED + buzzer wiring test
 * ===================================
 * Lights each part in turn so you can check the wiring one part at a time.
 * Serial Monitor: 115200 baud (optional; the parts also work without it).
 *
 *   Green LED   D4    Wi-Fi status
 *   Blue LED    D21   GPS fix
 *   Yellow LED  D22   send result
 *   Buzzer      D23   (+ leg to D23, other leg to GND)
 *
 * Do not use TX0 / RX0 for anything: they are the USB connection to the laptop.
 *
 * All four are on the same side of the board as 3V3, GND, D18 and D19, so a long breadboard
 * that only reaches one side is enough.
 *
 * Each LED:  ESP32 pin -> 330 ohm resistor -> LED long leg ... LED short leg -> GND
 *
 * Sequence (repeats): green 1.5 s, blue 1.5 s, yellow 1.5 s, buzzer chirp, all three together,
 * then a "3 flashes" pattern on yellow (what the tracker shows for a rejected position).
 */

static const int LED_GREEN = 4;
static const int LED_BLUE = 21;
static const int LED_YELLOW = 22;
static const int BUZZER = 23;

void flash(int pin, int times, int onMs, int offMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH);
    delay(onMs);
    digitalWrite(pin, LOW);
    delay(offMs);
  }
}

void showLed(const char* name, int pin) {
  Serial.printf("%s LED (D%d) ON\n", name, pin);
  digitalWrite(pin, HIGH);
  delay(1500);
  digitalWrite(pin, LOW);
  delay(400);
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_BLUE, LOW);
  digitalWrite(LED_YELLOW, LOW);

  Serial.println("\n=== LED + buzzer test ===");
  Serial.println("Each part lights in turn. Note any that stay dark.");
}

void loop() {
  Serial.println("------------------------------------------------------------");
  showLed("GREEN ", LED_GREEN);
  showLed("BLUE  ", LED_BLUE);
  showLed("YELLOW", LED_YELLOW);

  Serial.printf("BUZZER (D%d) chirp\n", BUZZER);
  tone(BUZZER, 2200, 150);
  delay(300);
  noTone(BUZZER);
  delay(500);

  Serial.println("ALL THREE LEDs together");
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_BLUE, HIGH);
  digitalWrite(LED_YELLOW, HIGH);
  delay(1200);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_BLUE, LOW);
  digitalWrite(LED_YELLOW, LOW);
  delay(400);

  Serial.println("YELLOW 3 quick flashes (rejected position) + alarm tone");
  flash(LED_YELLOW, 3, 70, 70);
  tone(BUZZER, 1400, 140);
  delay(180);
  tone(BUZZER, 900, 140);
  delay(180);
  noTone(BUZZER);

  delay(1500);
}
