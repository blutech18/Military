# Reference only — superseded firmware

These two files were the original sketches. They are kept for reference and are
saved with a `.txt` extension so the Arduino IDE cannot compile them.

- `firmware_https_original.ino.txt` — original HTTPS build
- `firmware_http_dev_original.ino.txt` — original plain-HTTP development build

## Why they were replaced

1. **They could not build together.** Both lived in `iot/firmware/`, and the
   Arduino IDE compiles every `.ino` in a sketch folder as one program, so
   `setup()` and `loop()` were defined twice.
2. **They predate the hardened ingest API.** They treated any non-2xx reply as a
   generic failure, then re-queued the payload to flash and retried it later.
   The API now rejects stale timestamps and duplicate or out-of-order fixes, so
   those retries could never succeed.
3. **They sent unsupported and unreliable fields.** A `tamper` flag was posted
   even though the API stores no such field, and `battery_pct` was always sent
   even with no voltage divider wired, which reports ADC noise as a percentage.

Use `iot/firmware/armory_tracker/` instead. It handles HTTP and HTTPS through a
single `USE_HTTPS` switch in `config.h`.
