import { supabaseConfig } from '../shared/supabase-client.js';

const photoBucket = supabaseConfig.photoBucket || 'wedding-photos';

export async function uploadPhoto(supabase, file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Choisis une photo au format JPG, PNG, WebP ou GIF.');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Chaque photo doit faire 8 Mo maximum.');

  const extension = file.name.includes('.')
    ? file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')
    : 'jpg';
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${id}.${extension || 'jpg'}`;
  const { error } = await supabase.storage.from(photoBucket).upload(path, file, {
    cacheControl: '3600',
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
