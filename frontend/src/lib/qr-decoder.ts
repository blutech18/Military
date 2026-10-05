"use client";

/**
 * QR decoding shared by the live camera scanner and the image-upload tab.
 *
 * Uses ZXing-C++ compiled to WebAssembly (zxing-wasm). In side-by-side tests on blurry, noisy,
 * rotated and moire-affected phone captures it read every frame that the JavaScript decoders
 * (ZXing-JS, jsQR) missed. The binary is served from our own origin: see
 * scripts/copy-zxing-wasm.mjs, which copies it to public/zxing_reader.wasm after install.
 */

type ZXingReader = typeof import("zxing-wasm/reader");

let readerPromise: Promise<ZXingReader> | null = null;

function loadReader(): Promise<ZXingReader> {
  if (!readerPromise) {
    readerPromise = import("zxing-wasm/reader")
      .then((reader) => {
        reader.setZXingModuleOverrides({
          locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing_reader.wasm" : prefix + path),
        });
        return reader;
      })
      .catch((error) => {
        readerPromise = null; // let the next call retry
        throw error;
      });
  }
  return readerPromise;
}

/** Start downloading the decoder early so the first scan is not delayed. */
export function preloadQrDecoder(): void {
  void loadReader().catch(() => {});
}

export async function decodeQrFromImageData(image: ImageData): Promise<string | null> {
  const { readBarcodes } = await loadReader();
  const results = await readBarcodes(image, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 });
  const hit = results.find((result) => result.isValid && result.text);
  return hit ? hit.text : null;
}

/** Decodes a QR code from an uploaded photo or screenshot. Returns null when none is found. */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    // Photos can be 12+ megapixels; shrinking keeps decoding fast without losing the code.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await decodeQrFromImageData(context.getImageData(0, 0, canvas.width, canvas.height));
  } finally {
    bitmap.close();
  }
}
