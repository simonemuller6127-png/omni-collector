import { createHash } from "node:crypto";

/** B 站 wbi 签名混排表（公开算法）。 */
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

export function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  return MIXIN_TAB.map((i) => raw[i]).join("").slice(0, 32);
}

export function signParams(
  params: Record<string, string>,
  mixinKey: string,
): Record<string, string> {
  const withWts: Record<string, string> = {
    ...params,
    wts: String(Math.floor(Date.now() / 1000)),
  };
  const query = Object.keys(withWts)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(withWts[k])}`)
    .join("&");
  const wRid = createHash("md5").update(query + mixinKey).digest("hex");
  return { ...withWts, w_rid: wRid };
}
