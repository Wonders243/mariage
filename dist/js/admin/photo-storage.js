import { supabaseConfig } from '../shared/supabase-client.js';

const photoBucket = supabaseConfig.photoBucket || 'wedding-photos';
const maxUploadBytes = 8 * 1024 * 1024;
const maxImageDimension = 1920;
const webpQuality = 0.82;
const photoTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);

function isAnimatedPng(file) {
  return file.slice(0, 256 * 1024).arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return false;

    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const chunkLength = new DataView(buffer, offset, 4).getUint32(0);
      const chunkType = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (chunkType === 'acTL') return true;
      if (chunkType === 'IDAT' || chunkType === 'IEND' || offset + 12 + chunkLength > bytes.length) return false;
      offset += 12 + chunkLength;
    }
    return false;
  });
}

async function decodePhoto(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      } catch { /* Use the image-element fallback below. */ }
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Cette image ne peut pas être lue par le navigateur.'));
    };
    image.src = objectUrl;
  });
}

async function preparePhoto(file) {
  const original = { blob: file, contentType: file.type, extension: photoTypes.get(file.type) };
  if (file.type === 'image/gif' || file.type === 'image/webp') return original;
  if (file.type === 'image/png' && await isAnimatedPng(file)) return original;

  let image;
  let canvas;
  try {
    image = await decodePhoto(file);
    const largestSide = Math.max(image.width, image.height);
    if (!largestSide) return original;

    const scale = Math.min(1, maxImageDimension / largestSide);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return original;

    context.drawImage(image.source, 0, 0, width, height);
    const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', webpQuality));
    if (!webp || webp.type !== 'image/webp') return original;

    const resized = width !== image.width || height !== image.height;
    if (!resized && webp.size >= file.size) return original;
    return { blob: webp, contentType: 'image/webp', extension: 'webp' };
  } catch {
    return original;
  } finally {
    image?.close?.();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export async function uploadPhoto(supabase, file) {
  if (!photoTypes.has(file.type)) {
    throw new Error('Choisis une photo au format JPG, PNG, WebP ou GIF.');
  }
  if (file.size > maxUploadBytes) throw new Error('Chaque photo doit faire 8 Mo maximum.');

  const prepared = await preparePhoto(file);
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${id}.${prepared.extension}`;
  const { error } = await supabase.storage.from(photoBucket).upload(path, prepared.blob, {
    cacheControl: '31536000',
    contentType: prepared.contentType,
    upsert: false
  });

  if (error) throw error;
  try {
    return { url: await createPhotoPreviewUrl(supabase, path), storagePath: path };
  } catch (previewError) {
    await supabase.storage.from(photoBucket).remove([path]);
    throw previewError;
  }
}

export async function createPhotoPreviewUrl(supabase, path) {
  const { data, error } = await supabase.storage.from(photoBucket).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeStoredPhotos(supabase, paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return;

  const { error } = await supabase.storage.from(photoBucket).remove(uniquePaths);
  if (error) throw error;
}
