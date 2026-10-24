import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type Presence = "online" | "idle" | "dnd" | "invisible";

export interface User {
  id: string;
  username: string;
  discriminator: string;
  color: string;
  avatar: string | null;
  status: Presence;
  customStatus: string;
  createdAt: number;
}

export interface Role {
  id: string;
  guildId: string;
  name: string;
  color: string;
  position: number;
  permissions: { manageGuild: boolean; manageChannels: boolean; manageRoles: boolean; manageMessages: boolean; kickMembers: boolean };
}

export interface Category {
  id: string;
  guildId: string;
  name: string;
  position: number;
}

export type ChannelKind = "text" | "voice";

export interface Channel {
  id: string;
  guildId: string | null;
  categoryId: string | null;
  kind: ChannelKind;
  name: string;
  topic: string;
  position: number;
  createdAt: number;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  createdAt: number;
}

export interface Member {
  guildId: string;
  userId: string;
  roleIds: string[];
  nickname: string | null;
  joinedAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  size: number;
  mime: string;
  width?: number;
  height?: number;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  authorAvatar: string | null;
  content: string;
  bot: boolean;
  system: boolean;
  replyTo: string | null;
  attachments: Attachment[];
  reactions: Reaction[];
  editedAt: number | null;
  createdAt: number;
}

export interface DmThread {
  id: string;
  participantIds: string[];
  createdAt: number;
}

interface PersistedState {
  users: User[];
  guilds: Guild[];
  categories: Category[];
  channels: Channel[];
  roles: Role[];
  members: Member[];
  messages: Message[];
  dms: DmThread[];
}

const COLORS = ["#5865f2","#3ba55d","#faa81a","#ed4245","#eb459e","#00a8fc","#9b59b6","#1abc9c"];
const ROLE_COLORS = ["#5865f2","#3ba55d","#faa81a","#ed4245","#eb459e","#00a8fc","#9b59b6","#1abc9c","#f47fff","#fee75c"];
const MAX_MESSAGES = 4000;
const BOT_ID = "rea-bot";

export class Store {
  private users = new Map<string, User>();
  private usersByName = new Map<string, User>();
  private guilds = new Map<string, Guild>();
  private categories = new Map<string, Category>();
  private channels = new Map<string, Channel>();
  private roles = new Map<string, Role>();
  private members: Member[] = [];
  private messages: Message[] = [];
  private dms = new Map<string, DmThread>();
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "state.json");
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.load();
  }

  private load(): void {
    if (existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedState;
        for (const u of raw.users ?? []) { this.users.set(u.id, u); this.usersByName.set(u.username.toLowerCase(), u); }
        for (const g of raw.guilds ?? []) this.guilds.set(g.id, g);
        for (const c of raw.categories ?? []) this.categories.set(c.id, c);
        for (const c of raw.channels ?? []) this.channels.set(c.id, c);
        for (const r of raw.roles ?? []) this.roles.set(r.id, r);
        for (const d of raw.dms ?? []) this.dms.set(d.id, d);
        this.members = raw.members ?? [];
        this.messages = (raw.messages ?? []).map((m) => ({
          ...m,
          reactions: m.reactions ?? [],
          attachments: m.attachments ?? [],
          replyTo: m.replyTo ?? null,
          editedAt: m.editedAt ?? null,
          system: m.system ?? false,
          authorAvatar: m.authorAvatar ?? null,
        }));
      } catch { /* corrupted state is discarded */ }
    }
    if (this.guilds.size === 0) this.seed();
  }

  private seed(): void {
    const now = Date.now();
    const guild: Guild = { id: randomUUID(), name: "REA Server", icon: null, ownerId: BOT_ID, createdAt: now };
    this.guilds.set(guild.id, guild);

    const makeRole = (name: string, color: string, position: number, perms: Partial<Role["permissions"]> = {}): Role => {
      const role: Role = { id: randomUUID(), guildId: guild.id, name, color, position,
        permissions: { manageGuild: false, manageChannels: false, manageRoles: false, manageMessages: false, kickMembers: false, ...perms } };
      this.roles.set(role.id, role);
      return role;
    };
    makeRole("@everyone", "#99aab5", 0);
    makeRole("Admin", "#ed4245", 3, { manageGuild: true, manageChannels: true, manageRoles: true, manageMessages: true, kickMembers: true });
    makeRole("Moderador", "#3ba55d", 2, { manageMessages: true, kickMembers: true });

    const catText: Category = { id: randomUUID(), guildId: guild.id, name: "TEXTO", position: 0 };
    const catRea: Category = { id: randomUUID(), guildId: guild.id, name: "REA", position: 1 };
    const catVoice: Category = { id: randomUUID(), guildId: guild.id, name: "VOZ", position: 2 };
    for (const c of [catText, catRea, catVoice]) this.categories.set(c.id, c);

    const mk = (name: string, topic: string, categoryId: string, kind: ChannelKind, position: number): Channel => {
      const ch: Channel = { id: randomUUID(), guildId: guild.id, categoryId, kind, name, topic, position, createdAt: now };
      this.channels.set(ch.id, ch);
      return ch;
    };
    mk("geral", "Conversa geral", catText.id, "text", 0);
    mk("avisos", "Anuncios importantes", catText.id, "text", 1);
    mk("rea", "Comandos do REA - use /help", catRea.id, "text", 0);
    mk("resultados", "Saidas longas das ferramentas", catRea.id, "text", 1);
    mk("Lobby", "", catVoice.id, "voice", 0);
    mk("Sala REA", "", catVoice.id, "voice", 1);
    this.persist();
  }

  private persist(): void {
    const state: PersistedState = {
      users: [...this.users.values()],
      guilds: [...this.guilds.values()],
      categories: [...this.categories.values()],
      channels: [...this.channels.values()],
      roles: [...this.roles.values()],
      members: this.members,
      messages: this.messages.slice(-MAX_MESSAGES),
      dms: [...this.dms.values()],
    };
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  login(username: string): User {
    const key = username.trim().toLowerCase();
    const existing = this.usersByName.get(key);
    if (existing) return existing;
    const user: User = {
      id: randomUUID(), username: username.trim(),
      discriminator: String(Math.floor(1000 + Math.random() * 9000)),
      color: COLORS[this.users.size % COLORS.length] ?? "#5865f2",
      avatar: null, status: "online", customStatus: "", createdAt: Date.now(),
    };
    this.users.set(user.id, user);
    this.usersByName.set(key, user);
    const everyone = [...this.roles.values()].find((r) => r.name === "@everyone");
    for (const guild of this.guilds.values()) {
      this.members.push({ guildId: guild.id, userId: user.id, roleIds: everyone ? [everyone.id] : [], nickname: null, joinedAt: Date.now() });
    }
    this.persist();
    return user;
  }

  getUser(id: string): User | undefined { return this.users.get(id); }
  listUsers(): User[] { return [...this.users.values()].sort((a, b) => a.username.localeCompare(b.username)); }
  findUserByName(name: string): User | undefined { return this.usersByName.get(name.trim().toLowerCase().replace(/^@/, "")); }

  updateUser(id: string, patch: Partial<Pick<User, "avatar" | "status" | "customStatus" | "color">>): User | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    Object.assign(user, patch);
    this.persist();
    return user;
  }

  listGuilds(): Guild[] { return [...this.guilds.values()].sort((a, b) => a.createdAt - b.createdAt); }
  getGuild(id: string): Guild | undefined { return this.guilds.get(id); }

  createGuild(name: string, ownerId: string): Guild {
    const guild: Guild = { id: randomUUID(), name: name.trim(), icon: null, ownerId, createdAt: Date.now() };
    this.guilds.set(guild.id, guild);
    const everyone: Role = { id: randomUUID(), guildId: guild.id, name: "@everyone", color: "#99aab5", position: 0,
      permissions: { manageGuild: false, manageChannels: false, manageRoles: false, manageMessages: false, kickMembers: false } };
    this.roles.set(everyone.id, everyone);
    const cat: Category = { id: randomUUID(), guildId: guild.id, name: "TEXTO", position: 0 };
    this.categories.set(cat.id, cat);
    const general: Channel = { id: randomUUID(), guildId: guild.id, categoryId: cat.id, kind: "text", name: "geral", topic: "", position: 0, createdAt: Date.now() };
    this.channels.set(general.id, general);
    for (const user of this.users.values()) {
      this.members.push({ guildId: guild.id, userId: user.id, roleIds: [everyone.id], nickname: null, joinedAt: Date.now() });
    }
    this.persist();
    return guild;
  }

  listCategories(guildId: string): Category[] {
    return [...this.categories.values()].filter((c) => c.guildId === guildId).sort((a, b) => a.position - b.position);
  }

  createCategory(guildId: string, name: string): Category {
    const existing = this.listCategories(guildId);
    const cat: Category = { id: randomUUID(), guildId, name: name.trim().toUpperCase(), position: existing.length };
    this.categories.set(cat.id, cat);
    this.persist();
    return cat;
  }

  listChannels(guildId?: string): Channel[] {
    const all = [...this.channels.values()];
    const filtered = guildId === undefined ? all : all.filter((c) => c.guildId === guildId);
    return filtered.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  }

  getChannel(id: string): Channel | undefined { return this.channels.get(id); }
  findChannelByName(name: string, guildId?: string): Channel | undefined {
    const key = name.trim().toLowerCase().replace(/^#/, "");
    return this.listChannels(guildId).find((c) => c.name.toLowerCase() === key);
  }

  createChannel(input: { guildId: string; name: string; topic?: string; kind?: ChannelKind; categoryId?: string | null }): Channel {
    const slug = input.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "canal";
    const siblings = this.listChannels(input.guildId);
    const channel: Channel = {
      id: randomUUID(), guildId: input.guildId, categoryId: input.categoryId ?? null,
      kind: input.kind ?? "text", name: slug, topic: (input.topic ?? "").trim(),
      position: siblings.length, createdAt: Date.now(),
    };
    this.channels.set(channel.id, channel);
    this.persist();
    return channel;
  }

  deleteChannel(id: string): boolean {
    if (!this.channels.delete(id)) return false;
    this.messages = this.messages.filter((m) => m.channelId !== id);
    this.persist();
    return true;
  }

  updateChannel(id: string, patch: Partial<Pick<Channel, "name" | "topic" | "categoryId" | "position">>): Channel | undefined {
    const channel = this.channels.get(id);
    if (!channel) return undefined;
    Object.assign(channel, patch);
    this.persist();
    return channel;
  }

  listRoles(guildId: string): Role[] {
    return [...this.roles.values()].filter((r) => r.guildId === guildId).sort((a, b) => b.position - a.position);
  }

  createRole(guildId: string, name: string, color?: string): Role {
    const siblings = this.listRoles(guildId);
    const role: Role = {
      id: randomUUID(), guildId, name: name.trim(),
      color: color ?? ROLE_COLORS[siblings.length % ROLE_COLORS.length] ?? "#5865f2",
      position: siblings.length,
      permissions: { manageGuild: false, manageChannels: false, manageRoles: false, manageMessages: false, kickMembers: false },
    };
    this.roles.set(role.id, role);
    this.persist();
    return role;
  }

  deleteRole(id: string): boolean {
    const role = this.roles.get(id);
    if (!role || role.name === "@everyone") return false;
    this.roles.delete(id);
    for (const m of this.members) m.roleIds = m.roleIds.filter((r) => r !== id);
    this.persist();
    return true;
  }

  listMembers(guildId: string): Array<Member & { user: User }> {
    return this.members
      .filter((m) => m.guildId === guildId)
      .map((m) => ({ ...m, user: this.users.get(m.userId) }))
      .filter((m): m is Member & { user: User } => m.user !== undefined);
  }

  getMember(guildId: string, userId: string): Member | undefined {
    return this.members.find((m) => m.guildId === guildId && m.userId === userId);
  }

  setMemberRoles(guildId: string, userId: string, roleIds: string[]): Member | undefined {
    const member = this.getMember(guildId, userId);
    if (!member) return undefined;
    member.roleIds = roleIds;
    this.persist();
    return member;
  }

  setNickname(guildId: string, userId: string, nickname: string | null): Member | undefined {
    const member = this.getMember(guildId, userId);
    if (!member) return undefined;
    member.nickname = nickname;
    this.persist();
    return member;
  }

  listMessages(channelId: string, limit = 100): Message[] {
    return this.messages.filter((m) => m.channelId === channelId).slice(-limit);
  }

  getMessage(id: string): Message | undefined { return this.messages.find((m) => m.id === id); }

  searchMessages(query: string, channelIds: string[], limit = 50): Message[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const allowed = new Set(channelIds);
    return this.messages
      .filter((m) => allowed.has(m.channelId) && m.content.toLowerCase().includes(needle))
      .slice(-limit)
      .reverse();
  }

  addMessage(input: {
    channelId: string; authorId: string; authorName: string; authorColor: string;
    authorAvatar?: string | null; content: string; bot?: boolean; system?: boolean;
    replyTo?: string | null; attachments?: Attachment[];
  }): Message {
    const message: Message = {
      id: randomUUID(), channelId: input.channelId, authorId: input.authorId,
      authorName: input.authorName, authorColor: input.authorColor,
      authorAvatar: input.authorAvatar ?? null, content: input.content,
      bot: input.bot === true, system: input.system === true,
      replyTo: input.replyTo ?? null, attachments: input.attachments ?? [],
      reactions: [], editedAt: null, createdAt: Date.now(),
    };
    this.messages.push(message);
    if (this.messages.length > MAX_MESSAGES * 2) this.messages = this.messages.slice(-MAX_MESSAGES);
    this.persist();
    return message;
  }

  editMessage(id: string, authorId: string, content: string): Message | undefined {
    const message = this.messages.find((m) => m.id === id);
    if (!message || message.authorId !== authorId) return undefined;
    message.content = content;
    message.editedAt = Date.now();
    this.persist();
    return message;
  }

  deleteMessage(id: string, actorId: string, canManage: boolean): Message | undefined {
    const index = this.messages.findIndex((m) => m.id === id);
    if (index < 0) return undefined;
    const message = this.messages[index];
    if (!message) return undefined;
    if (message.authorId !== actorId && !canManage) return undefined;
    this.messages.splice(index, 1);
    this.persist();
    return message;
  }

  toggleReaction(messageId: string, userId: string, emoji: string): Message | undefined {
    const message = this.messages.find((m) => m.id === messageId);
    if (!message) return undefined;
    let reaction = message.reactions.find((r) => r.emoji === emoji);
    if (!reaction) {
      reaction = { emoji, userIds: [] };
      message.reactions.push(reaction);
    }
    const index = reaction.userIds.indexOf(userId);
    if (index >= 0) reaction.userIds.splice(index, 1);
    else reaction.userIds.push(userId);
    message.reactions = message.reactions.filter((r) => r.userIds.length > 0);
    this.persist();
    return message;
  }

  listDmsFor(userId: string): DmThread[] {
    return [...this.dms.values()].filter((d) => d.participantIds.includes(userId));
  }

  getDm(id: string): DmThread | undefined { return this.dms.get(id); }

  openDm(a: string, b: string): DmThread {
    const existing = [...this.dms.values()].find(
      (d) => d.participantIds.length === 2 && d.participantIds.includes(a) && d.participantIds.includes(b),
    );
    if (existing) return existing;
    const dm: DmThread = { id: randomUUID(), participantIds: [a, b], createdAt: Date.now() };
    this.dms.set(dm.id, dm);
    this.persist();
    return dm;
  }

  canManageMessages(guildId: string | null, userId: string): boolean {
    if (!guildId) return false;
    const member = this.getMember(guildId, userId);
    if (!member) return false;
    return member.roleIds.some((id) => {
      const role = this.roles.get(id);
      return role?.permissions.manageMessages === true;
    });
  }
}
