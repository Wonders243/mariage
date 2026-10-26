import { connectSupabase, isSupabaseConfigured } from "../shared/supabase-client.js";
import { normalizeInvitationCode } from "../shared/invitation-code.js";

const lookupForm = document.querySelector("#rsvp-lookup-form");
const codeInput = document.querySelector("#rsvp-code");
const lookupStatus = document.querySelector("#rsvp-lookup-status");
const responsePanel = document.querySelector("#rsvp-response-panel");
const responseForm = document.querySelector("#rsvp-response-form");
const guestList = document.querySelector("#rsvp-guest-list");
const responseStatus = document.querySelector("#rsvp-response-status");
const submitButton = document.querySelector("#rsvp-submit");
const wishForm = document.querySelector("#guest-wish-form");
const wishAuthor = document.querySelector("#guest-wish-author");
const wishMessage = document.querySelector("#guest-wish-message");
const wishAnonymous = document.querySelector("#guest-wish-anonymous");
const wishStatus = document.querySelector("#guest-wish-status");
const wishSubmit = document.querySelector("#guest-wish-submit");
const publicMessages = document.querySelector("#guest-messages");

let supabase;
let activeCode = "";
let wishesLayoutFrame = 0;

const syncPublicMessagesLayout = () => {
  if (!publicMessages) return;
  const track = publicMessages.querySelector(".wishes-track");
  const group = track?.querySelector(".wishes-group");
  if (!track || !group) return;

  track.querySelector(".wishes-group--duplicate")?.remove();
  publicMessages.classList.remove("is-ticker", "is-static-overflow");
  publicMessages.removeAttribute("tabindex");
  publicMessages.removeAttribute("aria-label");
  track.style.removeProperty("--wishes-duration");

  const overflows = group.getBoundingClientRect().width > publicMessages.clientWidth + 1;
  if (!overflows) return;

  publicMessages.tabIndex = 0;
  publicMessages.setAttribute("aria-label", "Faire défiler les petits mots");

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    publicMessages.classList.add("is-static-overflow");
    return;
  }

  const duplicate = group.cloneNode(true);
  duplicate.classList.add("wishes-group--duplicate");
  duplicate.setAttribute("aria-hidden", "true");
  track.append(duplicate);
  track.style.setProperty("--wishes-duration", `${Math.max(24, group.getBoundingClientRect().width / 34)}s`);
  publicMessages.classList.add("is-ticker");
};

const schedulePublicMessagesLayout = () => {
  if (wishesLayoutFrame) cancelAnimationFrame(wishesLayoutFrame);
  wishesLayoutFrame = requestAnimationFrame(() => {
    wishesLayoutFrame = 0;
    syncPublicMessagesLayout();
  });
};

window.addEventListener("resize", schedulePublicMessagesLayout, { passive: true });
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", schedulePublicMessagesLayout);

const setStatus = (element, message, isError = false) => {
  if (!element) return;
  element.textContent = message;
  element.dataset.error = String(isError);
};

const formatDeadline = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris"
  }).format(new Date(`${value}T12:00:00`));
};

const renderGuests = (guests) => {
  guestList.replaceChildren();
  if (wishAuthor) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choisir une personne";
    wishAuthor.replaceChildren(placeholder);
    guests.forEach((guest) => {
      const option = document.createElement("option");
      option.value = guest.id;
      option.textContent = guest.name;
      wishAuthor.append(option);
    });
  }

  guests.forEach((guest, index) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "rsvp-guest";
    fieldset.dataset.guestId = guest.id;

    const legend = document.createElement("legend");
    legend.textContent = guest.name;
    fieldset.append(legend);

    const choices = document.createElement("div");
    choices.className = "rsvp-guest__choices";

    [
      { value: "yes", label: "Présent(e)", checked: guest.attending === true },
      { value: "no", label: "Absent(e)", checked: guest.attending === false }
    ].forEach((choice) => {
      const label = document.createElement("label");
      label.className = "rsvp-guest__choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `guest-${index}`;
      input.value = choice.value;
      input.checked = choice.checked;

      const text = document.createElement("span");
      text.textContent = choice.label;

      label.append(input, text);
      choices.append(label);
    });

    fieldset.append(choices);
    guestList.append(fieldset);
  });
};

const callRsvp = async (body) => {
  const { data, error } = await supabase.functions.invoke("wedding-rsvp", { body });
  if (error) {
    if (error.context?.status === 429) {
      throw new Error("Trop de tentatives. Réessaie dans quelques minutes.");
    }
    if (error.context?.status === 404) {
      throw new Error("Le service de réponse n’est pas encore déployé sur Supabase.");
    }
    if (error.context?.status >= 500) {
      throw new Error("Le service Supabase rencontre une erreur. Vérifie que le SQL RSVP a été exécuté et que la fonction est déployée.");
    }
    throw new Error("Le service de réponse n’est pas disponible pour le moment.");
  }

  if (data?.error === "invalid_code") {
    throw new Error("Ce code ne correspond pas à une invitation. Vérifie le code imprimé sur le faire-part.");
  }
  if (data?.error === "rate_limited") {
    throw new Error("Trop de tentatives. Réessaie dans quelques minutes.");
  }
  if (data?.error === "responses_closed") {
    throw new Error("La date limite de réponse est passée.");
  }
  if (data?.error === "incomplete_response") {
    throw new Error("Indique une réponse pour chaque personne invitée.");
  }
  if (data?.error === "invalid_message") {
    throw new Error("Choisissez votre prénom et écrivez un message de 3 à 700 caractères.");
  }
  if (!data?.ok) {
    throw new Error("Le service de réponse n’est pas disponible pour le moment.");
  }
  return data;
};

const renderPublicMessages = (messages) => {
  if (!publicMessages) return;
  publicMessages.replaceChildren();
  publicMessages.classList.remove("is-ticker", "is-static-overflow");

  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "wishes-empty";
    empty.textContent = "Les premiers mots doux apparaîtront ici.";
    publicMessages.append(empty);
    return;
  }

  const track = document.createElement("div");
  track.className = "wishes-track";
  const group = document.createElement("div");
  group.className = "wishes-group";

  messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = "wish-note";
    const author = document.createElement("h3");
    author.textContent = message.guest_name || "Un proche";
    const body = document.createElement("p");
    body.textContent = message.message || "";
    article.append(author, body);
    if (message.created_at) {
      const date = new Date(message.created_at);
      if (!Number.isNaN(date.getTime())) {
        const time = document.createElement("time");
        time.dateTime = date.toISOString();
        time.textContent = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
        article.append(time);
      }
    }
    group.append(article);
  });

  track.append(group);
  publicMessages.append(track);
  schedulePublicMessagesLayout();
};

const showInvitation = (data) => {
  if (!data?.guests?.length) return;
  activeCode = normalizeInvitationCode(data.code || "");
  codeInput.value = activeCode.match(/.{1,4}/g)?.join("-") || "";
  renderGuests(data.guests);
  responsePanel.hidden = false;
  setStatus(lookupStatus, "");

  const deadline = formatDeadline(data.deadline);
  if (data.closed) {
    setStatus(responseStatus, "La date limite est passée. Les réponses déjà enregistrées restent visibles, mais ne peuvent plus être modifiées.", true);
    submitButton.disabled = true;
    guestList.querySelectorAll("input").forEach((input) => { input.disabled = true; });
    return;
  }

  submitButton.disabled = false;
  const hasPreviousResponse = data.guests.some((guest) => typeof guest.attending === "boolean");
  setStatus(responseStatus, hasPreviousResponse
    ? `Votre réponse précédente est affichée. Vous pouvez la modifier avant le ${deadline}.`
    : deadline ? `Merci de répondre avant le ${deadline}.` : "");
};

lookupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) {
    setStatus(lookupStatus, "La confirmation n’est pas encore disponible. Réessaie plus tard.", true);
    return;
  }

  activeCode = normalizeInvitationCode(codeInput.value);
  responsePanel.hidden = true;
  setStatus(lookupStatus, "Recherche de l’invitation…");
  const button = lookupForm.querySelector('button[type="submit"]');
  button.disabled = true;

  try {
    const data = await callRsvp({ action: "lookup", code: activeCode });
    showInvitation({ ...data, code: activeCode });
  } catch (error) {
    setStatus(lookupStatus, error.message || "Le code n’a pas pu être vérifié.", true);
  } finally {
    button.disabled = false;
  }
});

responseForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !activeCode) return;

  const responses = Array.from(guestList.querySelectorAll(".rsvp-guest")).map((fieldset) => {
    const selected = fieldset.querySelector('input[type="radio"]:checked');
    return {
      guestId: fieldset.dataset.guestId,
      attending: selected ? selected.value === "yes" : null
    };
  });

  if (responses.some((response) => response.attending === null)) {
    setStatus(responseStatus, "Indique une réponse pour chaque personne invitée.", true);
    return;
  }

  submitButton.disabled = true;
  setStatus(responseStatus, "Enregistrement de votre réponse…");

  try {
    const data = await callRsvp({ action: "submit", code: activeCode, responses });
    renderGuests(data.guests);
    setStatus(responseStatus, "Merci, votre réponse est bien enregistrée.");
  } catch (error) {
    setStatus(responseStatus, error.message || "La réponse n’a pas pu être enregistrée.", true);
  } finally {
    submitButton.disabled = false;
  }
});

wishForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !activeCode) {
    setStatus(wishStatus, "Indiquez d’abord le code inscrit sur votre faire-part.", true);
    return;
  }

  wishSubmit.disabled = true;
  setStatus(wishStatus, "Envoi de votre petit mot…");
  try {
    await callRsvp({
      action: "submit_message",
      code: activeCode,
      guestId: wishAuthor.value,
      message: wishMessage.value,
      anonymous: wishAnonymous.checked
    });
    wishMessage.value = "";
    wishAnonymous.checked = false;
    setStatus(wishStatus, "Merci pour ces mots. Ils apparaîtront sur le site après validation.");
  } catch (error) {
    setStatus(wishStatus, error.message || "Le message n’a pas pu être envoyé.", true);
  } finally {
    wishSubmit.disabled = false;
  }
});

codeInput?.addEventListener("input", () => {
  const code = normalizeInvitationCode(codeInput.value)
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, "")
    .slice(0, 12);
  codeInput.value = code.match(/.{1,4}/g)?.join("-") || "";
  if (activeCode && code !== activeCode) {
    activeCode = "";
    responsePanel.hidden = true;
    setStatus(lookupStatus, "Vérifiez à nouveau le code pour répondre ou écrire un message.");
  }
});

export async function initRsvp(siteData = null) {
  if (!lookupForm) return;
  if (!isSupabaseConfigured) {
    setStatus(lookupStatus, "La confirmation n’est pas encore disponible. Réessaie plus tard.", true);
    return;
  }

  try {
    supabase = await connectSupabase();
    renderPublicMessages(Array.isArray(siteData?.messages) ? siteData.messages : []);
    const invitationFromAccess = siteData?.role === "guest"
      && typeof siteData.code === "string"
      && Array.isArray(siteData.guests)
      && siteData.guests.length > 0;
    lookupForm.hidden = invitationFromAccess;
    showInvitation(siteData);
    if (!siteData) setStatus(lookupStatus, "Les informations de l’invitation ne sont pas disponibles. Recharge la page ou saisis à nouveau ton code.", true);
  } catch {
    setStatus(lookupStatus, "La confirmation n’est pas encore disponible. Réessaie plus tard.", true);
  }
}

