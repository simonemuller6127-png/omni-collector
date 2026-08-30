import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { CommentRow } from "../types.js";

export interface NewComment {
  comment_id: string;
  author?: string;
  content: string;
  like_count?: number;
  posted_at?: string;
  is_creator_reply?: boolean;
  raw?: string;
}

export class CommentRepository {
  constructor(private readonly db: Database.Database) {}

  upsertComments(collectionId: string, comments: NewComment[]): number {
    const upsert = this.db.prepare(
      `INSERT INTO comments (id, collection_id, comment_id, author, content, like_count,
       posted_at, is_creator_reply, raw)
       VALUES (@id, @collection_id, @comment_id, @author, @content, @like_count,
       @posted_at, @is_creator_reply, @raw)
       ON CONFLICT(collection_id, comment_id) DO UPDATE SET
         content = excluded.content,
         like_count = excluded.like_count,
         author = excluded.author`,
    );
    const tx = this.db.transaction((items: NewComment[]) => {
      for (const c of items) {
        upsert.run({
          id: randomUUID(),
          collection_id: collectionId,
          comment_id: c.comment_id,
          author: c.author ?? null,
          content: c.content,
          like_count: c.like_count ?? 0,
          posted_at: c.posted_at ?? null,
          is_creator_reply: c.is_creator_reply ? 1 : 0,
          raw: c.raw ?? null,
        });
      }
      return items.length;
    });
    return tx(comments);
  }

  getByCollection(collectionId: string): CommentRow[] {
    return this.db
      .prepare("SELECT * FROM comments WHERE collection_id = ? ORDER BY like_count DESC")
      .all(collectionId) as CommentRow[];
  }

  setStarred(commentId: string, starred: boolean): void {
    this.db.prepare("UPDATE comments SET is_starred = ? WHERE id = ?").run(starred ? 1 : 0, commentId);
  }

  /** 精选评论（PRD 7.3）：限定评论属于该收藏时才允许切换，返回是否存在。 */
  setStarredInCollection(collectionId: string, commentId: string, starred: boolean): boolean {
    const res = this.db
      .prepare("UPDATE comments SET is_starred = ? WHERE id = ? AND collection_id = ?")
      .run(starred ? 1 : 0, commentId, collectionId);
    return res.changes > 0;
  }

  deleteByCollection(collectionId: string): void {
    this.db.prepare("DELETE FROM comments WHERE collection_id = ?").run(collectionId);
  }
}
