import path from "node:path";
import { AiQueueProcessor, type AiQueueRunResult, type AIProvider } from "@omni/ai";
import {
  AIRepository,
  CollectionRepository,
  CommentRepository,
  MigrationManager,
  RuleCenter,
} from "@omni/database";

export interface AiQueueRunnerOptions {
  dataDir: string;
  migrationsDir: string;
  provider: AIProvider;
  batchSize?: number;
  /** 用户显式触发的单条分析（TASK_AI），不受 ai_enabled 全局开关拦截。 */
  force?: boolean;
}

/**
 * AI 批处理执行器（Phase 5）：把 ai_queue 中待处理收藏 join 内容后交给
 * AiQueueProcessor，产出 pending 状态的 Suggestion 供用户审核。
 * AI 默认关闭；由 ai_enabled 规则与外部调度触发。
 */
export class AiQueueRunner {
  constructor(private readonly opts: AiQueueRunnerOptions) {}

  async run(): Promise<AiQueueRunResult> {
    const manager = new MigrationManager(
      path.join(this.opts.dataDir, "OmniCollector.db"),
      this.opts.migrationsDir,
      path.join(this.opts.dataDir, "backup"),
    );
    manager.migrate();
    const db = manager.getDb();
    try {
      const rules = new RuleCenter(db);
      const zero: AiQueueRunResult = {
        processed: 0,
        deduped: 0,
        suggestionsCreated: 0,
        failed: 0,
        batchSize: this.opts.batchSize ?? 100,
      };
      if (!rules.getBool("ai_enabled", false) && !this.opts.force) {
        return zero;
      }
      const cap = rules.getNumber("ai_daily_call_limit", 50);
      const usedToday = (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM ai_queue WHERE status='done' AND processed_at >= date('now')",
          )
          .get() as { n: number }
      ).n;
      if (usedToday >= cap) {
        return zero;
      }
      const aiRepo = new AIRepository(db);
      const collections = new CollectionRepository(db);
      const comments = new CommentRepository(db);
      // 业务数值/开关一律从 business_rules 读一次，不在回调内反复查库
      const commentContextLimit = rules.getNumber("ai_comment_context_limit", 5);
      const tagMaxCount = rules.getNumber("ai_tag_max_count", 7);
      const featureSwitches: Record<string, boolean> = {
        suggested_tag: rules.getBool("ai_tag_enabled", true),
        suggested_topic: rules.getBool("ai_topic_enabled", true),
        suggested_summary: rules.getBool("ai_summary_enabled", true),
        suggested_content_tags: rules.getBool("ai_content_tag_enabled", true),
        suggested_content_type: rules.getBool("ai_content_type_enabled", true),
      };
      const processor = new AiQueueProcessor(
        {
          provider: this.opts.provider,
          nextBatch: (limit) =>
            aiRepo.nextBatch(limit).map((row) => {
              const col = collections.findById(row.collection_id);
              // 评论按 like_count 降序取前 N 条（comment.repository.ts:48-52 已排序），
              // 只进 prompt 与 input_hash，不落盘笔记正文
              const topComments = comments
                .getByCollection(row.collection_id)
                .slice(0, Math.max(0, commentContextLimit))
                .map((c) => ({
                  content: c.content ?? "",
                  like_count: c.like_count ?? 0,
                  ...(c.author ? { author: c.author } : {}),
                }));
              return {
                id: row.id,
                collectionId: row.collection_id,
                title: col?.title ?? "",
                url: col?.url ?? "",
                author: col?.author ?? undefined,
                description: col?.description ?? undefined,
                platform: col?.platform,
                ...(topComments.length > 0 ? { comments: topComments } : {}),
              };
            }),
          markProcessing: (id) => aiRepo.markProcessing(id),
          markDone: (id) => aiRepo.markDone(id),
          markFailed: (id, error) => aiRepo.markFailed(id, error),
          findSuggestionByHash: (hash) => aiRepo.findSuggestionByHash(hash),
          saveSuggestion: (s) => {
            const enabled = featureSwitches[s.suggestion_type] ?? true;
            if (!enabled) return undefined;
            // 内容标签超出 ai_tag_max_count 上限的部分直接截断
            if (s.suggestion_type === "suggested_content_tags" && s.payload) {
              try {
                const parsed = JSON.parse(s.payload);
                if (Array.isArray(parsed) && parsed.length > Math.max(1, tagMaxCount)) {
                  return aiRepo.saveSuggestion({
                    ...s,
                    payload: JSON.stringify(parsed.slice(0, Math.max(1, tagMaxCount))),
                  });
                }
              } catch {
                // 非 JSON payload 交由 parseTagPayload 处理，此处不截断
              }
            }
            return aiRepo.saveSuggestion(s);
          },
        },
        this.opts.batchSize ?? 100,
        commentContextLimit,
      );
      return await processor.run();
    } finally {
      manager.close();
    }
  }
}
