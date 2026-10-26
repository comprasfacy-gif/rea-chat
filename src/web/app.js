
const $ = (id) => document.getElementById(id);

const state = {
  ws: null, me: null, toolCount: 0,
  guilds: [], users: [], dms: [],
  guildId: null, channelId: null, dmId: null,
  messages: new Map(), online: [], voiceStates: [],
  replyTo: null, pending: [], typingTimers: new Map(),
  unread: new Map(), membersVisible: true,
  voice: {
    channelId: null, channelName: "",
    localStream: null, screenStream: null, camStream: null,
    peers: new Map(), remoteStreams: new Map(),
    muted: false, deafened: false, camera: false, screen: false,
    audioCtx: null, analyser: null, speakRaf: null,
    lastSpeak: false, speaking: false,
  },
};

const els = {
  login: $("login"), loginForm: $("login-form"), username: $("username"),
  loginError: $("login-error"), loginTools: $("login-tools"),
  app: $("app"), guildList: $("guild-list"), addGuild: $("add-guild"),
  openDmList: $("open-dm-list"), guildName: $("guild-name"),
  guildSettings: $("guild-settings"), channelList: $("channel-list"),
  meBlock: $("me-block"), meAvatar: $("me-avatar"), meName: $("me-name"),
  meTag: $("me-tag"), btnStatus: $("btn-status"), btnSettings: $("btn-settings"),
  channelIcon: $("channel-icon"), channelName: $("channel-name"),
  channelTopic: $("channel-topic"), searchInput: $("search-input"),
  btnMembers: $("btn-members"), messages: $("messages"), typing: $("typing"),
  composer: $("composer"), composerReply: $("composer-reply"),
  composerReplyText: $("composer-reply-text"), cancelReply: $("cancel-reply"),
  composerAttachments: $("composer-attachments"), btnAttach: $("btn-attach"),
  fileInput: $("file-input"), input: $("input"),
  membersPanel: $("members-panel"), onlineCount: $("online-count"),
  memberList: $("member-list"), closeMembers: $("close-members"),
  modal: $("modal"), modalBody: $("modal-body"), toast: $("toast"),
  btnCall: $("btn-call"), voiceStage: $("voice-stage"),
  voiceStageTitle: $("voice-stage-title"), voiceTiles: $("voice-tiles"),
  btnMic: $("btn-mic"), btnDeafen: $("btn-deafen"),
  btnCamera: $("btn-camera"), btnScreen: $("btn-screen"),
  btnVoiceLeave: $("btn-voice-leave"),
};


els["login-name"] = els.username;
els["login-form"] = els.loginForm;
els["composer"] = els.composer;
els["login-error"] = els.loginError;
els["toast"] = els.toast;
els["messages"] = els.messages;
els["channel-topic"] = els.channelTopic;
els["search-input"] = els.searchInput;
els["online-count"] = els.onlineCount;
els["composer-input"] = els.input;
els["channel-title"] = els.channelName;
els["members-list"] = els.memberList;
els["guild-list"] = els.guildList;
els["channel-list"] = els.channelList;

const EMOJIS = ["\uD83D\uDC4D","\uD83D\uDE02","\u2764\uFE0F","\uD83D\uDD25","\uD83D\uDE2E","\uD83D\uDE22","\uD83C\uDF89","\u2705","\uD83D\uDC40","\uD83D\uDCAF","\uD83D\uDE4F","\uD83D\uDE0E","\uD83E\uDD14","\uD83D\uDC4E","\uD83D\uDC80","\uD83D\uDE80"];
const STATUS_LABEL = { online: "Online", idle: "Ausente", dnd: "Nao perturbe", invisible: "Invisivel" };
const STATUS_COLOR = { online: "#23a559", idle: "#f0b232", dnd: "#f23f43", invisible: "#80848e" };

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function getInitials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Hoje";
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3200);
}

function avatarNode(user, size) {
  const node = createEl("div", size === "sm" ? "avatar avatar-sm" : "avatar");
  node.style.background = (user && user.color) || "#5865f2";
  if (user && user.avatar) {
    const img = document.createElement("img");
    img.src = user.avatar;
    img.alt = user.username || "";
    node.appendChild(img);
  } else {
    node.textContent = getInitials(user ? user.username : "?");
  }
  return node;
}

function statusDot(status) {
  return createEl("span", "status-dot status-" + (status || "online"));
}


function typingIndicator(names) {
  if (!els["typing"]) return;
  if (!names || names.length === 0) { els["typing"].textContent = ""; return; }
  const t = names.length === 1 ? names[0] + " esta digitando..." : names.slice(0, 3).join(", ") + " estao digitando...";
  els["typing"].textContent = t;
}

function appendInline(parent, text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/\S+)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      const b = document.createElement("strong"); b.textContent = part.slice(2, -2); parent.appendChild(b);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      const c = document.createElement("code"); c.className = "inline"; c.textContent = part.slice(1, -1); parent.appendChild(c);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const i = document.createElement("em"); i.textContent = part.slice(1, -1); parent.appendChild(i);
    } else if (/^https?:\/\//.test(part)) {
      const a = document.createElement("a"); a.href = part; a.target = "_blank"; a.rel = "noopener"; a.textContent = part; parent.appendChild(a);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}

function send(obj) {
  if (!state.ws) return;
  if (state.ws.readyState !== 1) return;
  state.ws.send(JSON.stringify(obj));
}

function findGuild(id) {
  for (const g of state.guilds) if (g.id === id) return g;
  return null;
}

function findChannel(id) {
  for (const g of state.guilds) {
    for (const c of g.channels || []) if (c.id === id) return c;
  }
  return null;
}

function findDm(id) {
  for (const d of state.dms) if (d.id === id) return d;
  return null;
}

function findUser(id) {
  for (const u of state.users) if (u.id === id) return u;
  return null;
}

function onlineUser(id) {
  return state.online.indexOf(id) !== -1;
}

function currentGuild() {
  return findGuild(state.guildId);
}

function memberOf(guild, userId) {
  if (!guild) return null;
  for (const m of guild.members || []) if (m.userId === userId) return m;
  return null;
}

function displayName(userId) {
  const m = memberOf(currentGuild(), userId);
  if (m && m.nickname) return m.nickname;
  const u = findUser(userId);
  return u ? u.username : "Desconhecido";
}

function topRole(userId) {
  const g = currentGuild();
  if (!g) return null;
  const m = memberOf(g, userId);
  if (!m || !m.roleIds || m.roleIds.length === 0) return null;
  let best = null;
  for (const r of g.roles || []) {
    if (m.roleIds.indexOf(r.id) === -1) continue;
    if (!best || (r.position || 0) > (best.position || 0)) best = r;
  }
  return best;
}

function userColor(userId) {
  const r = topRole(userId);
  if (r && r.color) return r.color;
  const u = findUser(userId);
  return u && u.color ? u.color : "#dbdee1";
}

function renderGuilds() {
  const box = els["guild-list"];
  if (!box) return;
  box.innerHTML = "";
  const home = createEl("button", "guild-pill guild-home");
  home.title = "Mensagens Diretas";
  home.textContent = "REA";
  home.addEventListener("click", function () { selectGuild(null); });
  box.appendChild(home);
  for (const g of state.guilds) {
    const btn = createEl("button", "guild-pill");
    btn.title = g.name;
    btn.textContent = getInitials(g.name);
    if (g.id === state.guildId) btn.classList.add("active");
    btn.addEventListener("click", function () { selectGuild(g.id); });
    box.appendChild(btn);
  }
}

function selectGuild(id) {
  state.guildId = id;
  if (id) {
    const g = findGuild(id);
    const list = g && g.channels ? g.channels : [];
    state.channelId = list.length > 0 ? list[0].id : null;
    state.dmId = null;
  } else {
    state.channelId = null;
    if (state.dms.length > 0) state.dmId = state.dms[0].id;
  }
  renderGuilds();
  renderChannels();
  renderMembers();
  renderHeader();
  loadMessages();
}

function renderChannels() {
  const box = els["channel-list"];
  if (!box) return;
  box.innerHTML = "";
  if (!state.guildId) {
    for (const d of state.dms) {
      const u = findUser(d.userId);
      const row = createEl("div", "channel-item");
      if (d.id === state.dmId) row.classList.add("active");
      row.appendChild(avatarNode(u, true));
      const name = createEl("span", "channel-name");
      name.textContent = u ? u.username : "DM";
      row.appendChild(name);
      row.addEventListener("click", function () { selectDm(d.id); });
      box.appendChild(row);
    }
    return;
  }
  const g = currentGuild();
  if (!g) return;
  for (const c of g.channels || []) {
    const row = createEl("div", "channel-item");
    if (c.id === state.channelId) row.classList.add("active");
    const icon = createEl("span", "channel-icon");
    icon.textContent = c.type === "voice" ? "V" : "#";
    row.appendChild(icon);
    const name = createEl("span", "channel-name");
    name.textContent = c.name;
    row.appendChild(name);
    row.addEventListener("click", function () { selectChannel(c.id); });
    box.appendChild(row);
  }
}

function selectChannel(id) {
  state.channelId = id;
  state.dmId = null;
  renderChannels();
  renderMembers();
  renderHeader();
  loadMessages();
}

function selectDm(id) {
  state.dmId = id;
  state.channelId = null;
  renderChannels();
  renderMembers();
  renderHeader();
  loadMessages();
}

function renderHeader() {
  const t = els["channel-title"];
  const d = els["channel-topic"];
  if (!t) return;
  if (state.channelId) {
    const c = findChannel(state.channelId);
    t.textContent = (c && c.type === "voice" ? "" : "# ") + (c ? c.name : "canal");
    if (d) d.textContent = c && c.topic ? c.topic : "";
  } else if (state.dmId) {
    const dm = findDm(state.dmId);
    const u = dm ? findUser(dm.userId) : null;
    t.textContent = u ? u.username : "Mensagem Direta";
    if (d) d.textContent = "";
  } else {
    t.textContent = "REA Chat";
    if (d) d.textContent = "";
  }
}

function renderMembers() {
  const box = els["members-list"];
  if (!box) return;
  box.innerHTML = "";
  const g = currentGuild();
  let list = g && g.members ? g.members.slice() : [];
  if (!list.length && state.users.length) {
    list = state.users.map(function (u) { return { userId: u.id, roleIds: [], nickname: null, user: u }; });
  }
  list.sort(function (x, y) {
    const ox = onlineUser(x.userId) ? 0 : 1;
    const oy = onlineUser(y.userId) ? 0 : 1;
    if (ox !== oy) return ox - oy;
    return displayName(x.userId).localeCompare(displayName(y.userId));
  });
  let onlineN = 0;
  for (const m of list) {
    const u = findUser(m.userId) || m.user || null;
    const isOn = onlineUser(m.userId) || !!u;
    if (isOn) onlineN++;
    const row = createEl("div", "member");
    const av = avatarNode(u, true);
    av.appendChild(statusDot(isOn ? "online" : "invisible"));
    row.appendChild(av);
    const nm = createEl("span", "member-name");
    nm.textContent = m.nickname || displayName(m.userId);
    nm.style.color = (u && u.color) || userColor(m.userId);
    row.appendChild(nm);
    box.appendChild(row);
  }
  if (els["online-count"]) els["online-count"].textContent = "Online " + onlineN;
}

function messageNode(msg) {
  const row = createEl("div", "message");
  row.dataset.id = msg.id;
  const u = msg.authorId ? { id: msg.authorId, username: msg.authorName || "?", color: msg.authorColor || "#5865f2" } : null;
  row.appendChild(avatarNode(u, false));
  const body = createEl("div", "message-body");
  const head = createEl("div", "message-head");
  const name = createEl("span", "message-author");
  name.textContent = msg.authorName || displayName(msg.authorId);
  name.style.color = msg.authorColor || userColor(msg.authorId);
  head.appendChild(name);
  const time = createEl("span", "message-time");
  time.textContent = formatClock(msg.createdAt);
  head.appendChild(time);
  if (msg.editedAt) {
    const ed = createEl("span", "message-edited");
    ed.textContent = "(editado)";
    head.appendChild(ed);
  }
  body.appendChild(head);
  const text = createEl("div", "message-text");
  appendInline(text, msg.content || "");
  body.appendChild(text);
  row.appendChild(body);
  return row;
}

function renderMessages() {
  const box = els["messages"];
  if (!box) return;
  box.innerHTML = "";
  const key = state.channelId || state.dmId;
  const list = key ? state.messages.get(key) || [] : [];
  let lastDay = "";
  for (const msg of list) {
    const day = formatDay(msg.createdAt);
    if (day !== lastDay) {
      const sep = createEl("div", "day-sep");
      const line = createEl("span", "day-sep-text");
      line.textContent = day;
      sep.appendChild(line);
      box.appendChild(sep);
      lastDay = day;
    }
    box.appendChild(messageNode(msg));
  }
  box.scrollTop = box.scrollHeight;
}

function loadMessages() {
  renderMessages();
  const key = state.channelId || state.dmId;
  if (!key) return;
  if (state.channelId) send({ type: "join", channelId: state.channelId });
  else send({ type: "dm_history", dmId: state.dmId });
}

function upsertMessage(list, msg) {
  const i = list.findIndex(function (m) { return m.id === msg.id; });
  if (i >= 0) list[i] = msg;
  else list.push(msg);
  list.sort(function (x, y) { return (x.createdAt || 0) - (y.createdAt || 0); });
}

function addMessage(msg) {
  const key = msg.channelId || msg.dmId;
  if (!key) return;
  if (!state.messages.has(key)) state.messages.set(key, []);
  upsertMessage(state.messages.get(key), msg);
  const active = state.channelId || state.dmId;
  if (active === key) renderMessages();
}

function replaceHistory(channelId, dmId, list) {
  const key = channelId || dmId;
  if (!key) return;
  const arr = (list || []).slice();
  arr.sort(function (x, y) { return (x.createdAt || 0) - (y.createdAt || 0); });
  state.messages.set(key, arr);
  const active = state.channelId || state.dmId;
  if (active === key) renderMessages();
}

function handleMessageCreate(msg) {
  addMessage(msg);
}

function handleMessageUpdate(msg) {
  addMessage(msg);
}

function handleMessageDelete(data) {
  const key = data.channelId || data.dmId;
  if (!key) return;
  const list = state.messages.get(key);
  if (!list) return;
  const i = list.findIndex(function (m) { return m.id === data.id || m.id === data.messageId; });
  if (i >= 0) list.splice(i, 1);
  const active = state.channelId || state.dmId;
  if (active === key) renderMessages();
}

function handlePresence(data) {
  if (!data) return;
  if (Array.isArray(data.online)) state.online = data.online.slice();
  if (data.userId) {
    const i = state.online.indexOf(data.userId);
    if (data.status === "online" && i === -1) state.online.push(data.userId);
    if (data.status !== "online" && i !== -1) state.online.splice(i, 1);
  }
  renderMembers();
}

function handleTyping(data) {
  if (!data) return;
  if (data.names) typingIndicator(data.names);
}

function handleWelcome(data) {
  if (!data) return;
  if (data.user) state.me = data.user;
  state.guilds = data.guilds || [];
  state.dms = data.dms || [];
  state.users = data.users || [];
  state.online = data.online || [];
  if (els["login"]) els["login"].style.display="none";
  if (els["app"]) els["app"].style.display="grid";
  renderGuilds();
  renderChannels();
  renderMembers();
  renderHeader();
  renderMessages();
}

function handleReady(data) {
  if (!data) return;
  if (data.user) state.me = data.user;
  state.users = data.users || [];
  state.online = data.users || [];
  state.dms = data.dms || [];
  state.toolCount = data.toolCount || 0;
  if (Array.isArray(data.guilds) && data.guilds.length) {
    state.guilds = data.guilds;
  } else {
    state.guilds = [{ id: "rea", name: "REA Chat", channels: data.channels || [], members: [], roles: [] }];
  }
  if (els["login"]) els["login"].style.display = "none";
  if (typeof splashHide === "function") splashHide();
  if (els["app"]) { els["app"].removeAttribute("hidden"); els["app"].style.display = "grid"; }
  if (state.me) {
    if (els.meName) els.meName.textContent = state.me.username || "?";
    if (els.meTag) els.meTag.textContent = "#" + (state.me.discriminator || "0000");
  }
  if (!state.guildId && state.guilds.length) state.guildId = state.guilds[0].id;
  renderGuilds();
  renderChannels();
  renderMembers();
  const g = currentGuild();
  const first = g && g.channels && g.channels.length ? g.channels[0] : null;
  if (first) selectChannel(first.id); else renderHeader();
  renderMessages();
}

function handleUsers(data) {
  if (!data) return;
  if (Array.isArray(data.users)) {
    state.users = data.users;
    state.online = data.users;
  }
  renderMembers();
}

function handleUserUpdated(data) {
  const u = data && data.user ? data.user : data;
  if (!u || !u.id) return;
  const i = state.users.findIndex(function (x) { return x.id === u.id; });
  if (i >= 0) state.users[i] = u; else state.users.push(u);
  if (state.me && state.me.id === u.id) state.me = u;
  renderMembers();
  renderMessages();
}

function handleSearchResults(data) {
  if (!data) return;
  const list = data.results || [];
  if (!els.messages) return;
  els.messages.innerHTML = "";
  if (!list.length) {
    els.messages.appendChild(createEl("div", "empty", "Nenhum resultado"));
    return;
  }
  for (const m of list) els.messages.appendChild(messageNode(m));
}


function handleHistory(data) {
  if (!data) return;
  replaceHistory(data.channelId, data.dmId, data.messages);
}

function handleGuildCreate(g) {
  if (!g) return;
  state.guilds.push(g);
  renderGuilds();
  renderChannels();
}

function handleGuildUpdate(g) {
  if (!g) return;
  const i = state.guilds.findIndex(function (x) { return x.id === g.id; });
  if (i >= 0) state.guilds[i] = g; else state.guilds.push(g);
  renderGuilds();
  renderChannels();
  renderMembers();
  renderHeader();
}

function handleChannelCreate(c) {
  if (!c) return;
  const g = findGuild(c.guildId);
  if (!g) return;
  if (!g.channels) g.channels = [];
  g.channels.push(c);
  renderChannels();
}

function handleChannelUpdate(c) {
  if (!c) return;
  const g = findGuild(c.guildId);
  if (!g || !g.channels) return;
  const i = g.channels.findIndex(function (x) { return x.id === c.id; });
  if (i >= 0) g.channels[i] = c;
  renderChannels();
  renderHeader();
}

function handleChannelDelete(data) {
  if (!data) return;
  for (const g of state.guilds) {
    if (!g.channels) continue;
    const i = g.channels.findIndex(function (x) { return x.id === data.id; });
    if (i >= 0) g.channels.splice(i, 1);
  }
  if (state.channelId === data.id) state.channelId = null;
  renderChannels();
  renderHeader();
}

function handleDmCreate(d) {
  if (!d) return;
  const i = state.dms.findIndex(function (x) { return x.id === d.id; });
  if (i >= 0) state.dms[i] = d; else state.dms.push(d);
  renderChannels();
}

function handleReaction(data) {
  if (!data) return;
  const key = data.channelId || data.dmId;
  const list = state.messages.get(key);
  if (!list) return;
  for (const m of list) {
    if (m.id !== data.messageId) continue;
    if (!m.reactions) m.reactions = [];
    const r = m.reactions.find(function (x) { return x.emoji === data.emoji; });
    if (r) {
      if (data.remove) r.users = (r.users || []).filter(function (u) { return u !== data.userId; });
      else if ((r.users || []).indexOf(data.userId) === -1) r.users.push(data.userId);
    } else if (!data.remove) {
      m.reactions.push({ emoji: data.emoji, users: [data.userId] });
    }
  }
  const active = state.channelId || state.dmId;
  if (active === key) renderMessages();
}

function handleMessageDelete2(msg) {
  handleMessageDelete(msg);
}

function handleVoiceState(data) {
  if (!data) return;
  state.voiceStates = Array.isArray(data.states) ? data.states : (state.voiceStates || []);
  renderVoiceStage();
  renderMembers();
  renderChannels();
}

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function voiceChannelLabel() {
  const v = state.voice;
  if (!v.channelId) return "";
  return v.channelName || "Chamada de voz";
}

function voiceStateFor(clientId) {
  return (state.voiceStates || []).find(function (s) { return s.clientId === clientId; }) || null;
}

function myVoiceState() {
  if (!state.me || !state.ws) return null;
  return (state.voiceStates || []).find(function (s) { return s.userId === state.me.id; }) || null;
}

async function joinVoice(channelId, channelName) {
  const v = state.voice;
  if (v.channelId === channelId) return;
  if (v.channelId) await leaveVoice(false);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (err) {
    showToast("Nao foi possivel acessar o microfone: " + (err && err.message ? err.message : err));
    return;
  }
  v.localStream = stream;
  v.channelId = channelId;
  v.channelName = channelName || "";
  v.muted = false;
  v.deafened = false;
  v.camera = false;
  v.screen = false;
  send({ type: "voice-join", channelId: channelId });
  startSpeakingDetection();
  if (els.voiceStage) els.voiceStage.hidden = false;
  if (els.voiceStageTitle) els.voiceStageTitle.textContent = voiceChannelLabel();
  syncVoiceButtons();
  renderVoiceStage();
}

async function leaveVoice(announce) {
  const v = state.voice;
  if (!v.channelId) return;
  stopSpeakingDetection();
  for (const peer of v.peers.values()) {
    try { peer.pc.close(); } catch (e) { /* ignore */ }
  }
  v.peers.clear();
  v.remoteStreams.clear();
  if (v.localStream) { v.localStream.getTracks().forEach(function (t) { t.stop(); }); v.localStream = null; }
  if (v.camStream) { v.camStream.getTracks().forEach(function (t) { t.stop(); }); v.camStream = null; }
  if (v.screenStream) { v.screenStream.getTracks().forEach(function (t) { t.stop(); }); v.screenStream = null; }
  v.channelId = null;
  v.channelName = "";
  v.camera = false;
  v.screen = false;
  v.muted = false;
  v.deafened = false;
  if (announce !== false) send({ type: "voice-leave" });
  if (els.voiceStage) els.voiceStage.hidden = true;
  if (els.voiceTiles) els.voiceTiles.innerHTML = "";
  syncVoiceButtons();
  renderChannels();
  renderVoiceStage();
}

function ensurePeer(clientId) {
  const v = state.voice;
  if (v.peers.has(clientId)) return v.peers.get(clientId);
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const entry = { pc: pc, pendingCandidates: [], polite: false };
  v.peers.set(clientId, entry);
  if (v.localStream) {
    for (const track of v.localStream.getTracks()) pc.addTrack(track, v.localStream);
  }
  if (v.camStream) {
    for (const track of v.camStream.getTracks()) pc.addTrack(track, v.camStream);
  }
  if (v.screenStream) {
    for (const track of v.screenStream.getTracks()) pc.addTrack(track, v.screenStream);
  }
  pc.onicecandidate = function (ev) {
    if (ev.candidate) send({ type: "voice-signal", targetClientId: clientId, sdp: { type: "candidate", candidate: ev.candidate } });
  };
  pc.ontrack = function (ev) {
    const stream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
    v.remoteStreams.set(clientId, stream);
    renderVoiceStage();
  };
  pc.onconnectionstatechange = function () {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      dropPeer(clientId);
    }
  };
  return entry;
}

function dropPeer(clientId) {
  const v = state.voice;
  const entry = v.peers.get(clientId);
  if (entry) {
    try { entry.pc.close(); } catch (e) { /* ignore */ }
    v.peers.delete(clientId);
  }
  v.remoteStreams.delete(clientId);
  renderVoiceStage();
}

async function callPeer(clientId) {
  const entry = ensurePeer(clientId);
  if (!entry) return;
  entry.polite = false;
  try {
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    send({ type: "voice-signal", targetClientId: clientId, sdp: offer });
  } catch (err) {
    console.warn("offer falhou", err);
  }
}

async function handleVoiceSignal(data) {
  if (!data || !data.fromClientId || !data.sdp) return;
  const v = state.voice;
  if (!v.channelId) return;
  const from = data.fromClientId;
  const entry = ensurePeer(from);
  const desc = data.sdp;
  try {
    if (desc.type === "offer") {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(desc));
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      send({ type: "voice-signal", targetClientId: from, sdp: answer });
      flushCandidates(entry);
    } else if (desc.type === "answer") {
      if (entry.pc.signalingState !== "stable") {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(desc));
        flushCandidates(entry);
      }
    } else if (desc.type === "candidate" && desc.candidate) {
      if (entry.pc.remoteDescription && entry.pc.remoteDescription.type) {
        await entry.pc.addIceCandidate(new RTCIceCandidate(desc.candidate));
      } else {
        entry.pendingCandidates.push(desc.candidate);
      }
    }
  } catch (err) {
    console.warn("voice-signal falhou", err);
  }
}

function flushCandidates(entry) {
  if (!entry || !entry.pc.remoteDescription) return;
  const pending = entry.pendingCandidates || [];
  entry.pendingCandidates = [];
  for (const c of pending) {
    entry.pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () { /* ignore */ });
  }
}

function handleVoicePeers(data) {
  if (!data || !Array.isArray(data.peers)) return;
  const v = state.voice;
  if (!v.channelId) return;
  const seen = new Set();
  for (const peer of data.peers) {
    seen.add(peer.clientId);
    if (!v.peers.has(peer.clientId)) {
      ensurePeer(peer.clientId);
      callPeer(peer.clientId);
    }
  }
  for (const id of [...v.peers.keys()]) {
    if (!seen.has(id)) dropPeer(id);
  }
  renderVoiceStage();
}

function syncVoiceButtons() {
  const v = state.voice;
  if (els.btnMic) els.btnMic.classList.toggle("active", v.muted);
  if (els.btnDeafen) els.btnDeafen.classList.toggle("active", v.deafened);
  if (els.btnCamera) els.btnCamera.classList.toggle("active", v.camera);
  if (els.btnScreen) els.btnScreen.classList.toggle("active", v.screen);
  if (els.btnCall) els.btnCall.classList.toggle("active", !!v.channelId);
}

function applyMuteState() {
  const v = state.voice;
  if (!v.localStream) return;
  for (const t of v.localStream.getAudioTracks()) t.enabled = !v.muted;
}

function toggleMute() {
  const v = state.voice;
  if (!v.channelId) return;
  v.muted = !v.muted;
  if (v.muted) v.deafened = false;
  applyMuteState();
  send({ type: "voice-media", audio: !v.muted });
  syncVoiceButtons();
}

function toggleDeafen() {
  const v = state.voice;
  if (!v.channelId) return;
  v.deafened = !v.deafened;
  if (v.deafened) { v.muted = true; applyMuteState(); send({ type: "voice-media", audio: false }); }
  for (const audio of document.querySelectorAll("#voice-tiles audio")) audio.muted = v.deafened;
  syncVoiceButtons();
  showToast(v.deafened ? "Ensurdecido" : "Audio ativado");
}

async function toggleCamera() {
  const v = state.voice;
  if (!v.channelId) return;
  if (v.camera) {
    if (v.camStream) {
      for (const t of v.camStream.getTracks()) { t.stop(); sendTrackToPeers(t, null); }
      v.camStream = null;
    }
    v.camera = false;
    send({ type: "voice-media", video: false });
  } else {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    } catch (err) {
      showToast("Nao foi possivel acessar a camera");
      return;
    }
    v.camStream = stream;
    v.camera = true;
    for (const t of stream.getTracks()) sendTrackToPeers(t, stream);
    send({ type: "voice-media", video: true });
  }
  syncVoiceButtons();
  renderVoiceStage();
}

async function toggleScreen() {
  const v = state.voice;
  if (!v.channelId) return;
  if (v.screen) {
    if (v.screenStream) {
      for (const t of v.screenStream.getTracks()) { t.stop(); sendTrackToPeers(t, null); }
      v.screenStream = null;
    }
    v.screen = false;
    send({ type: "voice-media", screen: false });
  } else {
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    } catch (err) {
      return;
    }
    v.screenStream = stream;
    v.screen = true;
    for (const t of stream.getTracks()) {
      sendTrackToPeers(t, stream);
      t.addEventListener("ended", function () { if (state.voice.screen) toggleScreen(); });
    }
    send({ type: "voice-media", screen: true });
  }
  syncVoiceButtons();
  renderVoiceStage();
}

function sendTrackToPeers(track, stream) {
  for (const entry of state.voice.peers.values()) {
    const senders = entry.pc.getSenders();
    const same = senders.find(function (s) { return s.track && s.track.kind === track.kind; });
    if (stream) {
      if (same) same.replaceTrack(track).catch(function () { /* ignore */ });
      else entry.pc.addTrack(track, stream);
    } else {
      if (same) entry.pc.removeTrack(same);
    }
  }
}

function startSpeakingDetection() {
  const v = state.voice;
  stopSpeakingDetection();
  if (!v.localStream) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    v.audioCtx = new Ctx();
    const src = v.audioCtx.createMediaStreamSource(v.localStream);
    v.analyser = v.audioCtx.createAnalyser();
    v.analyser.fftSize = 512;
    src.connect(v.analyser);
  } catch (err) {
    return;
  }
  const data = new Uint8Array(v.analyser.frequencyBinCount);
  const tick = function () {
    const vv = state.voice;
    if (!vv.analyser || !vv.channelId) return;
    vv.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const x = (data[i] - 128) / 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / data.length);
    const speaking = rms > 0.035 && !vv.muted;
    if (speaking !== vv.speaking) {
      vv.speaking = speaking;
      send({ type: "voice-speaking", speaking: speaking });
    }
    vv.speakRaf = requestAnimationFrame(tick);
  };
  v.speakRaf = requestAnimationFrame(tick);
}

function stopSpeakingDetection() {
  const v = state.voice;
  if (v.speakRaf) { cancelAnimationFrame(v.speakRaf); v.speakRaf = null; }
  if (v.audioCtx) { try { v.audioCtx.close(); } catch (e) { /* ignore */ } v.audioCtx = null; }
  v.analyser = null;
  v.speaking = false;
  v.lastSpeak = false;
}

function renderVoiceStage() {
  const v = state.voice;
  if (!els.voiceStage) return;
  if (!v.channelId) { els.voiceStage.hidden = true; return; }
  els.voiceStage.hidden = false;
  if (els.voiceStageTitle) els.voiceStageTitle.textContent = voiceChannelLabel();
  const box = els.voiceTiles;
  if (!box) return;
  box.innerHTML = "";
  const inChannel = (state.voiceStates || []).filter(function (s) { return s.channelId === v.channelId; });
  for (const s of inChannel) {
    const tile = createEl("div", "voice-tile");
    if (s.speaking) tile.classList.add("speaking");
    const isMe = state.me && s.userId === state.me.id;
    const hasVideo = s.video || s.screen;
    if (hasVideo) {
      const stream = isMe
        ? (s.screen ? v.screenStream : v.camStream)
        : v.remoteStreams.get(s.clientId);
      if (stream) {
        const vid = document.createElement("video");
        vid.autoplay = true;
        vid.playsInline = true;
        vid.muted = isMe;
        vid.srcObject = stream;
        tile.appendChild(vid);
      }
    }
    if (!tile.firstChild) {
      const av = avatarNode(s.user, false);
      av.classList.add("voice-avatar");
      tile.appendChild(av);
    }
    if (!isMe) {
      const stream = v.remoteStreams.get(s.clientId);
      if (stream && stream.getAudioTracks().length) {
        const aud = document.createElement("audio");
        aud.autoplay = true;
        aud.srcObject = stream;
        aud.muted = v.deafened;
        tile.appendChild(aud);
      }
    }
    const label = createEl("div", "voice-tile-name");
    label.textContent = (s.user && s.user.username ? s.user.username : "?") + (isMe ? " (voce)" : "");
    tile.appendChild(label);
    const badges = createEl("div", "voice-tile-badges");
    if (s.audio === false) badges.appendChild(createEl("span", "voice-badge muted", "Mudo"));
    if (s.screen) badges.appendChild(createEl("span", "voice-badge", "Tela"));
    else if (s.video) badges.appendChild(createEl("span", "voice-badge", "Cam"));
    tile.appendChild(badges);
    box.appendChild(tile);
  }
  if (inChannel.length === 0 && v.channelId) {
    const empty = createEl("div", "voice-empty", "Conectando ao canal de voz...");
    box.appendChild(empty);
  }
}

function setupVoiceControls() {
  if (els.btnCall) els.btnCall.addEventListener("click", function () {
    const c = state.channelId ? findChannel(state.channelId) : null;
    if (state.voice.channelId) { leaveVoice(); return; }
    if (!c) { showToast("Selecione um canal de voz primeiro"); return; }
    if (c.type !== "voice") { showToast("Este canal nao e de voz"); return; }
    joinVoice(c.id, c.name);
  });
  if (els.btnMic) els.btnMic.addEventListener("click", toggleMute);
  if (els.btnDeafen) els.btnDeafen.addEventListener("click", toggleDeafen);
  if (els.btnCamera) els.btnCamera.addEventListener("click", toggleCamera);
  if (els.btnScreen) els.btnScreen.addEventListener("click", toggleScreen);
  if (els.btnVoiceLeave) els.btnVoiceLeave.addEventListener("click", function () { leaveVoice(); });
  document.addEventListener("keydown", function (ev) {
    if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === "m") { ev.preventDefault(); toggleMute(); }
    if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === "d") { ev.preventDefault(); toggleDeafen(); }
  });
}

function handleMemberUpdate(m) {
  if (!m) return;
  const g = findGuild(m.guildId);
  if (!g) return;
  if (!g.members) g.members = [];
  const i = g.members.findIndex(function (x) { return x.userId === m.userId; });
  if (i >= 0) g.members[i] = m;
  else g.members.push(m);
  renderMembers();
  renderMessages();
}

function handleWsMessage(ev) {
  let data;
  try { data = JSON.parse(ev.data); } catch (e) { return; }
  if (!data || !data.type) return;
  const t = data.type;
  if (t === "ready") { handleReady(data); return; }
  if (t === "users") { handleUsers(data); return; }
  if (t === "voice-state") { handleVoiceState(data); return; }
  if (t === "voice-peers") { handleVoicePeers(data); return; }
  if (t === "voice-signal") { handleVoiceSignal(data); return; }
  if (t === "history") { handleHistory(data); return; }
  if (t === "message") { handleMessageCreate(data.message || data); return; }
  if (t === "message-edited") { handleMessageUpdate(data.message || data); return; }
  if (t === "message-updated") { handleMessageUpdate(data.message || data); return; }
  if (t === "message-deleted") { handleMessageDelete(data); return; }
  if (t === "typing") { handleTyping(data); return; }
  if (t === "user-updated") { handleUserUpdated(data); return; }
  if (t === "member-updated") { handleMemberUpdate(data.member || data); return; }
  if (t === "guild-created") { handleGuildCreate(data.guild || data); return; }
  if (t === "channel-created") { handleChannelCreate(data.channel || data); return; }
  if (t === "channel-updated") { handleChannelUpdate(data.channel || data); return; }
  if (t === "channel-deleted") { handleChannelDelete(data); return; }
  if (t === "dm-opened") { handleDmCreate(data.dm || data); return; }
  if (t === "search-results") { handleSearchResults(data); return; }
  if (t === "error") { showToast(data.message || "Erro"); return; }
}function connectWs(name) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host + "/ws");
  state.ws = ws;
  ws.addEventListener("open", function () {
    send({ type: "login", username: name });
  });
  ws.addEventListener("message", handleWsMessage);
  ws.addEventListener("close", function () {
    state.ws = null;
    showToast("Desconectado. Reconectando...");
    setTimeout(function () { connectWs(name); }, 2000);
  });
  ws.addEventListener("error", function () {
    showToast("Erro de conexao");
  });
}

function setupComposer() {
  const box = els["composer-input"];
  const form = els["composer"];
  if (!box || !form) return;
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const text = box.value.trim();
    if (!text) return;
    if (state.channelId) send({ type: "message", channelId: state.channelId, content: text });
    else if (state.dmId) send({ type: "dm_message", dmId: state.dmId, content: text });
    else return;
    box.value = "";
  });
  box.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      if (form.requestSubmit) form.requestSubmit();
    }
  });
}

function setupLogin() {
  const form = els["login-form"];
  const input = els["login-name"];
  if (!form || !input) return;
  const saved = localStorage.getItem("rea-username");
  if (saved) input.value = saved;
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const name = input.value.trim();
    if (name.length < 2) { showToast("Informe um nome com 2+ caracteres"); return; }
    localStorage.setItem("rea-username", name);
    connectWs(name);
  });
}

const SPLASH_QUOTES = [
  "Aborbing the Contents",
  "Additive Parsing the Load",
  "Commence Monosaturated Goodening",
  "Kick Off the Multi-Core Widening",
  "Bastening the Game Turkey",
  "Abstracting the Rummage Disc",
  "Undecerealenizing the Process",
  "Postrefragmenting the Widget Layer",
  "Satisfying the Constraints",
  "Abnoramalzing Some of the Matrices",
  "Optimizing the People",
  "Proclaigerizing the Network"
];

function splashStatus(text) {
  const el = document.getElementById("boot-status");
  if (el) el.textContent = text;
}

function splashHide() {
  const el = document.getElementById("boot-splash");
  if (!el) return;
  el.classList.add("hide");
  setTimeout(function () { el.remove(); }, 300);
}

function splashQuote() {
  return SPLASH_QUOTES[Math.floor(Math.random() * SPLASH_QUOTES.length)];
}

function boot() {
  const video = document.getElementById("boot-video");
  if (video) video.addEventListener("loadeddata", function () { video.classList.add("loaded"); });
  splashStatus("Checking for updates...");
  setTimeout(function () { splashStatus("Connecting..."); }, 350);
  setTimeout(function () { splashStatus(splashQuote()); }, 700);
  setupLogin();
  setupComposer();
  setupVoiceControls();
  const saved = localStorage.getItem("rea-username");
  if (saved) connectWs(saved);
  else setTimeout(splashHide, 900);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
