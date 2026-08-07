import path from "node:path";
import { AiQueueProcessor, type AiQueueRunResult, type AIProvider } from "@omni/ai";
import {
  AIRepository,
  CollectionRepository,
  MigrationManager,
} from "@omni/database";

export interface AiQueueRunnerOptions {
  dataDir: string;
  migrationsDir: string;
  provider: AIProvider;
  batchSize?: number;
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
      const aiRepo = new AIRepository(db);
      const collections = new CollectionRepository(db);
      const processor = new AiQueueProcessor(
        {
          provider: this.opts.provider,
          nextBatch: (limit) =>
            aiRepo.nextBatch(limit).map((row) => {
              const col = collections.findById(row.collection_id);
              return {
                id: row.id,
                collectionId: row.collection_id,
                title: col?.title ?? "",
                url: col?.url ?? "",
                author: col?.author ?? undefined,
                description: col?.description ?? undefined,
                platform: col?.platform,
              };
            }),
          markProcessing: (id) => aiRepo.markProcessing(id),
          markDone: (id) => aiRepo.markDone(id),
          markFailed: (id, error) => aiRepo.markFailed(id, error),
          findSuggestionByHash: (hash) => aiRepo.findSuggestionByHash(hash),
          saveSuggestion: (s) => aiRepo.saveSuggestion(s),
        },
        this.opts.batchSize ?? 100,
      );
      return await processor.run();
    } finally {
      manager.close();
    }
  }
}
