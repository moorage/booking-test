const state = {
  config: null,
  slots: [],
  selectedAppointment: null,
};

const elements = {
  appointmentList: document.querySelector("#appointment-list"),
  form: document.querySelector("#request-form"),
  selectedTitle: document.querySelector("#selected-title"),
  selectedDetail: document.querySelector("#selected-detail"),
  slotSelect: document.querySelector("#slot-select"),
  timeZoneLabel: document.querySelector("#time-zone-label"),
  submitButton: document.querySelector("#submit-request"),
  formStatus: document.querySelector("#form-status"),
};

main().catch((error) => {
  showStatus(error.message || "Requests are not available right now. Try again later.", "error");
});

async function main() {
  if (!window.crypto?.subtle) {
    throw new Error("This browser cannot encrypt the request. Try another browser.");
  }

  const [config, availability] = await Promise.all([
    fetchJSON("public/site-config.json"),
    fetchJSON("public/availability/slots.json"),
  ]);

  state.config = config;
  state.slots = availability.slots || [];
  applyConfig(config);
  renderAppointments(config.appointmentTypes || []);
  elements.form.addEventListener("submit", submitRequest);
}

async function fetchJSON(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Requests are not available right now. Try again later.");
  }
  return response.json();
}

function applyConfig(config) {
  document.title = config.profile.pageTitle;
  document.querySelector("[data-profile='pageTitle']").textContent = config.profile.pageTitle;
  document.querySelector("[data-profile='pageSubtitle']").textContent = config.profile.pageSubtitle;
  document.querySelector("[data-copy='privacyNote']").textContent = config.copy.privacyNote;
  document.documentElement.style.setProperty("--booking-accent", config.theme.accentColor);
  document.documentElement.style.setProperty("--booking-background", config.theme.backgroundColor);
  document.documentElement.style.setProperty("--booking-text", config.theme.textColor);
}

function renderAppointments(appointmentTypes) {
  elements.appointmentList.replaceChildren();
  for (const appointmentType of appointmentTypes) {
    const button = document.createElement("button");
    button.className = "appointment-card";
    button.type = "button";
    button.innerHTML = `
      <span>
        <strong></strong>
        <span></span>
      </span>
      <span></span>
    `;
    button.querySelector("strong").textContent = appointmentType.name;
    button.querySelector("span span").textContent = appointmentType.summary || "";
    button.querySelector(":scope > span:last-child").textContent = `${appointmentType.durationMinutes} minutes`;
    button.addEventListener("click", () => selectAppointment(appointmentType));
    elements.appointmentList.append(button);
  }
}

function selectAppointment(appointmentType) {
  state.selectedAppointment = appointmentType;
  elements.form.hidden = false;
  elements.selectedTitle.textContent = appointmentType.name;
  elements.selectedDetail.textContent = appointmentType.summary || "";
  elements.submitButton.textContent = appointmentType.autoConfirm ? "Book this time" : "Send request";
  elements.timeZoneLabel.textContent = `Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  renderSlots(appointmentType.id);
  showStatus("");
}

function renderSlots(appointmentTypeID) {
  const slots = state.slots.filter((slot) => slot.appointmentTypeID === appointmentTypeID);
  elements.slotSelect.replaceChildren();
  for (const slot of slots) {
    const option = document.createElement("option");
    option.value = slot.id;
    option.textContent = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(slot.startsAt));
    elements.slotSelect.append(option);
  }
}

async function submitRequest(event) {
  event.preventDefault();
  const slot = state.slots.find((candidate) => candidate.id === elements.slotSelect.value);
  if (!slot) {
    showStatus("This time is no longer available. Choose another time.", "error");
    return;
  }

  elements.submitButton.disabled = true;
  showStatus("Encrypting request...");

  try {
    const formData = new FormData(elements.form);
    const plaintext = {
      requestID: crypto.randomUUID(),
      appointmentTypeID: state.selectedAppointment.id,
      slotID: slot.id,
      slotToken: slot.token,
      visitor: {
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        topic: String(formData.get("topic") || ""),
      },
      browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAt: new Date().toISOString(),
    };

    const envelope = await encryptRequest(plaintext, slot);

    const response = await fetch(`${state.config.inbox.url}/v1/inboxes/${encodeURIComponent(state.config.inbox.id)}/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });

    if (!response.ok) {
      throw new Error("Requests are not available right now. Try again later.");
    }

    showStatus(state.selectedAppointment.autoConfirm ? "A calendar invite is on the way." : "You will get a confirmation after this time is reviewed.");
    elements.form.reset();
  } catch (error) {
    showStatus(error.message || "Requests are not available right now. Try again later.", "error");
  } finally {
    elements.submitButton.disabled = false;
  }
}

async function encryptRequest(plaintext, slot) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    state.config.encryption.publicKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    ephemeralKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, encodedPlaintext);
  const ephemeralPublicKeyJwk = await crypto.subtle.exportKey("jwk", ephemeralKeyPair.publicKey);

  return {
    schemaVersion: 1,
    requestID: plaintext.requestID,
    inboxID: state.config.inbox.id,
    shareID: state.config.share.id,
    createdAt: plaintext.createdAt,
    expiresAt: slot.expiresAt,
    keyID: state.config.encryption.keyID,
    algorithm: "ECDH-P256-AES-GCM",
    ephemeralPublicKeyJwk,
    nonce: base64URL(nonce),
    ciphertext: base64URL(new Uint8Array(ciphertext)),
  };
}

function base64URL(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function showStatus(message, kind = "info") {
  elements.formStatus.textContent = message;
  elements.formStatus.dataset.kind = kind;
}
