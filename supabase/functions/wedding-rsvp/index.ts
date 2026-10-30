import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const codePattern = /^[0-9A-HJKMNP-TV-Z]{12}$/;
const giftIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reservationTokenPattern = /^[0-9a-f]{64}$/;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function getSecretKey() {
  const keysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keysJson) {
    try {
      const keys = JSON.parse(keysJson) as Record<string, string>;
      if (keys.default) return keys.default;
      const firstKey = Object.values(keys)[0];
      if (firstKey) return firstKey;
    } catch {
      // Fall through to the legacy variable while projects finish migrating keys.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanCode(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[\s-]/g, "");
}

function safeExternalUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function isMissingGiftTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

async function getPublicGifts(client: NonNullable<ReturnType<typeof getDatabaseClient>>) {
  const { data: gifts, error: giftsError } = await client
    .from("wedding_gifts")
    .select("id, title, description, price_cents, product_url, sort_order, created_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (giftsError) {
    if (isMissingGiftTable(giftsError)) return { available: false, gifts: [] };
    throw giftsError;
  }

  const { data: reservations, error: reservationsError } = await client
    .from("wedding_gift_reservations")
    .select("gift_id");

  if (reservationsError) {
    if (isMissingGiftTable(reservationsError)) return { available: false, gifts: [] };
    throw reservationsError;
  }

  const reservedGiftIds = new Set((reservations || []).map((reservation) => reservation.gift_id));
  return {
    available: true,
    gifts: (gifts || []).map((gift) => ({
      id: gift.id,
      title: gift.title,
      description: gift.description || "",
      price_cents: Number.isInteger(gift.price_cents) ? gift.price_cents : null,
      product_url: safeExternalUrl(gift.product_url),
      reserved: reservedGiftIds.has(gift.id),
    })),
  };
}

function createReservationToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getParisDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function publicGuests(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((guest) => guest && typeof guest.id === "string" && typeof guest.name === "string")
    .map((guest) => ({
      id: guest.id,
      name: guest.name,
      attending: typeof guest.attending === "boolean" ? guest.attending : null,
    }));
}

function getDatabaseClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const secretKey = getSecretKey();
  if (!url || !secretKey) return null;
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function checkRateLimit(client: ReturnType<typeof getDatabaseClient>, request: Request) {
  if (!client) return false;
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const fingerprint = await sha256(`wedding-rsvp:${forwarded}`);
  const { data, error } = await client.rpc("allow_wedding_rsvp_attempt", {
    p_fingerprint: fingerprint,
  });
  if (error) throw error;
  return data === true;
}

async function getDeadline(client: NonNullable<ReturnType<typeof getDatabaseClient>>) {
  const { data, error } = await client
    .from("wedding_site_content")
    .select("content")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  const value = data?.content?.rsvpDeadline;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "2026-12-16";
}

async function getSiteContent(client: NonNullable<ReturnType<typeof getDatabaseClient>>) {
  const { data, error } = await client
    .from("wedding_site_content")
    .select("content")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;

  const content = (data?.content && typeof data.content === "object" ? { ...data.content } : {}) as Record<string, unknown>;
  const bucket = client.storage.from("wedding-photos");
  const createSignedPhotoUrl = async (path: unknown) => {
    if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("..")) return "";
    const { data: signed, error: signedError } = await bucket.createSignedUrl(path, 60 * 60 * 12);
    if (signedError) throw signedError;
    return signed?.signedUrl || "";
  };

  if (content.heroStoragePath) {
    const signedUrl = await createSignedPhotoUrl(content.heroStoragePath);
    if (signedUrl) content.heroImageUrl = signedUrl;
  }

  if (Array.isArray(content.galleryImages)) {
    content.galleryImages = await Promise.all((content.galleryImages as Array<Record<string, unknown>>).map(async (photo) => {
      if (!photo || typeof photo !== "object" || !photo.storagePath) return photo;
      const signedUrl = await createSignedPhotoUrl(photo.storagePath);
      return signedUrl ? { ...photo, url: signedUrl } : photo;
    }));
  }

  return content;
}

async function getApprovedMessages(client: NonNullable<ReturnType<typeof getDatabaseClient>>) {
  const { data, error } = await client
    .from("wedding_rsvp_messages")
    .select("guest_name, is_anonymous, message, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map((message) => ({
    guest_name: message.is_anonymous ? "Anonyme" : message.guest_name,
    message: message.message,
    created_at: message.created_at,
  }));
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const client = getDatabaseClient();
  if (!client) return json({ ok: false, error: "service_unavailable" }, 503);

  try {
    const body = await request.json().catch(() => null);
    if (!body || !["lookup", "submit", "submit_message", "list_messages", "site_data", "reserve_gift", "cancel_gift"].includes(body.action)) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }

    // A site_data request already requires a valid, high-entropy invitation code.
    // Avoid applying the shared IP limit to page refreshes from the Vercel proxy.
    if (body.action !== "site_data" && !(await checkRateLimit(client, request))) {
      return json({ ok: false, error: "rate_limited" }, 429);
    }

    const code = cleanCode(body.code);
    if (!codePattern.test(code)) {
      return json({ ok: false, error: "invalid_code" });
    }

    const codeHash = await sha256(code);
    const { data: invitation, error: invitationError } = await client
      .from("wedding_rsvp_invitations")
      .select("id, guests")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (invitationError) throw invitationError;
    if (!invitation) return json({ ok: false, error: "invalid_code" });

    const guests = publicGuests(invitation.guests);
    if (!guests.length) return json({ ok: false, error: "invalid_code" });

    const deadline = await getDeadline(client);
    const closed = getParisDate() >= deadline;

    if (body.action === "list_messages") {
      return json({ ok: true, messages: await getApprovedMessages(client) });
    }

    if (body.action === "site_data") {
      const giftList = await getPublicGifts(client);
      return json({
        ok: true,
        guests,
        deadline,
        closed,
        content: await getSiteContent(client),
        messages: await getApprovedMessages(client),
        giftsAvailable: giftList.available,
        gifts: giftList.gifts,
      });
    }

    if (body.action === "reserve_gift") {
      const giftId = typeof body.giftId === "string" ? body.giftId : "";
      if (!giftIdPattern.test(giftId)) return json({ ok: false, error: "invalid_gift" });

      const { data: gift, error: giftError } = await client
        .from("wedding_gifts")
        .select("id")
        .eq("id", giftId)
        .eq("is_active", true)
        .maybeSingle();
      if (giftError) {
        if (isMissingGiftTable(giftError)) return json({ ok: false, error: "gift_list_not_ready" });
        throw giftError;
      }
      if (!gift) return json({ ok: false, error: "gift_unavailable" });

      const reservationToken = createReservationToken();
      const { error: reservationError } = await client
        .from("wedding_gift_reservations")
        .insert({ gift_id: giftId, reservation_token_hash: await sha256(reservationToken) });

      if (reservationError?.code === "23505") return json({ ok: false, error: "gift_already_reserved" });
      if (reservationError) {
        if (isMissingGiftTable(reservationError)) return json({ ok: false, error: "gift_list_not_ready" });
        throw reservationError;
      }

      return json({ ok: true, reservationToken });
    }

    if (body.action === "cancel_gift") {
      const giftId = typeof body.giftId === "string" ? body.giftId : "";
      const reservationToken = typeof body.reservationToken === "string" ? body.reservationToken : "";
      if (!giftIdPattern.test(giftId) || !reservationTokenPattern.test(reservationToken)) {
        return json({ ok: false, error: "invalid_reservation" });
      }

      const { data: removed, error: reservationError } = await client
        .from("wedding_gift_reservations")
        .delete()
        .eq("gift_id", giftId)
        .eq("reservation_token_hash", await sha256(reservationToken))
        .select("gift_id")
        .maybeSingle();

      if (reservationError) {
        if (isMissingGiftTable(reservationError)) return json({ ok: false, error: "gift_list_not_ready" });
        throw reservationError;
      }
      if (!removed) return json({ ok: false, error: "reservation_not_found" });
      return json({ ok: true });
    }

    if (body.action === "lookup") {
      return json({ ok: true, guests, deadline, closed });
    }

    if (body.action === "submit_message") {
      const guestId = typeof body.guestId === "string" ? body.guestId : "";
      const guest = guests.find((person) => person.id === guestId);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const messageLength = Array.from(message).length;

      if (!guest || messageLength < 3 || messageLength > 700) {
        return json({ ok: false, error: "invalid_message" });
      }

      const submittedAt = new Date().toISOString();
      const { error: messageError } = await client
        .from("wedding_rsvp_messages")
        .upsert({
          invitation_id: invitation.id,
          guest_id: guest.id,
          guest_name: guest.name,
          is_anonymous: body.anonymous === true,
          message,
          status: "pending",
          created_at: submittedAt,
          updated_at: submittedAt,
        }, { onConflict: "invitation_id,guest_id" });

      if (messageError) throw messageError;
      return json({ ok: true });
    }

    if (closed) return json({ ok: false, error: "responses_closed" });

    if (!Array.isArray(body.responses) || body.responses.length !== guests.length) {
      return json({ ok: false, error: "incomplete_response" });
    }

    const requested = new Map<string, boolean>();
    for (const response of body.responses) {
      if (!response || typeof response.guestId !== "string" || typeof response.attending !== "boolean") {
        return json({ ok: false, error: "incomplete_response" });
      }
      if (requested.has(response.guestId)) return json({ ok: false, error: "incomplete_response" });
      requested.set(response.guestId, response.attending);
    }

    if (guests.some((guest) => !requested.has(guest.id))) {
      return json({ ok: false, error: "incomplete_response" });
    }

    const updatedGuests = guests.map((guest) => ({
      ...guest,
      attending: requested.get(guest.id)!,
    }));

    const { error: updateError } = await client
      .from("wedding_rsvp_invitations")
      .update({ guests: updatedGuests, updated_at: new Date().toISOString() })
      .eq("id", invitation.id);

    if (updateError) throw updateError;
    return json({ ok: true, guests: updatedGuests, deadline, closed: false });
  } catch (error) {
    console.error("wedding-rsvp request failed", error);
    return json({ ok: false, error: "service_unavailable" }, 500);
  }
});

