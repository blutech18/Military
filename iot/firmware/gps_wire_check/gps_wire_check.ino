/*
 * ArmoryDB · GPS wire check
 * =========================
 * Tells you which of the four GPS jumper wires is missing or wrong. Serial Monitor: 115200 baud.
 *
 *   GPS VCC -> ESP32 3V3
 *   GPS GND -> ESP32 GND
 *   GPS TX  -> ESP32 D18   (GPS talks, ESP32 listens)
 *   GPS RX  -> ESP32 D19   (ESP32 talks, GPS listens)
 *
 * How each wire is judged:
 *   - Data arriving on D18 proves VCC, GND and the TX wire are all fine.
 *   - D19 is tested by sending a harmless command that switches the GPS's GLL sentence off for
 *     a few seconds and then back on. If the GLL sentences really stop, the GPS heard us,
 *     so the D19 wire is fine. The GPS keeps working either way; D19 is only needed for commands.
 *   - No data at all means VCC, GND or the TX wire is unplugged. Software cannot tell those three
 *     apart: look at the GPS board's red power LED. LED off -> VCC or GND. LED on -> the TX wire.
 *
 * Plugging a wire back in is detected within a second or two.
 */
#include <HardwareSerial.h>

static const int RX_PIN = 18; /* ESP32 receives here  <- GPS TX */
static const int TX_PIN = 19; /* ESP32 transmits here -> GPS RX */
static const uint32_t GPS_BAUD = 9600;

HardwareSerial GPSSerial(2);

/* ---- sentence counting ---- */
String line;
unsigned long bytesWindow = 0;   /* bytes since the last status line */
unsigned long goodLinesWindow = 0;
unsigned long gllWindow = 0;     /* GLL sentences since the last status line */
unsigned long lastDataMs = 0;

void onChar(char c) {
  bytesWindow++;
  lastDataMs = millis();
  if (c == '\n') {
    if (line.length() > 6 && line[0] == '$' && line.indexOf('*') > 0) {
      goodLinesWindow++;
      if (line.startsWith("$GPGLL") || line.startsWith("$GNGLL")) gllWindow++;
    }
    line = "";
  } else if (c != '\r' && line.length() < 120) {
    line += c;
  }
}

/* ---- command path test (D19 -> GPS RX) ---- */
enum CmdState { CMD_WAIT, CMD_DISABLED, CMD_RESTORING };
CmdState cmdState = CMD_WAIT;
unsigned long cmdStateMs = 0;
unsigned long gllDuringTest = 0;
int lastCmdResult = 0; /* 0 = not tested yet, 1 = pass, -1 = fail */
unsigned long lastCmdResultMs = 0;

void sendPubx(const char* body) {
  uint8_t sum = 0;
  for (const char* p = body; *p; p++) sum ^= (uint8_t) *p;
  char out[80];
  snprintf(out, sizeof(out), "$%s*%02X\r\n", body, sum);
  GPSSerial.print(out);
}

void setGll(bool on) {
  /* PUBX,40: message GLL, rates for I2C, UART1, UART2, USB, SPI (0 = off, 1 = every fix) */
  sendPubx(on ? "PUBX,40,GLL,0,1,0,0,0,0" : "PUBX,40,GLL,0,0,0,0,0,0");
}

void runCommandTest(bool dataFlowing) {
  unsigned long now = millis();

  switch (cmdState) {
    case CMD_WAIT:
      /* A test cycle every ~10 s, and only while there is data to judge the result by. */
      if (dataFlowing && now - cmdStateMs > 6000) {
        setGll(false);
        gllDuringTest = 0;
        cmdState = CMD_DISABLED;
        cmdStateMs = now;
        gllWindow = 0;
      }
      break;

    case CMD_DISABLED:
      /* Sentences already on their way can still arrive in the first 1.5 s; judge after that. */
      if (now - cmdStateMs <= 1500) {
        gllWindow = 0;
      } else {
        gllDuringTest += gllWindow;
        gllWindow = 0;
      }
      if (now - cmdStateMs > 4500) {
        lastCmdResult = gllDuringTest == 0 ? 1 : -1;
        lastCmdResultMs = now;
        setGll(true); /* always put the GPS back the way it was */
        cmdState = CMD_RESTORING;
        cmdStateMs = now;
      }
      break;

    case CMD_RESTORING:
      if (now - cmdStateMs > 2500) {
        setGll(true); /* second attempt in case the first was lost */
        cmdState = CMD_WAIT;
        cmdStateMs = now;
      }
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== GPS wire check ===");
  Serial.printf("listening on D%d (GPS TX), commands go out on D%d (GPS RX)\n", RX_PIN, TX_PIN);
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, RX_PIN, TX_PIN);
  cmdStateMs = millis();
}

unsigned long lastStatusMs = 0;

void loop() {
  while (GPSSerial.available()) onChar((char) GPSSerial.read());

  unsigned long now = millis();
  bool dataFlowing = lastDataMs != 0 && now - lastDataMs < 2500;
  runCommandTest(dataFlowing);

  if (now - lastStatusMs < 1000) return;
  lastStatusMs = now;

  Serial.println("------------------------------------------------------------");
  Serial.printf("D18 (GPS TX -> ESP32): %s   [%lu bytes, %lu valid sentences in the last second]\n",
                dataFlowing ? "DATA OK" : "NO DATA", bytesWindow, goodLinesWindow);

  if (cmdState == CMD_DISABLED) {
    Serial.println("D19 (ESP32 -> GPS RX): testing now (briefly switching one GPS sentence off)...");
  } else if (!dataFlowing) {
    Serial.println("D19 (ESP32 -> GPS RX): cannot be tested without data from the GPS");
  } else if (lastCmdResult == 0) {
    Serial.println("D19 (ESP32 -> GPS RX): first test starts in a few seconds");
  } else {
    Serial.printf("D19 (ESP32 -> GPS RX): %s   (last test %lu s ago)\n",
                  lastCmdResult > 0 ? "COMMAND OBEYED" : "NO REACTION", (now - lastCmdResultMs) / 1000UL);
  }

  if (!dataFlowing) {
    Serial.println("GUESS: the VCC wire, the GND wire or the TX wire (GPS TX -> D18) is unplugged.");
    Serial.println("       GPS board red power LED OFF -> VCC or GND.   LED still ON -> the TX wire.");
  } else if (cmdState != CMD_DISABLED && lastCmdResult < 0) {
    Serial.println("GUESS: the RX wire (ESP32 D19 -> GPS RX) is unplugged or on the wrong pin.");
  } else if (cmdState != CMD_DISABLED && lastCmdResult > 0) {
    Serial.println("GUESS: all four wires are connected correctly.");
  }

  bytesWindow = 0;
  goodLinesWindow = 0;
  if (cmdState != CMD_DISABLED) gllWindow = 0;
}
