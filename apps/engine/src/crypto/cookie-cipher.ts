import fs from "node:fs";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const MAGIC = Buffer.from("OMNC", "utf8");
const VERSION = 1;
const KEY_LEN = 32;

/**
 * Cookie 加密方案（TDD Part 7，ADR-005 冻结）：
 * AES-256-GCM；密钥为 {数据目录}/key.bin（32 字节随机数，仅当前用户可读）；
 * 文件格式：magic(4B) + version(1B) + iv(12B) + ciphertext + authTag(16B)。
 * V1 采用加密文件方案，后续可平滑升级系统密钥链。
 */
export class CookieCipher {
  private readonly keyPath: string;
  private readonly cookieDir: string;

  constructor(private readonly dataDir: string) {
    this.keyPath = path.join(dataDir, "key.bin");
    this.cookieDir = path.join(dataDir, "cookies");
    fs.mkdirSync(this.cookieDir, { recursive: true });
  }

  ensureKey(): void {
    if (fs.existsSync(this.keyPath)) return;
    fs.writeFileSync(this.keyPath, randomBytes(KEY_LEN), { mode: 0o600 });
  }

  encryptCookie(platform: string, cookiesJson: string): void {
    this.ensureKey();
    const key = this.readKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(cookiesJson, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, ciphertext, authTag]);
    fs.writeFileSync(path.join(this.cookieDir, `${platform}.enc`), payload);
  }

  decryptCookie(platform: string): string | null {
    const filePath = path.join(this.cookieDir, `${platform}.enc`);
    if (!fs.existsSync(filePath)) return null;
    this.ensureKey();
    const key = this.readKey();
    const payload = fs.readFileSync(filePath);
    try {
      if (!payload.subarray(0, 4).equals(MAGIC)) return null;
      if (payload[4] !== VERSION) return null;
      const iv = payload.subarray(5, 17);
      const authTag = payload.subarray(payload.length - 16);
      const ciphertext = payload.subarray(17, payload.length - 16);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }

  rotateKey(): void {
    const platforms = fs
      .readdirSync(this.cookieDir)
      .filter((f) => f.endsWith(".enc"))
      .map((f) => f.replace(/\.enc$/, ""));
    const entries = platforms
      .map((p) => [p, this.decryptCookie(p)] as const)
      .filter(([, value]) => value !== null) as Array<readonly [string, string]>;
    if (fs.existsSync(this.keyPath)) {
      fs.copyFileSync(this.keyPath, `${this.keyPath}.bak`);
    }
    fs.writeFileSync(this.keyPath, randomBytes(KEY_LEN), { mode: 0o600 });
    for (const [platform, value] of entries) {
      this.encryptCookie(platform, value);
    }
  }

  private readKey(): Buffer {
    this.ensureKey();
    const key = fs.readFileSync(this.keyPath);
    if (key.length !== KEY_LEN) {
      throw new Error("AUTH_001: invalid key.bin length");
    }
    return key;
  }
}
