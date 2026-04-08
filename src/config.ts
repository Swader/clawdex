import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type WorkerTransport = "local" | "ssh" | "tailscale-ssh";

export interface FactoryWorkerConfig {
  name: string;
  transport: WorkerTransport;
  sshTarget: string | null;
  sshUser: string | null;
  managedRepoRoot: string;
  managedHostRoot: string;
  managedScratchRoot: string;
  localExecution: boolean;
}

export interface FactoryConfig {
  projectRoot: string;
  controlRoot: string;
  dbPath: string;
  contextsDir: string;
  cronSnapshotsDir: string;
  logsDir: string;
  sshKnownHostsPath: string;
  factoryRoot: string;
  managedRepoRoot: string;
  managedHostRoot: string;
  managedScratchRoot: string;
  dashboardHost: string;
  dashboardPort: number;
  telegramBotToken: string;
  telegramControlChatId: number | null;
  allowedTelegramUserId: number;
  telegramPollTimeoutSeconds: number;
  cronPollIntervalSeconds: number;
  localMachine: string;
  workers: FactoryWorkerConfig[];
  usageAdapter: string;
  codexBin: string;
}

interface WorkerConfigInput {
  name: string;
  transport?: string;
  sshTarget?: string | null;
  sshUser?: string | null;
  managedRepoRoot?: string;
  managedHostRoot?: string;
  managedScratchRoot?: string;
  localExecution?: boolean;
}

function readNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(env: NodeJS.ProcessEnv, name: string): number | null {
  const raw = env[name]?.trim();
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function resolveMaybeRelative(projectRoot: string, value: string): string {
  if (value.startsWith("/")) {
    return value;
  }

  return resolve(projectRoot, value);
}

function normalizeTransport(value: string | undefined, fallback: WorkerTransport): WorkerTransport {
  if (value === "local" || value === "ssh" || value === "tailscale-ssh") {
    return value;
  }

  return fallback;
}

function normalizeWorkerConfig(
  input: WorkerConfigInput,
  defaults: {
    localMachine: string;
    managedRepoRoot: string;
    managedHostRoot: string;
    managedScratchRoot: string;
  }
): FactoryWorkerConfig {
  const name = input.name.trim();
  const fallbackTransport: WorkerTransport = name === defaults.localMachine ? "local" : "ssh";
  const transport = normalizeTransport(input.transport, fallbackTransport);

  return {
    name,
    transport,
    sshTarget: transport === "local" ? null : (input.sshTarget?.trim() || name),
    sshUser: transport === "local" ? null : (input.sshUser?.trim() || null),
    managedRepoRoot: input.managedRepoRoot?.trim() || defaults.managedRepoRoot,
    managedHostRoot: input.managedHostRoot?.trim() || defaults.managedHostRoot,
    managedScratchRoot: input.managedScratchRoot?.trim() || defaults.managedScratchRoot,
    localExecution: input.localExecution ?? transport === "local"
  };
}

function loadWorkerInputs(projectRoot: string, env: NodeJS.ProcessEnv): WorkerConfigInput[] | null {
  const workersFile = env.FACTORY_WORKERS_FILE?.trim() || "./workers.json";
  const resolved = resolveMaybeRelative(projectRoot, workersFile);

  if (!existsSync(resolved)) {
    if (env.FACTORY_WORKERS_FILE?.trim()) {
      throw new Error(`FACTORY_WORKERS_FILE does not exist: ${resolved}`);
    }

    throw new Error(`Worker config file does not exist: ${resolved}`);
  }

  return JSON.parse(readFileSync(resolved, "utf8")) as WorkerConfigInput[];
}

function uniqueWorkers(workers: FactoryWorkerConfig[]): FactoryWorkerConfig[] {
  const seen = new Set<string>();
  const ordered: FactoryWorkerConfig[] = [];

  for (const worker of workers) {
    if (seen.has(worker.name)) {
      continue;
    }

    seen.add(worker.name);
    ordered.push(worker);
  }

  return ordered;
}

const projectRoot = resolve(import.meta.dir, "..");

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FactoryConfig {
  const controlRoot = env.FACTORY_CONTROL_ROOT?.trim() || "/srv/telemux";
  const factoryRoot = env.FACTORY_FACTORY_ROOT?.trim() || "/srv/factory";
  const localMachine = env.FACTORY_LOCAL_MACHINE?.trim() || "control";
  const managedRepoRoot = resolve(factoryRoot, "repos");
  const managedHostRoot = resolve(factoryRoot, "hostctx");
  const managedScratchRoot = resolve(factoryRoot, "scratch");
  const workerInputs = loadWorkerInputs(projectRoot, env) || [];

  const workers = uniqueWorkers(
    workerInputs.map((input) =>
      normalizeWorkerConfig(input, {
        localMachine,
        managedRepoRoot,
        managedHostRoot,
        managedScratchRoot
      })
    )
  );

  return {
    projectRoot,
    controlRoot,
    dbPath: resolve(controlRoot, "db.sqlite"),
    contextsDir: resolve(controlRoot, "contexts"),
    cronSnapshotsDir: resolve(controlRoot, "crons"),
    logsDir: resolve(controlRoot, "logs"),
    sshKnownHostsPath: resolve(controlRoot, "ssh_known_hosts"),
    factoryRoot,
    managedRepoRoot,
    managedHostRoot,
    managedScratchRoot,
    dashboardHost: env.FACTORY_DASHBOARD_HOST?.trim() || "127.0.0.1",
    dashboardPort: readNumber(env, "FACTORY_DASHBOARD_PORT", 8787),
    telegramBotToken: env.FACTORY_TELEGRAM_BOT_TOKEN?.trim() || "",
    telegramControlChatId: readOptionalNumber(env, "FACTORY_TELEGRAM_CONTROL_CHAT_ID"),
    allowedTelegramUserId: readNumber(env, "FACTORY_ALLOWED_TELEGRAM_USER_ID", 0),
    telegramPollTimeoutSeconds: readNumber(env, "FACTORY_TELEGRAM_POLL_TIMEOUT_SECONDS", 30),
    cronPollIntervalSeconds: readNumber(env, "FACTORY_CRON_POLL_INTERVAL_SECONDS", 30),
    localMachine,
    workers,
    usageAdapter: env.FACTORY_USAGE_ADAPTER?.trim() || "manual",
    codexBin: env.FACTORY_CODEX_BIN?.trim() || "codex"
  };
}

export const config = loadConfig();

export function ensureProjectPaths(targetConfig: FactoryConfig = config): void {
  const dirs = [
    targetConfig.controlRoot,
    targetConfig.contextsDir,
    targetConfig.cronSnapshotsDir,
    targetConfig.logsDir,
    targetConfig.factoryRoot,
    targetConfig.managedRepoRoot,
    targetConfig.managedHostRoot,
    targetConfig.managedScratchRoot
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}
