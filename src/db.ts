import { Database } from "bun:sqlite";
import type { CodexReasoningEffort } from "./codex-runtime";

export type ContextKind = "repo" | "host" | "scratch";
export type ContextState = "active" | "pending" | "archived" | "error";

export interface ContextRecord {
  slug: string;
  telegramChatId: number | null;
  telegramThreadId: number | null;
  machine: string;
  kind: ContextKind;
  state: ContextState;
  transport: string;
  target: string;
  rootPath: string;
  worktreePath: string;
  branchName: string | null;
  baseBranch: string | null;
  latestRunLogPath: string | null;
  lastSummary: string | null;
  lastArtifacts: string | null;
  codexSessionId: string | null;
  lastRunAt: string | null;
  usageAdapter: string;
  modelOverride: string | null;
  reasoningEffortOverride: CodexReasoningEffort | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerRecord {
  host: string;
  transport: string;
  status: string;
  reachable: boolean;
  localExecution: boolean;
  sshTarget: string | null;
  sshUser: string | null;
  lastCheckedAt: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  details: string | null;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function legacyStatusToState(status: string | null | undefined): ContextState {
  switch (status) {
    case "worker-unreachable":
    case "bootstrapping":
      return "pending";
    case "error":
      return "error";
    case "archived":
      return "archived";
    default:
      return "active";
  }
}

function readNullableString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return String(row[key]);
    }
  }

  return null;
}

function readNullableNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return Number(row[key]);
    }
  }

  return null;
}

function rowToContext(row: Record<string, unknown>): ContextRecord {
  const legacyStatus = readNullableString(row, "status");
  return {
    slug: String(row.slug),
    telegramChatId: readNullableNumber(row, "telegram_chat_id"),
    telegramThreadId: readNullableNumber(row, "telegram_thread_id"),
    machine: readNullableString(row, "machine", "worker_host") || "unknown",
    kind: (readNullableString(row, "kind") || "repo") as ContextKind,
    state: (readNullableString(row, "state") || legacyStatusToState(legacyStatus)) as ContextState,
    transport: readNullableString(row, "transport") || "",
    target: readNullableString(row, "target", "repo_root") || "",
    rootPath: readNullableString(row, "root_path", "repo_root") || "",
    worktreePath: readNullableString(row, "worktree_path", "repo_root") || "",
    branchName: readNullableString(row, "branch_name"),
    baseBranch: readNullableString(row, "base_branch"),
    latestRunLogPath: readNullableString(row, "latest_run_log_path"),
    lastSummary: readNullableString(row, "last_summary", "latest_summary_snippet"),
    lastArtifacts: readNullableString(row, "last_artifacts", "latest_artifacts_snippet"),
    codexSessionId: readNullableString(row, "codex_session_id", "codex_thread_id"),
    lastRunAt: readNullableString(row, "last_run_at"),
    usageAdapter: readNullableString(row, "usage_adapter") || "manual",
    modelOverride: readNullableString(row, "codex_model_override"),
    reasoningEffortOverride: (readNullableString(row, "codex_reasoning_effort") as CodexReasoningEffort | null) || null,
    lastError: readNullableString(row, "last_error"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function rowToWorker(row: Record<string, unknown>): WorkerRecord {
  const transport = readNullableString(row, "transport") || "";
  return {
    host: String(row.host),
    transport,
    status: String(row.status ?? "unknown"),
    reachable: Boolean(Number(row.reachable ?? (row.status === "healthy" ? 1 : 0))),
    localExecution: Boolean(Number(row.local_execution ?? (transport === "local" ? 1 : 0))),
    sshTarget: readNullableString(row, "ssh_target"),
    sshUser: readNullableString(row, "ssh_user"),
    lastCheckedAt: readNullableString(row, "last_checked_at"),
    lastSeenAt: readNullableString(row, "last_seen_at", "last_checked_at"),
    lastError: readNullableString(row, "last_error"),
    details: readNullableString(row, "details"),
    updatedAt: String(row.updated_at)
  };
}

export class FactoryDb {
  private readonly db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.init();
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    if (this.hasColumn(table, column)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }

  private init(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS contexts (
        slug TEXT PRIMARY KEY,
        telegram_chat_id INTEGER,
        telegram_thread_id INTEGER,
        machine TEXT,
        kind TEXT NOT NULL DEFAULT 'repo',
        state TEXT NOT NULL DEFAULT 'active',
        transport TEXT NOT NULL DEFAULT '',
        target TEXT NOT NULL DEFAULT '',
        root_path TEXT NOT NULL DEFAULT '',
        worktree_path TEXT NOT NULL DEFAULT '',
        branch_name TEXT,
        base_branch TEXT,
        latest_run_log_path TEXT,
        last_summary TEXT,
        last_artifacts TEXT,
        codex_session_id TEXT,
        last_run_at TEXT,
        usage_adapter TEXT NOT NULL DEFAULT 'manual',
        codex_model_override TEXT,
        codex_reasoning_effort TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        worker_host TEXT,
        repo_root TEXT,
        status TEXT,
        latest_summary_snippet TEXT,
        latest_artifacts_snippet TEXT,
        codex_thread_id TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS contexts_topic_unique
      ON contexts(telegram_chat_id, COALESCE(telegram_thread_id, -1))
      WHERE telegram_chat_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS workers (
        host TEXT PRIMARY KEY,
        transport TEXT NOT NULL,
        status TEXT NOT NULL,
        reachable INTEGER NOT NULL DEFAULT 0,
        local_execution INTEGER NOT NULL DEFAULT 0,
        ssh_target TEXT,
        ssh_user TEXT,
        last_checked_at TEXT,
        last_seen_at TEXT,
        last_error TEXT,
        details TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.ensureColumn("contexts", "machine", "machine TEXT");
    this.ensureColumn("contexts", "kind", "kind TEXT NOT NULL DEFAULT 'repo'");
    this.ensureColumn("contexts", "state", "state TEXT NOT NULL DEFAULT 'active'");
    this.ensureColumn("contexts", "transport", "transport TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("contexts", "target", "target TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("contexts", "root_path", "root_path TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("contexts", "base_branch", "base_branch TEXT");
    this.ensureColumn("contexts", "last_summary", "last_summary TEXT");
    this.ensureColumn("contexts", "last_artifacts", "last_artifacts TEXT");
    this.ensureColumn("contexts", "codex_session_id", "codex_session_id TEXT");
    this.ensureColumn("contexts", "last_run_at", "last_run_at TEXT");
    this.ensureColumn("contexts", "codex_model_override", "codex_model_override TEXT");
    this.ensureColumn("contexts", "codex_reasoning_effort", "codex_reasoning_effort TEXT");

    this.ensureColumn("workers", "reachable", "reachable INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("workers", "local_execution", "local_execution INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("workers", "ssh_target", "ssh_target TEXT");
    this.ensureColumn("workers", "ssh_user", "ssh_user TEXT");
    this.ensureColumn("workers", "last_seen_at", "last_seen_at TEXT");
  }

  saveContext(context: ContextRecord): ContextRecord {
    const updated = {
      ...context,
      createdAt: context.createdAt || nowIso(),
      updatedAt: context.updatedAt || nowIso()
    };

    this.db
      .query(`
        INSERT INTO contexts (
          slug, telegram_chat_id, telegram_thread_id, machine, kind, state, transport, target, root_path,
          worktree_path, branch_name, base_branch, latest_run_log_path, last_summary, last_artifacts,
          codex_session_id, last_run_at, usage_adapter, codex_model_override, codex_reasoning_effort,
          last_error, created_at, updated_at,
          worker_host, repo_root, status, latest_summary_snippet, latest_artifacts_snippet, codex_thread_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          telegram_chat_id = excluded.telegram_chat_id,
          telegram_thread_id = excluded.telegram_thread_id,
          machine = excluded.machine,
          kind = excluded.kind,
          state = excluded.state,
          transport = excluded.transport,
          target = excluded.target,
          root_path = excluded.root_path,
          worktree_path = excluded.worktree_path,
          branch_name = excluded.branch_name,
          base_branch = excluded.base_branch,
          latest_run_log_path = excluded.latest_run_log_path,
          last_summary = excluded.last_summary,
          last_artifacts = excluded.last_artifacts,
          codex_session_id = excluded.codex_session_id,
          last_run_at = excluded.last_run_at,
          usage_adapter = excluded.usage_adapter,
          codex_model_override = excluded.codex_model_override,
          codex_reasoning_effort = excluded.codex_reasoning_effort,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at,
          worker_host = excluded.worker_host,
          repo_root = excluded.repo_root,
          status = excluded.status,
          latest_summary_snippet = excluded.latest_summary_snippet,
          latest_artifacts_snippet = excluded.latest_artifacts_snippet,
          codex_thread_id = excluded.codex_thread_id
      `)
      .run(
        updated.slug,
        updated.telegramChatId,
        updated.telegramThreadId,
        updated.machine,
        updated.kind,
        updated.state,
        updated.transport,
        updated.target,
        updated.rootPath,
        updated.worktreePath,
        updated.branchName,
        updated.baseBranch,
        updated.latestRunLogPath,
        updated.lastSummary,
        updated.lastArtifacts,
        updated.codexSessionId,
        updated.lastRunAt,
        updated.usageAdapter,
        updated.modelOverride,
        updated.reasoningEffortOverride,
        updated.lastError,
        updated.createdAt,
        updated.updatedAt,
        updated.machine,
        updated.rootPath,
        updated.state,
        updated.lastSummary,
        updated.lastArtifacts,
        updated.codexSessionId
      );

    return updated;
  }

  getContextBySlug(slug: string): ContextRecord | null {
    const row = this.db.query("SELECT * FROM contexts WHERE slug = ?").get(slug) as Record<string, unknown> | null;
    return row ? rowToContext(row) : null;
  }

  getContextByTopic(chatId: number, threadId: number | null): ContextRecord | null {
    const row = this.db
      .query(
        "SELECT * FROM contexts WHERE telegram_chat_id = ? AND COALESCE(telegram_thread_id, -1) = COALESCE(?, -1)"
      )
      .get(chatId, threadId) as Record<string, unknown> | null;
    return row ? rowToContext(row) : null;
  }

  listContexts(): ContextRecord[] {
    const rows = this.db.query("SELECT * FROM contexts ORDER BY updated_at DESC, slug ASC").all() as Record<
      string,
      unknown
    >[];
    return rows.map(rowToContext);
  }

  bindContextToTopic(slug: string, chatId: number, threadId: number | null): ContextRecord | null {
    const updatedAt = nowIso();

    this.db.exec("BEGIN IMMEDIATE");

    try {
      this.db
        .query(
          "UPDATE contexts SET telegram_chat_id = NULL, telegram_thread_id = NULL, updated_at = ? WHERE telegram_chat_id = ? AND COALESCE(telegram_thread_id, -1) = COALESCE(?, -1)"
        )
        .run(updatedAt, chatId, threadId);

      this.db
        .query("UPDATE contexts SET telegram_chat_id = ?, telegram_thread_id = ?, updated_at = ? WHERE slug = ?")
        .run(chatId, threadId, updatedAt, slug);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getContextBySlug(slug);
  }

  detachTopic(chatId: number, threadId: number | null): void {
    this.db
      .query(
        "UPDATE contexts SET telegram_chat_id = NULL, telegram_thread_id = NULL, updated_at = ? WHERE telegram_chat_id = ? AND COALESCE(telegram_thread_id, -1) = COALESCE(?, -1)"
      )
      .run(nowIso(), chatId, threadId);
  }

  saveWorker(worker: WorkerRecord): WorkerRecord {
    const updated = {
      ...worker,
      updatedAt: worker.updatedAt || nowIso()
    };

    this.db
      .query(`
        INSERT INTO workers (
          host, transport, status, reachable, local_execution, ssh_target, ssh_user,
          last_checked_at, last_seen_at, last_error, details, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(host) DO UPDATE SET
          transport = excluded.transport,
          status = excluded.status,
          reachable = excluded.reachable,
          local_execution = excluded.local_execution,
          ssh_target = excluded.ssh_target,
          ssh_user = excluded.ssh_user,
          last_checked_at = excluded.last_checked_at,
          last_seen_at = excluded.last_seen_at,
          last_error = excluded.last_error,
          details = excluded.details,
          updated_at = excluded.updated_at
      `)
      .run(
        updated.host,
        updated.transport,
        updated.status,
        updated.reachable ? 1 : 0,
        updated.localExecution ? 1 : 0,
        updated.sshTarget,
        updated.sshUser,
        updated.lastCheckedAt,
        updated.lastSeenAt,
        updated.lastError,
        updated.details,
        updated.updatedAt
      );

    return updated;
  }

  getWorker(host: string): WorkerRecord | null {
    const row = this.db.query("SELECT * FROM workers WHERE host = ?").get(host) as Record<string, unknown> | null;
    return row ? rowToWorker(row) : null;
  }

  listWorkers(): WorkerRecord[] {
    const rows = this.db.query("SELECT * FROM workers ORDER BY host ASC").all() as Record<string, unknown>[];
    return rows.map(rowToWorker);
  }

  getSetting(key: string): string | null {
    const row = this.db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    const updatedAt = nowIso();

    this.db
      .query(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(key, value, updatedAt);
  }
}
