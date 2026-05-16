const MAX_LONG_EDGE = 1600;
const TARGET_MIME_TYPE = "image/jpeg";
const TARGET_QUALITY = 0.72;
const MAX_ORIGINAL_SIZE_BYTES = 900 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen seleccionada."));
    };

    image.src = objectUrl;
  });
}

function buildCompressedFileName(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${baseName}.jpg`;
}

export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const image = await loadImage(file);
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  const longestEdge = Math.max(originalWidth, originalHeight);

  if (longestEdge <= MAX_LONG_EDGE && file.size <= MAX_ORIGINAL_SIZE_BYTES) {
    return file;
  }

  const scale = longestEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longestEdge : 1;
  const targetWidth = Math.max(1, Math.round(originalWidth * scale));
  const targetHeight = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  // Fondo blanco para conservar visibilidad al convertir PNG/WebP con transparencia a JPG.
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, TARGET_MIME_TYPE, TARGET_QUALITY);
  });

  if (!blob) {
    return file;
  }

  if (blob.size >= file.size && scale >= 1) {
    return file;
  }

  return new File([blob], buildCompressedFileName(file.name), {
    type: TARGET_MIME_TYPE,
    lastModified: Date.now(),
  });
}
