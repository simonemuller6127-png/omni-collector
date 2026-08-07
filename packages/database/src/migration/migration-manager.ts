import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

export class MigrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

export interface MigrationResult {
  applied: string[];
  currentVersion: number;
  backups: string[];
}

/**
 * SQLite 迁移管理器（TDD Part 11，SPEC S6 冻结）。
 *
 * 注意：为支持"失败回滚并恢复备份"，本实现由管理器持有数据库连接
 * （构造参数为 dbPath 而非 Database 实例），失败时关闭连接、用备份覆盖、
 * 重新打开。这是对 TDD 11.3 签名的小幅实现调整。
 */
export class MigrationManager {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor(
    dbPath: string,
    private readonly migrationsDir: string,
    private readonly backupDir: string,
  ) {
    this.dbPath = dbPath;
    fs.mkdirSync(backupDir, { recursive: true });
    this.db = this.open();
  }

  private open(): Database.Database {
    const db = new Database(this.dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    return db;
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  currentVersion(): number {
    const has = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_versions'")
      .get();
    if (!has) return 0;
    const row = this.db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_versions").get() as { v: number };
    return row.v;
  }

  backupNow(label = "manual"): string {
    // 备份前强制 checkpoint，确保主库文件包含 WAL 中的全部已提交数据
    this.db.pragma("wal_checkpoint(TRUNCATE)");
    const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 17);
    const target = path.join(this.backupDir, `db_v${label}_${stamp}.db`);
    fs.copyFileSync(this.dbPath, target);
    this.pruneBackups();
    return target;
  }

  migrate(): MigrationResult {
    const applied: string[] = [];
    const current = this.currentVersion();
    const scripts = this.listScripts();
    for (const file of scripts) {
      const version = Number(file.slice(0, 3));
      if (version <= current) continue;
      const sql = fs.readFileSync(path.join(this.migrationsDir, file), "utf8");
      const backup = this.backupNow(`v${version}`);
      try {
        this.db.exec(sql);
        const userVersion = this.db.pragma("user_version", { simple: true }) as number;
        if (userVersion !== version) {
          throw new MigrationError(
            "DB_003",
            `DB_003: migration ${file}: user_version=${userVersion} expected=${version}`,
          );
        }
        const checksum = createHash("sha256").update(sql).digest("hex");
        this.db
          .prepare("INSERT INTO schema_versions(version, checksum) VALUES (?, ?)")
          .run(version, checksum);
        applied.push(file);
      } catch (err) {
        this.restore(backup);
        if (err instanceof MigrationError) throw err;
        throw new MigrationError(
          "ENGINE_002",
          `ENGINE_002: migration ${file} failed: ${(err as Error).message}`,
        );
      }
    }
    return { applied, currentVersion: this.currentVersion(), backups: this.listBackups() };
  }

  private listScripts(): string[] {
    return fs
      .readdirSync(this.migrationsDir)
      .filter((f) => /^\d{3}_.+\.sql$/.test(f))
      .sort();
  }

  private listBackups(): string[] {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir)
      .filter((f) => f.startsWith("db_v") && f.endsWith(".db"))
      .sort()
      .reverse();
  }

  private pruneBackups(): void {
    const backups = this.listBackups();
    for (const old of backups.slice(3)) {
      fs.rmSync(path.join(this.backupDir, old), { force: true });
    }
  }

  private restore(backup: string): void {
    try {
      this.db.close();
    } catch {
      // connection may already be unusable; proceed
    }
    fs.copyFileSync(backup, this.dbPath);
    // 清除可能残留的 WAL/SHM，避免恢复后旧 WAL 重放
    for (const suffix of ["-wal", "-shm"]) {
      fs.rmSync(this.dbPath + suffix, { force: true });
    }
    this.db = this.open();
  }
}
