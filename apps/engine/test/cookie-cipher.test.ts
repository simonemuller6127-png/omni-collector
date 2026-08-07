import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CookieCipher } from "../src/index.js";

let dataDir: string;
let cipher: CookieCipher;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-cc-"));
  cipher = new CookieCipher(dataDir);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("CookieCipher", () => {
  it("encrypts and decrypts round-trip", () => {
    cipher.encryptCookie("bilibili", JSON.stringify({ SESSDATA: "abc123" }));
    const plain = cipher.decryptCookie("bilibili");
    expect(plain).toBe(JSON.stringify({ SESSDATA: "abc123" }));
    const raw = fs.readFileSync(path.join(dataDir, "cookies", "bilibili.enc"));
    expect(raw.subarray(0, 4).toString("utf8")).toBe("OMNC");
    expect(raw.toString("utf8")).not.toContain("abc123");
  });

  it("returns null for tampered files", () => {
    const file = path.join(dataDir, "cookies", "tampered.enc");
    cipher.encryptCookie("tampered", "secret");
    const raw = fs.readFileSync(file);
    raw[20] = raw[20] ^ 0xff; // 破坏密文
    fs.writeFileSync(file, raw);
    expect(cipher.decryptCookie("tampered")).toBeNull();
  });

  it("returns null for missing platform", () => {
    expect(cipher.decryptCookie("nope")).toBeNull();
  });

  it("rotates key and keeps cookies readable", () => {
    cipher.encryptCookie("youtube", JSON.stringify({ SID: "xyz" }));
    cipher.rotateKey();
    expect(fs.existsSync(path.join(dataDir, "key.bin.bak"))).toBe(true);
    expect(cipher.decryptCookie("youtube")).toBe(JSON.stringify({ SID: "xyz" }));
  });

  it("creates key.bin with restrictive permissions", () => {
    cipher.ensureKey();
    const stat = fs.statSync(path.join(dataDir, "key.bin"));
    expect(stat.size).toBe(32);
    if (process.platform !== "win32") {
      expect(stat.mode & 0o777).toBeLessThanOrEqual(0o600);
    }
  });
});
