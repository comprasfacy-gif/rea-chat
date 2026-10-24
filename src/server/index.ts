import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { getReaConfig } from "../config.js";
import { logger, setLogLevel, type LogLevel } from "../util/logger.js";
import { handleCommand } from "./commands.js";
import { ReaBridge } from "./reaBridge.js";
import { Store, type Message, type User, type Attachment, type Presence } from "./store.js";

const VERSION = "3.1.0";
const here = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(here, "..", "web");
const UPLOAD_ROOT = resolve(here, "..", "..", "data", "uploads");
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

interface Client {
  id: string;
  socket: WebSocket;
  user?: User;
  voiceChannelId?: string;
}

interface ClientMessage {
  type: string;
  username?: string;
  channelId?: string;
  content?: string;
  name?: string;
  topic?: string;
  guildId?: string;
  categoryId?: string;
  kind?: string;
  messageId?: string;
  emoji?: string;
  userId?: string;
  status?: string;
  customStatus?: string;
  avatar?: string;
  roleIds?: string[];
  roleId?: string;
  color?: string;
  nickname?: string;
  query?: string;
  channelIds?: string[];
  attachments?: Array<{ name: string; url: string; size: number; mime: string }>;
  replyTo?: string;
  nicknameTarget?: string;
  sdp?: unknown;
  targetClientId?: string;
  muted?: boolean;
  deafened?: boolean;
}

export interface ServerOptions {
  port: number;
  host: string;
  dataDir: string;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function safeJoin(root: string, relative: string): string | null {
  const target = normalize(join(root, relative));
  return target.startsWith(root) ? target : null;
}

function serveFile(res: ServerResponse, root: string, relative: string): void {
  const target = safeJoin(root, relative);
  if (!target) { res.writeHead(403).end("forbidden"); return; }
  if (!existsSync(target)) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream" });
  res.end(readFileSync(target));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) {
        rejectBody(new Error("Arquivo muito grande (max 8 MB)"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
  });
}

export async function startServer(options: ServerOptions): Promise<void> {
  const store = new Store(options.dataDir);
  const bridge = new ReaBridge(VERSION);
  const clients = new Set<Client>();
  const uploadRoot = options.dataDir ? resolve(options.dataDir, "uploads") : UPLOAD_ROOT;
  if (!existsSync(uploadRoot)) mkdirSync(uploadRoot, { recursive: true });

  setLogLevel((process.env.LOG_LEVEL as LogLevel | undefined) ?? "info");

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      try {
        if (url.pathname === "/api/health") {
          sendJson(res, 200, { ok: true, version: VERSION, tools: bridge.getCatalog().size });
          return;
        }
        if (url.pathname === "/api/tools") {
          sendJson(res, 200, bridge.listTools());
          return;
        }
        if (url.pathname === "/api/guilds") {
          sendJson(res, 200, store.listGuilds());
          return;
        }
        if (url.pathname === "/api/channels") {
          sendJson(res, 200, store.listChannels(url.searchParams.get("guildId") ?? undefined));
          return;
        }

        if (url.pathname === "/api/upload" && req.method === "POST") {
          const name = url.searchParams.get("name") ?? "arquivo";
          const mime = req.headers["content-type"] ?? "application/octet-stream";
          const body = await readBody(req);
          const safeName = name.replace(/[^\w.\-]/g, "_") || "arquivo";
          const stored = `${randomUUID()}-${safeName}`;
          writeFileSync(join(uploadRoot, stored), body);
          const attachment: Attachment = {
            id: randomUUID(), name: safeName, url: `/uploads/${stored}`,
            size: body.length, mime,
          };
          sendJson(res, 200, attachment);
          return;
        }

        if (url.pathname.startsWith("/uploads/")) {
          serveFile(res, uploadRoot, url.pathname.replace(/^\/uploads\//, ""));
          return;
        }

        serveFile(res, WEB_ROOT, url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, ""));
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_UPLOAD_BYTES });

  function send(client: Client, payload: unknown): void {
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(payload));
  }

  function broadcast(payload: unknown, exclude?: Client): void {
    for (const client of clients) if (client !== exclude) send(client, payload);
  }

  function publicUser(user: User): Record<string, unknown> {
    return {
      id: user.id, username: user.username, discriminator: user.discriminator,
      color: user.color, avatar: user.avatar, status: user.status,
      customStatus: user.customStatus, createdAt: user.createdAt,
    };
  }

  function onlineUsers(): Array<Record<string, unknown>> {
    const seen = new Map<string, User>();
    for (const client of clients) {
      if (client.user && !seen.has(client.user.id)) seen.set(client.user.id, client.user);
    }
    return [...seen.values()].map(publicUser);
  }

  function broadcastUsers(): void {
    broadcast({ type: "users", users: onlineUsers() });
  }

  function broadcastVoiceState(): void {
    const states = [...clients]
      .filter((c) => c.user && c.voiceChannelId)
      .map((c) => ({ channelId: c.voiceChannelId, user: publicUser(c.user as User), clientId: c.id }));
    broadcast({ type: "voice-state", states });
  }

  function snapshotFor(user: User): Record<string, unknown> {
    const guilds = store.listGuilds().map((guild) => ({
      ...guild,
      categories: store.listCategories(guild.id),
      channels: store.listChannels(guild.id),
      roles: store.listRoles(guild.id),
      members: store.listMembers(guild.id).map((m) => ({
        userId: m.userId, roleIds: m.roleIds, nickname: m.nickname, joinedAt: m.joinedAt,
        user: publicUser(m.user),
      })),
    }));
    const dms = store.listDmsFor(user.id).map((dm) => ({
      ...dm,
      participants: dm.participantIds
        .map((id) => store.getUser(id))
        .filter((u): u is User => u !== undefined)
        .map(publicUser),
    }));
    return { guilds, dms, users: store.listUsers().map(publicUser) };
  }

  async function postBotReply(channelId: string, content: string, meta?: Record<string, unknown>): Promise<void> {
    const bot = store.getUser("rea-bot") ?? store.login("REA");
    const message = store.addMessage({
      channelId, authorId: bot.id, authorName: "REA", authorColor: "#eb459e",
      authorAvatar: null, content, bot: true,
    });
    broadcast({ type: "message", message, meta });
  }

  wss.on("connection", (socket: WebSocket) => {
    const client: Client = { id: randomUUID(), socket };
    clients.add(client);

    socket.on("message", (data) => {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        send(client, { type: "error", message: "JSON invalido" });
        return;
      }

      void (async () => {
        try {
          switch (parsed.type) {
            case "login": {
              const username = (parsed.username ?? "").trim();
              if (username.length < 2 || username.length > 32) {
                send(client, { type: "error", message: "Nome deve ter entre 2 e 32 caracteres" });
                return;
              }
              const user = store.login(username);
              client.user = user;
              send(client, {
                type: "ready",
                user: publicUser(user),
                ...snapshotFor(user),
                toolCount: bridge.getCatalog().size,
              });
              broadcastUsers();
              return;
            }

            case "join": {
              if (!client.user || !parsed.channelId) return;
              const channel = store.getChannel(parsed.channelId);
              if (!channel) { send(client, { type: "error", message: "Canal nao encontrado" }); return; }
              send(client, { type: "history", channelId: channel.id, messages: store.listMessages(channel.id, 120) });
              return;
            }

            case "message": {
              if (!client.user || !parsed.channelId) return;
              const content = (parsed.content ?? "").trim();
              const attachments = (parsed.attachments ?? []).map((a) => ({ ...a, id: randomUUID() }));
              if (content.length === 0 && attachments.length === 0) return;
              if (content.length > 8_000) { send(client, { type: "error", message: "Mensagem muito longa" }); return; }
              if (!store.getChannel(parsed.channelId)) return;

              const message = store.addMessage({
                channelId: parsed.channelId, authorId: client.user.id,
                authorName: client.user.username, authorColor: client.user.color,
                authorAvatar: client.user.avatar, content,
                replyTo: parsed.replyTo ?? null, attachments,
              });
              broadcast({ type: "message", message });

              if (content.startsWith("/")) {
                broadcast({ type: "typing", channelId: parsed.channelId, user: "REA" });
                const outcome = await handleCommand({ bridge, channelId: parsed.channelId }, content);
                await postBotReply(parsed.channelId, outcome.reply, outcome.meta as Record<string, unknown> | undefined);
              }
              return;
            }

            case "edit-message": {
              if (!client.user || !parsed.messageId) return;
              const content = (parsed.content ?? "").trim();
              if (!content) return;
              const message = store.editMessage(parsed.messageId, client.user.id, content);
              if (!message) { send(client, { type: "error", message: "Nao foi possivel editar" }); return; }
              broadcast({ type: "message-edited", message });
              return;
            }

            case "delete-message": {
              if (!client.user || !parsed.messageId) return;
              const existing = store.getMessage(parsed.messageId);
              if (!existing) return;
              const channel = store.getChannel(existing.channelId);
              const canManage = store.canManageMessages(channel?.guildId ?? null, client.user.id);
              const removed = store.deleteMessage(parsed.messageId, client.user.id, canManage);
              if (!removed) { send(client, { type: "error", message: "Sem permissao para apagar" }); return; }
              broadcast({ type: "message-deleted", messageId: removed.id, channelId: removed.channelId });
              return;
            }

            case "reaction": {
              if (!client.user || !parsed.messageId || !parsed.emoji) return;
              const message = store.toggleReaction(parsed.messageId, client.user.id, parsed.emoji);
              if (!message) return;
              broadcast({ type: "message-updated", message });
              return;
            }

            case "typing": {
              if (!client.user || !parsed.channelId) return;
              broadcast({ type: "typing", channelId: parsed.channelId, user: client.user.username }, client);
              return;
            }

            case "status": {
              if (!client.user) return;
              const status = parsed.status as Presence | undefined;
              const patch: Record<string, unknown> = {};
              if (status) patch.status = status;
              if (parsed.customStatus !== undefined) patch.customStatus = parsed.customStatus;
              const updated = store.updateUser(client.user.id, patch as Parameters<typeof store.updateUser>[1]);
              if (!updated) return;
              client.user = updated;
              broadcast({ type: "user-updated", user: publicUser(updated) });
              broadcastUsers();
              return;
            }

            case "profile": {
              if (!client.user) return;
              const updated = store.updateUser(client.user.id, {
                avatar: parsed.avatar ?? client.user.avatar,
                color: parsed.color ?? client.user.color,
              });
              if (!updated) return;
              client.user = updated;
              broadcast({ type: "user-updated", user: publicUser(updated) });
              broadcastUsers();
              return;
            }

            case "create-channel": {
              if (!client.user) return;
              const guildId = parsed.guildId ?? store.listGuilds()[0]?.id;
              if (!guildId) return;
              const name = (parsed.name ?? "").trim();
              if (!name) { send(client, { type: "error", message: "Informe o nome do canal" }); return; }
              const channel = store.createChannel({
                guildId, name, topic: parsed.topic ?? "",
                kind: parsed.kind === "voice" ? "voice" : "text",
                categoryId: parsed.categoryId ?? null,
              });
              broadcast({ type: "channel-created", channel });
              return;
            }

            case "delete-channel": {
              if (!client.user || !parsed.channelId) return;
              if (!store.deleteChannel(parsed.channelId)) return;
              broadcast({ type: "channel-deleted", channelId: parsed.channelId });
              return;
            }

            case "update-channel": {
              if (!client.user || !parsed.channelId) return;
              const patch: Record<string, unknown> = {};
              if (parsed.name !== undefined) patch.name = parsed.name;
              if (parsed.topic !== undefined) patch.topic = parsed.topic;
              const channel = store.updateChannel(parsed.channelId, patch as Parameters<typeof store.updateChannel>[1]);
              if (!channel) return;
              broadcast({ type: "channel-updated", channel });
              return;
            }

            case "create-category": {
              if (!client.user || !parsed.guildId || !parsed.name) return;
              const category = store.createCategory(parsed.guildId, parsed.name);
              broadcast({ type: "category-created", category });
              return;
            }

            case "create-guild": {
              if (!client.user) return;
              const name = (parsed.name ?? "").trim();
              if (!name) return;
              const guild = store.createGuild(name, client.user.id);
              broadcast({ type: "guild-created", guild: { ...guild, categories: store.listCategories(guild.id), channels: store.listChannels(guild.id), roles: store.listRoles(guild.id), members: [] } });
              return;
            }

            case "create-role": {
              if (!client.user || !parsed.guildId || !parsed.name) return;
              const role = store.createRole(parsed.guildId, parsed.name, parsed.color);
              broadcast({ type: "role-created", role });
              return;
            }

            case "delete-role": {
              if (!client.user || !parsed.roleId) return;
              if (!store.deleteRole(parsed.roleId)) return;
              broadcast({ type: "role-deleted", roleId: parsed.roleId });
              return;
            }

            case "set-member-roles": {
              if (!client.user || !parsed.guildId || !parsed.userId) return;
              const member = store.setMemberRoles(parsed.guildId, parsed.userId, parsed.roleIds ?? []);
              if (!member) return;
              broadcast({ type: "member-updated", member });
              return;
            }

            case "set-nickname": {
              if (!client.user || !parsed.guildId) return;
              const target = parsed.userId ?? client.user.id;
              const member = store.setNickname(parsed.guildId, target, parsed.nickname ?? null);
              if (!member) return;
              broadcast({ type: "member-updated", member });
              return;
            }

            case "search": {
              if (!client.user) return;
              const results = store.searchMessages(parsed.query ?? "", parsed.channelIds ?? store.listChannels().map((c) => c.id));
              send(client, { type: "search-results", query: parsed.query ?? "", results });
              return;
            }

            case "open-dm": {
              if (!client.user || !parsed.userId) return;
              const dm = store.openDm(client.user.id, parsed.userId);
              const participants = dm.participantIds.map((id) => store.getUser(id)).filter((u): u is User => u !== undefined).map(publicUser);
              send(client, { type: "dm-opened", dm: { ...dm, participants } });
              return;
            }

            case "voice-join": {
              if (!client.user || !parsed.channelId) return;
              const channel = store.getChannel(parsed.channelId);
              if (!channel || channel.kind !== "voice") { send(client, { type: "error", message: "Canal de voz invalido" }); return; }
              client.voiceChannelId = channel.id;
              broadcastVoiceState();
              return;
            }

            case "voice-leave": {
              client.voiceChannelId = undefined;
              broadcastVoiceState();
              return;
            }

            case "voice-signal": {
              if (!client.user || !parsed.targetClientId) return;
              const target = [...clients].find((c) => c.id === parsed.targetClientId);
              if (!target) return;
              send(target, {
                type: "voice-signal", fromClientId: client.id,
                fromUser: publicUser(client.user), sdp: parsed.sdp,
              });
              return;
            }

            default:
              send(client, { type: "error", message: `Tipo desconhecido: ${parsed.type}` });
          }
        } catch (error) {
          logger.error("Falha ao processar mensagem do cliente", { error: error instanceof Error ? error.message : String(error) });
          send(client, { type: "error", message: error instanceof Error ? error.message : String(error) });
        }
      })();
    });

    socket.on("close", () => {
      clients.delete(client);
      broadcastUsers();
      broadcastVoiceState();
    });

    socket.on("error", () => clients.delete(client));
  });

  await new Promise<void>((res) => server.listen(options.port, options.host, res));
  logger.info(`Servidor em http://${options.host}:${options.port}`);

  const config = getReaConfig();
  logger.info(`REA: ${config.command} ${config.args.join(" ")}`);

  void bridge
    .warmup()
    .then((count) => logger.info(`REA pronto: ${count} ferramentas`))
    .catch((error: unknown) => logger.warn(`REA indisponivel no boot: ${String(error)}`));

  const shutdown = async (): Promise<void> => {
    logger.info("Encerrando...");
    wss.close();
    server.close();
    await bridge.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

export type { Message, User };
