const STORAGE_KEYS = {
  auth: "heartywelcome.auth.v1",
};

const cfg = window.INVITELITE_SUPABASE || {};
if (!cfg.url || !cfg.anonKey) {
  throw new Error("Supabase is required. Set url and anonKey in supabase-config.js");
}

const elements = {
  dataMode: document.getElementById("data-mode"),
  createPanel: document.getElementById("create-panel"),
  eventPanel: document.getElementById("event-panel"),
  managePanel: document.getElementById("manage-panel"),
  dashboardPanel: document.getElementById("dashboard-panel"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  signupBtn: document.getElementById("signup-btn"),
  signinBtn: document.getElementById("signin-btn"),
  signoutBtn: document.getElementById("signout-btn"),
  authStatus: document.getElementById("auth-status"),
  createForm: document.getElementById("create-form"),
  eventTitle: document.getElementById("event-title"),
  hostName: document.getElementById("host-name"),
  eventDateTime: document.getElementById("event-datetime"),
  eventLocation: document.getElementById("event-location"),
  eventDetails: document.getElementById("event-details"),
  eventDeadline: document.getElementById("event-deadline"),
  eventPasscode: document.getElementById("event-passcode"),
  eventSelect: document.getElementById("event-select"),
  copyEventLinkBtn: document.getElementById("copy-event-link"),
  exportCsvBtn: document.getElementById("export-csv"),
  manageStatus: document.getElementById("manage-status"),
  stats: document.getElementById("stats"),
  rsvpRows: document.getElementById("rsvp-rows"),
  invitePanel: document.getElementById("invite-panel"),
  inviteTitle: document.getElementById("invite-title"),
  inviteMeta: document.getElementById("invite-meta"),
  inviteDetails: document.getElementById("invite-details"),
  rsvpForm: document.getElementById("rsvp-form"),
  rsvpName: document.getElementById("rsvp-name"),
  rsvpEmail: document.getElementById("rsvp-email"),
  rsvpStatus: document.getElementById("rsvp-status"),
  rsvpCount: document.getElementById("rsvp-count"),
  rsvpNote: document.getElementById("rsvp-note"),
  passcodeField: document.getElementById("passcode-field"),
  rsvpPasscode: document.getElementById("rsvp-passcode"),
  rsvpStatusMessage: document.getElementById("rsvp-status-message"),
};

const state = {
  events: [],
  rsvps: [],
  selectedEventId: null,
  inviteMode: null,
  session: loadSession(),
  user: null,
};

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.auth) || "null");
  } catch {
    return null;
  }
}

function saveSession(next) {
  state.session = next || null;
  if (state.session) {
    sessionStorage.setItem(STORAGE_KEYS.auth, JSON.stringify(state.session));
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.auth);
  }
}

async function apiRequest(method, path, { token, body, headers = {}, preferReturn = false } = {}) {
  const mergedHeaders = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${token || cfg.anonKey}`,
    "Content-Type": "application/json",
    ...headers,
  };
  if (preferReturn) mergedHeaders.Prefer = "return=representation";

  const res = await fetch(`${cfg.url.replace(/\/+$/, "")}${path}`, {
    method,
    headers: mergedHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  return await res.json();
}

function requireAccessToken() {
  const token = state.session?.access_token;
  if (!token) throw new Error("Sign in required.");
  return token;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) return "TBD";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function setDefaultDateTime() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  elements.eventDateTime.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function createEventLink(eventId, inviteToken) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("event", eventId);
  url.searchParams.set("t", inviteToken);
  return url.toString();
}

function renderAuthState() {
  elements.authStatus.textContent = state.user ? `Signed in as ${state.user.email}` : "Not signed in.";
  const showHostUi = Boolean(state.user);
  elements.eventPanel.classList.toggle("hidden", !showHostUi);
  elements.managePanel.classList.toggle("hidden", !showHostUi);
  elements.dashboardPanel.classList.toggle("hidden", !showHostUi);
}

function populateEventSelect() {
  elements.eventSelect.innerHTML = "";
  if (!state.events.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No events yet";
    elements.eventSelect.appendChild(option);
    state.selectedEventId = null;
    return;
  }
  state.events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${event.title} (${formatDateTime(event.dateTime)})`;
    elements.eventSelect.appendChild(option);
  });
  if (!state.events.find((event) => event.id === state.selectedEventId)) {
    state.selectedEventId = state.events[0].id;
  }
  elements.eventSelect.value = state.selectedEventId;
}

function renderStats(rsvps) {
  const totals = { yes: 0, maybe: 0, no: 0, attending: 0 };
  rsvps.forEach((rsvp) => {
    totals[rsvp.status] += 1;
    if (rsvp.status === "yes" || rsvp.status === "maybe") totals.attending += Number(rsvp.attendees || 1);
  });
  elements.stats.innerHTML = [
    ["Yes", totals.yes],
    ["Maybe", totals.maybe],
    ["No", totals.no],
    ["Expected attendees", totals.attending],
  ]
    .map(([label, value]) => `<article class="stat"><h3>${label}</h3><p>${value}</p></article>`)
    .join("");
}

function renderRows(rsvps) {
  if (!rsvps.length) {
    elements.rsvpRows.innerHTML = '<tr><td colspan="6">No RSVPs yet.</td></tr>';
    return;
  }
  elements.rsvpRows.innerHTML = rsvps
    .map(
      (rsvp) => `
      <tr>
        <td>${escapeHtml(rsvp.name)}</td>
        <td>${escapeHtml(rsvp.email || "-")}</td>
        <td><span class="pill ${rsvp.status}">${rsvp.status.toUpperCase()}</span></td>
        <td>${rsvp.attendees}</td>
        <td>${escapeHtml(rsvp.note || "-")}</td>
        <td>${new Date(rsvp.respondedAt).toLocaleString()}</td>
      </tr>
    `
    )
    .join("");
}

async function fetchCurrentUser() {
  if (!state.session?.access_token) {
    state.user = null;
    return null;
  }
  try {
    state.user = await apiRequest("GET", "/auth/v1/user", { token: state.session.access_token });
    return state.user;
  } catch {
    saveSession(null);
    state.user = null;
    return null;
  }
}

function fromDbEvent(row) {
  return {
    id: row.id,
    title: row.title,
    host: row.host,
    dateTime: row.event_datetime,
    location: row.location,
    details: row.details || "",
    deadline: row.deadline,
    passcode: row.passcode || "",
    createdAt: row.created_at,
  };
}

function fromDbRsvp(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    email: row.email || "",
    status: row.status,
    attendees: row.attendees,
    note: row.note || "",
    respondedAt: row.responded_at,
  };
}

async function listEvents() {
  if (!state.user) return [];
  const rows = await apiRequest("GET", "/rest/v1/events?select=*&order=created_at.desc", {
    token: requireAccessToken(),
  });
  return rows.map(fromDbEvent);
}

async function listRsvps(eventId) {
  const rows = await apiRequest(
    "GET",
    `/rest/v1/rsvps?select=*&event_id=eq.${encodeURIComponent(eventId)}&order=responded_at.desc`,
    { token: requireAccessToken() }
  );
  return rows.map(fromDbRsvp);
}

async function getPrimaryToken(eventId) {
  const rows = await apiRequest(
    "GET",
    `/rest/v1/invite_tokens?select=token&event_id=eq.${encodeURIComponent(eventId)}&is_primary=eq.true&is_active=eq.true&limit=1`,
    { token: requireAccessToken() }
  );
  return rows[0]?.token || null;
}

async function createInviteToken(eventId, isPrimary = false) {
  const rows = await apiRequest("POST", "/rest/v1/invite_tokens?select=token", {
    token: requireAccessToken(),
    body: { event_id: eventId, guest_name: null, is_primary: isPrimary, is_active: true },
    preferReturn: true,
  });
  return rows[0].token;
}

async function createEventWithToken(payload) {
  const rows = await apiRequest("POST", "/rest/v1/rpc/create_event_with_primary_token", {
    token: requireAccessToken(),
    body: {
      p_title: payload.title,
      p_host: payload.host,
      p_event_datetime: payload.dateTime,
      p_location: payload.location,
      p_details: payload.details || null,
      p_deadline: payload.deadline || null,
      p_passcode: payload.passcode || null,
    },
  });
  const created = rows[0];
  const events = await apiRequest("GET", `/rest/v1/events?select=*&id=eq.${encodeURIComponent(created.event_id)}&limit=1`, {
    token: requireAccessToken(),
  });
  return { event: fromDbEvent(events[0]), inviteToken: created.invite_token };
}

async function getEventForInvite(eventId, inviteToken) {
  const rows = await apiRequest("GET", `/rest/v1/events?select=*&id=eq.${encodeURIComponent(eventId)}&limit=1`, {
    headers: { "x-invite-token": inviteToken },
  });
  return rows.length ? fromDbEvent(rows[0]) : null;
}

async function submitRsvpWithToken(payload, inviteToken) {
  await apiRequest("POST", "/rest/v1/rpc/submit_rsvp_with_token", {
    body: {
      p_event_id: payload.eventId,
      p_token: inviteToken,
      p_name: payload.name,
      p_email: payload.email || null,
      p_status: payload.status,
      p_attendees: payload.attendees,
      p_note: payload.note || null,
    },
  });
}

async function refreshEventsAndDashboard() {
  state.events = await listEvents();
  populateEventSelect();
  if (!state.selectedEventId) {
    elements.manageStatus.textContent = state.user ? "Create your first event." : "Sign in to manage events.";
    renderStats([]);
    renderRows([]);
    return;
  }
  state.rsvps = await listRsvps(state.selectedEventId);
  const selectedEvent = state.events.find((event) => event.id === state.selectedEventId);
  elements.manageStatus.textContent = selectedEvent
    ? `Managing "${selectedEvent.title}" hosted by ${selectedEvent.host}.`
    : "No event selected.";
  renderStats(state.rsvps);
  renderRows(state.rsvps);
}

async function handleSignUp() {
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  if (!email || !password) {
    elements.authStatus.textContent = "Provide email and password.";
    return;
  }
  const response = await apiRequest("POST", "/auth/v1/signup", { body: { email, password } });
  if (!response.access_token) {
    throw new Error("Signup completed but no session returned. Disable email confirmation or verify email first.");
  }
  saveSession(response);
  await fetchCurrentUser();
  renderAuthState();
  await refreshEventsAndDashboard();
}

async function handleSignIn() {
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  if (!email || !password) {
    elements.authStatus.textContent = "Provide email and password.";
    return;
  }
  const response = await apiRequest("POST", "/auth/v1/token?grant_type=password", { body: { email, password } });
  saveSession(response);
  await fetchCurrentUser();
  renderAuthState();
  await refreshEventsAndDashboard();
}

async function handleSignOut() {
  if (state.session?.access_token) {
    await apiRequest("POST", "/auth/v1/logout", { token: state.session.access_token }).catch(() => {});
  }
  saveSession(null);
  state.user = null;
  renderAuthState();
  await refreshEventsAndDashboard();
}

async function handleCreateEvent(event) {
  event.preventDefault();
  const payload = {
    title: elements.eventTitle.value.trim(),
    host: elements.hostName.value.trim(),
    dateTime: elements.eventDateTime.value,
    location: elements.eventLocation.value.trim(),
    details: elements.eventDetails.value.trim(),
    deadline: elements.eventDeadline.value || null,
    passcode: elements.eventPasscode.value.trim(),
  };

  const created = await createEventWithToken(payload);
  await refreshEventsAndDashboard();
  state.selectedEventId = created.event.id;
  elements.eventSelect.value = created.event.id;
  elements.manageStatus.textContent = `Event created. Share: ${createEventLink(created.event.id, created.inviteToken)}`;
  elements.createForm.reset();
  setDefaultDateTime();
}

async function handleCopyLink() {
  if (!state.selectedEventId) return;
  let token = await getPrimaryToken(state.selectedEventId);
  if (!token) token = await createInviteToken(state.selectedEventId, true);
  const link = createEventLink(state.selectedEventId, token);
  await navigator.clipboard.writeText(link);
  elements.manageStatus.textContent = "Secure invite link copied.";
}

function downloadCsv() {
  if (!state.selectedEventId) return;
  const event = state.events.find((item) => item.id === state.selectedEventId);
  if (!event) return;
  const header = ["Name", "Email", "Status", "Attendees", "Note", "Responded At"];
  const data = state.rsvps.map((rsvp) => [rsvp.name, rsvp.email || "", rsvp.status, rsvp.attendees, rsvp.note || "", rsvp.respondedAt]);
  const csv = [header, ...data].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${event.title.replaceAll(/\s+/g, "-").toLowerCase()}-rsvps.csv`;
  link.click();
}

async function handleInvitePage(eventId, inviteToken) {
  elements.invitePanel.classList.remove("hidden");
  if (!inviteToken) {
    elements.inviteTitle.textContent = "Invite token missing";
    elements.inviteMeta.textContent = "Secure link is incomplete.";
    elements.rsvpForm.classList.add("hidden");
    return;
  }
  const event = await getEventForInvite(eventId, inviteToken);
  if (!event) {
    elements.inviteTitle.textContent = "Invite not found";
    elements.inviteMeta.textContent = "This invite may be invalid or expired.";
    elements.rsvpForm.classList.add("hidden");
    return;
  }
  state.inviteMode = { eventId, inviteToken };
  elements.inviteTitle.textContent = `${event.title} — RSVP`;
  elements.inviteMeta.textContent = `${formatDateTime(event.dateTime)} • ${event.location} • Hosted by ${event.host}`;
  elements.inviteDetails.textContent = event.details || "No extra details provided.";
  elements.passcodeField.classList.toggle("hidden", !event.passcode);
  elements.rsvpForm.classList.remove("hidden");
}

async function handleRsvpSubmit(event) {
  event.preventDefault();
  if (!state.inviteMode) return;
  const inviteEvent = await getEventForInvite(state.inviteMode.eventId, state.inviteMode.inviteToken);
  if (!inviteEvent) {
    elements.rsvpStatusMessage.textContent = "Event could not be loaded.";
    return;
  }
  if (inviteEvent.passcode && elements.rsvpPasscode.value.trim() !== inviteEvent.passcode) {
    elements.rsvpStatusMessage.textContent = "Incorrect passcode.";
    return;
  }
  await submitRsvpWithToken(
    {
      eventId: inviteEvent.id,
      name: elements.rsvpName.value.trim(),
      email: elements.rsvpEmail.value.trim(),
      status: elements.rsvpStatus.value,
      attendees: Number(elements.rsvpCount.value),
      note: elements.rsvpNote.value.trim(),
    },
    state.inviteMode.inviteToken
  );
  elements.rsvpStatusMessage.textContent = "RSVP saved. Thank you.";
}

function wireEvents() {
  elements.signupBtn.addEventListener("click", () => handleSignUp().catch((e) => (elements.authStatus.textContent = e.message)));
  elements.signinBtn.addEventListener("click", () => handleSignIn().catch((e) => (elements.authStatus.textContent = e.message)));
  elements.signoutBtn.addEventListener("click", () => handleSignOut().catch((e) => (elements.authStatus.textContent = e.message)));
  elements.createForm.addEventListener("submit", (event) => handleCreateEvent(event).catch((e) => (elements.manageStatus.textContent = e.message)));
  elements.copyEventLinkBtn.addEventListener("click", () => handleCopyLink().catch((e) => (elements.manageStatus.textContent = e.message)));
  elements.exportCsvBtn.addEventListener("click", downloadCsv);
  elements.eventSelect.addEventListener("change", () => {
    state.selectedEventId = elements.eventSelect.value;
    refreshEventsAndDashboard().catch((e) => (elements.manageStatus.textContent = e.message));
  });
  elements.rsvpForm.addEventListener("submit", (event) =>
    handleRsvpSubmit(event).catch((e) => (elements.rsvpStatusMessage.textContent = e.message))
  );
}

async function init() {
  setDefaultDateTime();
  wireEvents();
  elements.dataMode.textContent = "Data mode: Supabase cloud (prod profile)";

  await apiRequest("GET", "/rest/v1/events?select=id&limit=1");
  await fetchCurrentUser();
  renderAuthState();
  await refreshEventsAndDashboard();

  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("event");
  const inviteToken = params.get("t") || "";
  if (eventId) {
    await handleInvitePage(eventId, inviteToken);
  }
}

init().catch((error) => {
  console.error(error);
  elements.manageStatus.textContent = error.message;
});
