/** 内容生命周期保留策略（PRD 8 / SPEC S10 规则，全部数值由 RuleCenter 提供）。 */

export interface RetentionRules {
  deletionRetentionDays: number;
  reminder1Days: number;
  reminder2Days: number;
  watchLaterExpiryDays: number;
  titleChangeNoticeDays: number;
}

export type DeletionStage = "none" | "reminder1" | "reminder2" | "cleanup";

export function computeDeletionStage(
  deletedAt: string,
  now: Date,
  rules: RetentionRules,
): DeletionStage {
  const days = (Date.parse(now.toISOString()) - Date.parse(deletedAt)) / 86_400_000;
  if (days < rules.reminder1Days) return "none";
  if (days < rules.reminder2Days) return "reminder1";
  if (days < rules.deletionRetentionDays) return "reminder2";
  return "cleanup";
}

export function watchLaterExpired(collectedAt: string, now: Date, rules: RetentionRules): boolean {
  const days = (Date.parse(now.toISOString()) - Date.parse(collectedAt)) / 86_400_000;
  return days >= rules.watchLaterExpiryDays;
}

export function titleChangeNeedsNotice(
  lastSyncedAt: string,
  now: Date,
  rules: RetentionRules,
): boolean {
  const days = (Date.parse(now.toISOString()) - Date.parse(lastSyncedAt)) / 86_400_000;
  return days <= rules.titleChangeNoticeDays;
}
