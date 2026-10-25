import { connectSupabase, isSupabaseConfigured } from '../shared/supabase-client.js';
import { renderSiteContent } from './content-renderer.js';

export async function loadSiteContent() {
  if (!isSupabaseConfigured) return;

  try {
    const supabase = await connectSupabase();
    const { data, error } = await supabase
      .from('wedding_site_content')
      .select('content')
      .eq('id', 'main')
      .maybeSingle();

    if (error) throw error;
    if (data?.content) renderSiteContent(data.content);
  } catch (error) {
    console.error('Les informations en ligne ne sont pas disponibles.', error);
  }
}
