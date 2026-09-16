import { OCR_ACCEPTED_TYPES, OCR_MAX_BYTES } from "./types";

export type ImageVariant = "original" | "upscaled" | "upscaled3" | "inverted";

export interface PreparedImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  variant: ImageVariant;
}

export function validateImageInput(input: unknown): asserts input is Blob {
  if (!(input instanceof Blob)) {
    throw new Error("Choose a PNG, JPEG or WebP screenshot.");
  }
  if (!OCR_ACCEPTED_TYPES.includes(input.type as (typeof OCR_ACCEPTED_TYPES)[number])) {
    throw new Error("Unsupported image. Use PNG, JPEG or WebP.");
  }
  if (input.size > OCR_MAX_BYTES) {
    throw new Error("That image is larger than 10 MB. Choose a smaller screenshot.");
  }
}

async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  if (typeof Image === "undefined" || typeof URL?.createObjectURL !== "function") {
    throw new Error("This browser cannot decode the selected image.");
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Prepare screenshots only. The original bitmap is the first OCR attempt;
 * integer upscaling and inversion are explicit fallback variants rather than
 * hidden transformations of the extracted text.
 */
export async function prepareImage(
  blob: Blob,
  variant: ImageVariant,
): Promise<PreparedImage> {
  validateImageInput(blob);
  const source = await decodeImage(blob);
  const sourceWidth = source instanceof ImageBitmap ? source.width : source.naturalWidth;
  const sourceHeight = source instanceof ImageBitmap ? source.height : source.naturalHeight;
  const scale = variant === "original" ? 1 : variant === "upscaled3" ? 3 : 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: variant === "inverted" });
  if (!context) {
    if (source instanceof ImageBitmap) source.close();
    throw new Error("This browser cannot prepare the selected image.");
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  if (variant === "inverted") {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = 255 - pixels.data[index];
      pixels.data[index + 1] = 255 - pixels.data[index + 1];
      pixels.data[index + 2] = 255 - pixels.data[index + 2];
    }
    context.putImageData(pixels, 0, 0);
  }

  if (source instanceof ImageBitmap) source.close();
  return { canvas, width: canvas.width, height: canvas.height, variant };
}
