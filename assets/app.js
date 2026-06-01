const state = {
  config: null,
  slots: [],
  selectedAppointment: null,
  selectedDateKey: "",
  selectedSlotID: "",
  selectedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  visibleMonth: null,
  guestCount: 0,
};

const elements = {
  appointmentList: document.querySelector("#appointment-list"),
  form: document.querySelector("#request-form"),
  selectedTitle: document.querySelector("#selected-title"),
  selectedDetail: document.querySelector("#selected-detail"),
  timeStep: document.querySelector("#time-step"),
  detailsStep: document.querySelector("#details-step"),
  calendarMonth: document.querySelector("#calendar-month"),
  calendarGrid: document.querySelector("#calendar-grid"),
  previousMonth: document.querySelector("#previous-month"),
  nextMonth: document.querySelector("#next-month"),
  selectedDateHeading: document.querySelector("#selected-date-heading"),
  timeList: document.querySelector("#time-list"),
  timeZoneSelect: document.querySelector("#time-zone-select"),
  slotSelect: document.querySelector("#slot-select"),
  backToTimes: document.querySelector("#back-to-times"),
  addGuest: document.querySelector("#add-guest"),
  guestFields: document.querySelector("#guest-fields"),
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
  const appointmentTypes = config.appointmentTypes || [];
  renderAppointments(appointmentTypes);
  renderTimeZones();
  elements.form.addEventListener("submit", submitRequest);
  elements.previousMonth.addEventListener("click", () => changeVisibleMonth(-1));
  elements.nextMonth.addEventListener("click", () => changeVisibleMonth(1));
  elements.timeZoneSelect.addEventListener("change", handleTimeZoneChange);
  elements.backToTimes.addEventListener("click", showTimeStep);
  elements.addGuest.addEventListener("click", addGuestField);
  const linkedAppointment = linkedAppointmentType(appointmentTypes);
  if (linkedAppointment) {
    selectAppointment(linkedAppointment);
  }
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
    button.dataset.appointmentId = appointmentType.id;
    button.dataset.appointmentSlug = appointmentType.slug;
    button.setAttribute("aria-pressed", "false");
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
  state.selectedSlotID = "";
  state.selectedDateKey = firstAvailableDateKey(appointmentType.id);
  state.visibleMonth = monthFromDateKey(state.selectedDateKey) || monthFromDate(new Date());
  elements.form.hidden = false;
  elements.selectedTitle.textContent = "Select a date and time";
  elements.selectedDetail.textContent = `${appointmentType.name} - ${appointmentType.durationMinutes} minutes`;
  elements.submitButton.textContent = appointmentType.autoConfirm ? "Schedule event" : "Send request";
  showTimeStep();
  renderCalendar();
  renderTimes();
  updateSelectedAppointmentCard();
  showStatus("");
}

function linkedAppointmentType(appointmentTypes) {
  const value = new URLSearchParams(window.location.search).get("appointment");
  if (!value) {
    return null;
  }

  return appointmentTypes.find((appointmentType) => appointmentType.slug === value || appointmentType.id === value) || null;
}

function updateSelectedAppointmentCard() {
  for (const button of elements.appointmentList.querySelectorAll(".appointment-card")) {
    const isSelected = button.dataset.appointmentId === state.selectedAppointment?.id;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  }
}

function renderTimeZones() {
  const zones = supportedTimeZones();
  elements.timeZoneSelect.replaceChildren();
  for (const zone of zones) {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = timeZoneLabel(zone);
    elements.timeZoneSelect.append(option);
  }
  if (!zones.includes(state.selectedTimeZone)) {
    const option = document.createElement("option");
    option.value = state.selectedTimeZone;
    option.textContent = timeZoneLabel(state.selectedTimeZone);
    elements.timeZoneSelect.prepend(option);
  }
  elements.timeZoneSelect.value = state.selectedTimeZone;
}

function supportedTimeZones() {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return [
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "Europe/London",
    "Europe/Paris",
    "Asia/Tokyo",
    "Australia/Sydney",
    "UTC",
  ];
}

function handleTimeZoneChange() {
  state.selectedTimeZone = elements.timeZoneSelect.value;
  state.selectedSlotID = "";
  state.selectedDateKey = firstAvailableDateKey(state.selectedAppointment.id);
  state.visibleMonth = monthFromDateKey(state.selectedDateKey) || monthFromDate(new Date());
  renderCalendar();
  renderTimes();
}

function renderCalendar() {
  const slotsByDate = slotsGroupedByDate();
  const month = state.visibleMonth || monthFromDate(new Date());
  updateMonthNavigation(month);
  elements.calendarMonth.textContent = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.year, month.month, 1)));
  elements.calendarGrid.replaceChildren();

  const firstDay = new Date(Date.UTC(month.year, month.month, 1));
  const firstWeekday = firstDay.getUTCDay();
  const dayCount = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  for (let index = 0; index < firstWeekday; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day spacer";
    elements.calendarGrid.append(spacer);
  }

  const todayKey = dateKeyInTimeZone(new Date(), state.selectedTimeZone);
  for (let day = 1; day <= dayCount; day += 1) {
    const key = dateKeyFromParts(month.year, month.month + 1, day);
    const hasAvailability = slotsByDate.has(key);
    const button = document.createElement("button");
    button.className = "calendar-day";
    button.type = "button";
    button.textContent = String(day);
    button.disabled = !hasAvailability;
    button.dataset.available = String(hasAvailability);
    button.dataset.selected = String(key === state.selectedDateKey);
    button.dataset.today = String(key === todayKey);
    button.setAttribute("aria-label", calendarDayLabel(key, hasAvailability, key === todayKey));
    button.addEventListener("click", () => {
      state.selectedDateKey = key;
      state.selectedSlotID = "";
      renderCalendar();
      renderTimes();
    });
    elements.calendarGrid.append(button);
  }
}

function renderTimes() {
  const slots = slotsForSelectedDate();
  elements.selectedDateHeading.textContent = state.selectedDateKey
    ? formatDateHeading(state.selectedDateKey)
    : "Select a date";
  elements.timeList.replaceChildren();

  if (slots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-times";
    empty.textContent = "No times are available for this date.";
    elements.timeList.append(empty);
    return;
  }

  for (const slot of slots) {
    const row = document.createElement("div");
    row.className = "time-choice";
    row.dataset.selected = String(slot.id === state.selectedSlotID);

    const timeButton = document.createElement("button");
    timeButton.className = "time-button";
    timeButton.type = "button";
    timeButton.textContent = formatTime(slot.startsAt);
    timeButton.addEventListener("click", () => selectSlot(slot.id));

    const nextButton = document.createElement("button");
    nextButton.className = "next-time-button";
    nextButton.type = "button";
    nextButton.textContent = "Next";
    nextButton.addEventListener("click", showDetailsStep);

    row.append(timeButton, nextButton);
    elements.timeList.append(row);
  }
}

function selectSlot(slotID) {
  state.selectedSlotID = slotID;
  elements.slotSelect.value = slotID;
  renderTimes();
  showStatus("");
}

function showDetailsStep() {
  if (!state.selectedSlotID) {
    showStatus("Choose a time before continuing.", "error");
    return;
  }
  elements.selectedTitle.textContent = "Enter details";
  elements.timeStep.hidden = true;
  elements.detailsStep.hidden = false;
  elements.detailsStep.classList.remove("step-enter");
  requestAnimationFrame(() => elements.detailsStep.classList.add("step-enter"));
  showStatus(`Selected ${formatSelectedSlot()}.`);
}

function showTimeStep() {
  elements.selectedTitle.textContent = "Select a date and time";
  elements.timeStep.hidden = false;
  elements.detailsStep.hidden = true;
  elements.timeStep.classList.remove("step-enter");
  requestAnimationFrame(() => elements.timeStep.classList.add("step-enter"));
}

function addGuestField() {
  state.guestCount += 1;
  const label = document.createElement("label");
  label.className = "guest-label";
  label.setAttribute("for", `guest-email-${state.guestCount}`);
  label.textContent = `Guest ${state.guestCount} email`;
  const input = document.createElement("input");
  input.id = `guest-email-${state.guestCount}`;
  input.name = "guestEmails";
  input.type = "email";
  input.autocomplete = "email";
  input.placeholder = "guest@example.com";
  elements.guestFields.append(label, input);
  input.focus();
}

function changeVisibleMonth(delta) {
  const current = state.visibleMonth || monthFromDate(new Date());
  const target = normalizeMonth(current.year, current.month + delta);
  if (!monthHasBookableEventsInDirection(current, delta)) {
    return;
  }

  state.visibleMonth = target;
  renderCalendar();
  renderTimes();
}

function updateMonthNavigation(month) {
  const hasPrevious = monthHasBookableEventsInDirection(month, -1);
  const hasNext = monthHasBookableEventsInDirection(month, 1);
  elements.previousMonth.disabled = !hasPrevious;
  elements.nextMonth.disabled = !hasNext;
  elements.previousMonth.setAttribute(
    "aria-label",
    hasPrevious ? "Previous month" : "No earlier bookable months"
  );
  elements.nextMonth.setAttribute(
    "aria-label",
    hasNext ? "Next month" : "No later bookable months"
  );
}

function monthHasBookableEventsInDirection(month, delta) {
  const visibleIndex = monthIndex(month);
  return availableMonthIndexes().some((availableIndex) =>
    delta < 0 ? availableIndex < visibleIndex : availableIndex > visibleIndex
  );
}

function availableMonthIndexes() {
  return slotsForAppointment()
    .map((slot) => monthFromDate(new Date(slot.startsAt)))
    .map(monthIndex);
}

function firstAvailableDateKey(appointmentTypeID) {
  const keys = slotsForAppointment(appointmentTypeID)
    .map((slot) => dateKeyInTimeZone(new Date(slot.startsAt), state.selectedTimeZone))
    .sort();
  return keys[0] || "";
}

function slotsForAppointment(appointmentTypeID = state.selectedAppointment?.id) {
  return state.slots
    .filter((slot) => slot.appointmentTypeID === appointmentTypeID)
    .sort((first, second) => new Date(first.startsAt) - new Date(second.startsAt));
}

function slotsGroupedByDate() {
  const grouped = new Map();
  for (const slot of slotsForAppointment()) {
    const key = dateKeyInTimeZone(new Date(slot.startsAt), state.selectedTimeZone);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(slot);
  }
  return grouped;
}

function slotsForSelectedDate() {
  return slotsGroupedByDate().get(state.selectedDateKey) || [];
}

function dateKeyInTimeZone(date, timeZone) {
  const parts = dateParts(date, timeZone);
  return dateKeyFromParts(parts.year, parts.month, parts.day);
}

function dateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value),
    day: Number(parts.find((part) => part.type === "day").value),
  };
}

function dateKeyFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthFromDate(date) {
  const parts = dateParts(date, state.selectedTimeZone);
  return { year: parts.year, month: parts.month - 1 };
}

function monthFromDateKey(key) {
  if (!key) return null;
  const [year, month] = key.split("-").map(Number);
  return { year, month: month - 1 };
}

function normalizeMonth(year, month) {
  const normalized = new Date(Date.UTC(year, month, 1));
  return { year: normalized.getUTCFullYear(), month: normalized.getUTCMonth() };
}

function monthIndex(month) {
  return month.year * 12 + month.month;
}

function calendarDayLabel(key, hasAvailability, isToday) {
  const label = formatDateHeading(key);
  const status = hasAvailability ? "available" : "unavailable";
  return isToday ? `${label}, today, ${status}` : `${label}, ${status}`;
}

function formatDateHeading(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(isoString) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: state.selectedTimeZone,
  }).format(new Date(isoString));
}

function formatSelectedSlot() {
  const slot = state.slots.find((candidate) => candidate.id === state.selectedSlotID);
  return slot ? `${formatDateHeading(state.selectedDateKey)} at ${formatTime(slot.startsAt)}` : "a time";
}

function timeZoneLabel(zone) {
  const label = zone.replaceAll("_", " ");
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    timeZoneName: "short",
  }).formatToParts(new Date());
  const shortName = parts.find((part) => part.type === "timeZoneName")?.value;
  return shortName ? `${label} (${shortName})` : label;
}

async function submitRequest(event) {
  event.preventDefault();
  const slot = state.slots.find((candidate) => candidate.id === state.selectedSlotID);
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
        guestEmails: formData.getAll("guestEmails").map((email) => String(email)).filter(Boolean),
        topic: String(formData.get("topic") || ""),
      },
      browserTimeZone: state.selectedTimeZone,
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
    state.selectedSlotID = "";
    elements.slotSelect.value = "";
    renderTimes();
    showTimeStep();
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
  const ephemeralPublicKeyJwk = publicECDHJwk(await crypto.subtle.exportKey("jwk", ephemeralKeyPair.publicKey));

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

function publicECDHJwk(jwk) {
  return {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
  };
}

function showStatus(message, kind = "info") {
  elements.formStatus.textContent = message;
  elements.formStatus.dataset.kind = kind;
}
