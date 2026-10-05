// Serve the QR decoder's WebAssembly binary from our own origin (public/zxing_reader.wasm).
// Copying it from node_modules keeps it in lockstep with the pinned zxing-wasm version and
// avoids committing a ~1 MB binary. A failure here only warns: scanning is the one thing that
// needs the file, and `npm run build` output makes a missing file obvious.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
const target = resolve(root, "public/zxing_reader.wasm");

try {
  if (!existsSync(source)) throw new Error(`not found: ${source}`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log("[zxing-wasm] copied decoder binary to public/zxing_reader.wasm");
} catch (error) {
  console.warn(`[zxing-wasm] could not copy decoder binary: ${error.message}`);
}
