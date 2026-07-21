import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { hashEmbed } from './embed.util';

export interface SearchHit {
  kind: 'document' | 'source' | 'memory' | 'comment';
  id: string;
  title: string;
  snippet: string;
  rank: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly database: DatabaseService) {}

  async searchProject(
    projectId: string,
    q: string,
    opts?: { semantic?: boolean },
  ): Promise<{ hits: SearchHit[]; semantic: SearchHit[] }> {
    const query = q.trim();
    if (!query) return { hits: [], semantic: [] };

    const fts = await this.database.db.execute(sql`
      (
        SELECT 'document'::text AS kind, d.id::text AS id, d.title AS title,
               left(coalesce(d.search_text, ''), 240) AS snippet,
               ts_rank(d.fts, plainto_tsquery('english', ${query})) AS rank
        FROM documents d
        WHERE d.project_id = ${projectId}::uuid
          AND d.fts @@ plainto_tsquery('english', ${query})
      )
      UNION ALL
      (
        SELECT 'source'::text, s.id::text, s.title,
               left(coalesce(s.text_content, ''), 240),
               ts_rank(s.fts, plainto_tsquery('english', ${query}))
        FROM project_sources s
        WHERE s.project_id = ${projectId}::uuid
          AND s.fts @@ plainto_tsquery('english', ${query})
      )
      UNION ALL
      (
        SELECT 'memory'::text, m.id::text, m.kind::text,
               left(coalesce(m.body, ''), 240),
               ts_rank(m.fts, plainto_tsquery('english', ${query}))
        FROM project_memory_items m
        WHERE m.project_id = ${projectId}::uuid
          AND m.fts @@ plainto_tsquery('english', ${query})
      )
      UNION ALL
      (
        SELECT 'comment'::text, c.id::text, left(c.body, 80),
               left(coalesce(c.body, ''), 240),
               ts_rank(c.fts, plainto_tsquery('english', ${query}))
        FROM comments c
        INNER JOIN documents d ON d.id = c.document_id
        WHERE d.project_id = ${projectId}::uuid
          AND c.fts @@ plainto_tsquery('english', ${query})
      )
      ORDER BY rank DESC
      LIMIT 50
    `);

    const hits: SearchHit[] = (fts.rows as Record<string, unknown>[]).map((r) => ({
      kind: r.kind as SearchHit['kind'],
      id: String(r.id),
      title: String(r.title ?? ''),
      snippet: String(r.snippet ?? ''),
      rank: Number(r.rank ?? 0),
    }));

    let semantic: SearchHit[] = [];
    if (opts?.semantic) {
      const vec = hashEmbed(query);
      const literal = `[${vec.join(',')}]`;
      const sem = await this.database.db.execute(sql`
        SELECT id::text AS id, title,
               left(coalesce(text_content, ''), 240) AS snippet,
               1 - (embedding <=> ${literal}::vector) AS rank
        FROM project_sources
        WHERE project_id = ${projectId}::uuid
          AND embedding IS NOT NULL
          AND ai_may_use = true
          AND outdated = false
        ORDER BY embedding <=> ${literal}::vector
        LIMIT 20
      `);
      semantic = (sem.rows as Record<string, unknown>[]).map((r) => ({
        kind: 'source' as const,
        id: String(r.id),
        title: String(r.title ?? ''),
        snippet: String(r.snippet ?? ''),
        rank: Number(r.rank ?? 0),
      }));
    }

    return { hits, semantic };
  }
}
