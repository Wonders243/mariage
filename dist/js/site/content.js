import { connectSupabase, isSupabaseConfigured, supabaseConfig } from '../shared/supabase-client.js';
import { renderSiteContent } from './content-renderer.js';

async function loadAdminSiteData() {
  if (!isSupabaseConfigured) throw new Error('La connexion Supabase n’est pas configurée.');
  const supabase = await connectSupabase();
  const { data: row, error } = await supabase
    .from('wedding_site_content')
    .select('content')
    .eq('id', 'main')
    .maybeSingle();
  if (error) throw error;

  const content = row?.content || {};
  const bucket = supabase.storage.from(supabaseConfig.photoBucket || 'wedding-photos');
  const signPhoto = async (path) => {
    if (typeof path !== 'string' || !path) return '';
    const { data, error: signError } = await bucket.createSignedUrl(path, 60 * 60 * 12);
    if (signError) throw signError;
    return data.signedUrl;
  };

  if (content.heroStoragePath) content.heroImageUrl = await signPhoto(content.heroStoragePath);
  if (Array.isArray(content.galleryImages)) {
    content.galleryImages = await Promise.all(content.galleryImages.map(async (photo) => (
      photo?.storagePath ? { ...photo, url: await signPhoto(photo.storagePath) } : photo
    )));
  }

  const { data: messages, error: messageError } = await supabase
    .from('wedding_rsvp_messages')
    .select('guest_name, is_anonymous, message, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(100);
  if (messageError) throw messageError;

  return {
    content,
    messages: (messages || []).map((message) => ({
      guest_name: message.is_anonymous ? 'Anonyme' : message.guest_name,
      message: message.message,
      created_at: message.created_at,
    })),
  };
}

export async function loadSiteContent() {
  try {
    const response = await fetch('/api/site-data', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) {
      window.location.replace('/access.html');
      return null;
    }
    let data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.message || 'Les informations ne sont pas disponibles.');
    if (data.role === 'admin') data = { ...data, ...await loadAdminSiteData() };
    if (data.content) renderSiteContent(data.content);
    return data;
  } catch (error) {
    console.error('Les informations en ligne ne sont pas disponibles.', error);
    return null;
  }
}
