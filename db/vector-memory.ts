import { db, vectorAvailable } from "./index";
import { memories, Memory } from "./schema";
import { eq, sql } from "drizzle-orm";
import { generateEmbedding, embeddingToSqliteVec, getEmbeddingDimension } from "@/lib/llm/embeddings";

// Vector memory with semantic search using sqlite-vec
// Note: sqlite-vec creates a virtual table for embeddings

export interface VectorMemory {
  memoryId: string;
  agentId: string;
  content: string;
  embedding: number[];
  importance: number;
  tick: number;
  similarity: number;
}

export class VectorMemoryStore {
  private initialized: boolean = false;
  private currentDimension: number = 768;

  // Initialize vector table (call once on startup)
  async initialize(): Promise<boolean> {
    // T3.1: Check if vector extension is available
    if (!vectorAvailable) {
      console.warn("[VectorMemory] sqlite-vec not available, vector search disabled");
      this.initialized = false;
      return false;
    }

    try {
      // T3.2: Get current embedding dimension
      this.currentDimension = getEmbeddingDimension();

      // Check if table exists with different dimension
      const tableInfo: any[] = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='memory_embeddings'`);
      if (tableInfo.length > 0) {
        // Check existing dimension by trying to get a sample
        try {
          const sample: any[] = await db.all(sql`SELECT embedding FROM memory_embeddings LIMIT 1`);
          if (sample.length > 0 && sample[0].embedding) {
            const existingDim = JSON.parse(sample[0].embedding).length;
            if (existingDim !== this.currentDimension) {
              console.log(`[VectorMemory] Dimension mismatch (${existingDim} vs ${this.currentDimension}), dropping table`);
              await db.run(sql`DROP TABLE IF EXISTS memory_embeddings`);
            }
          }
        } catch (e) {
          // Table might be empty or have issues, try to recreate
          await db.run(sql`DROP TABLE IF EXISTS memory_embeddings`);
        }
      }

      // Create virtual table with current dimension
      await db.run(sql`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
          memory_id TEXT PRIMARY KEY,
          agent_id TEXT,
          embedding FLOAT[${this.currentDimension}]
        )
      `);
      this.initialized = true;
      console.log(`[VectorMemory] Virtual table initialized with dimension ${this.currentDimension}`);
      return true;
    } catch (error) {
      console.warn("[VectorMemory] Failed to initialize vector table:", error);
      this.initialized = false;
      return false;
    }
  }

  // Store embedding for a memory
  async storeEmbedding(
    memoryId: string,
    agentId: string,
    content: string,
    embedding?: number[]
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.initialized) {
      console.warn("[VectorMemory] Cannot store embedding - vector table not available");
      return;
    }

    try {
      // Generate embedding if not provided
      const vec = embedding || (await generateEmbedding(content));
      const vecString = embeddingToSqliteVec(vec);

      // Insert into virtual table
      db.run(sql`
        INSERT OR REPLACE INTO memory_embeddings (memory_id, agent_id, embedding)
        VALUES (${memoryId}, ${agentId}, ${vecString})
      `);
    } catch (error) {
      console.error("[VectorMemory] Failed to store embedding:", error);
    }
  }

  // Store embedding for an existing memory
  async storeMemoryEmbedding(memory: Memory): Promise<void> {
    await this.storeEmbedding(memory.id, memory.agentId, memory.content);
  }

  // Semantic search using vector similarity
  async semanticSearch(
    agentId: string,
    query: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<VectorMemory[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.initialized) {
      console.warn("[VectorMemory] Cannot search - vector table not available");
      return [];
    }

    try {
      // Generate query embedding
      const queryEmbedding = await generateEmbedding(query);
      const queryVecString = embeddingToSqliteVec(queryEmbedding);

      // Perform vector search with similarity
      // sqlite-vec uses distance (lower is better), convert to similarity (higher is better)
      const rows: any[] = await db.all(sql`
        SELECT
          m.id as memory_id,
          m.agent_id,
          m.content,
          m.importance,
          m.tick,
          e.distance,
          (1 - (e.distance / 2)) as similarity
        FROM memory_embeddings e
        JOIN memories m ON e.memory_id = m.id
        WHERE e.agent_id = ${agentId}
        AND e.embedding MATCH ${queryVecString}
        ORDER BY e.distance ASC
        LIMIT ${limit}
      `);
      return rows
        .filter((row: any) => (1 - (row.distance / 2)) >= threshold)
        .map((row: any) => ({
          memoryId: row.memory_id,
          agentId: row.agent_id,
          content: row.content,
          embedding: [], // Don't return full embedding
          importance: row.importance,
          tick: row.tick,
          similarity: 1 - (row.distance / 2),
        }));
    } catch (error) {
      console.error("[VectorMemory] Semantic search failed:", error);
      return [];
    }
  }

  // Hybrid search: combine semantic similarity with importance
  async hybridSearch(
    agentId: string,
    query: string,
    limit: number = 10,
    semanticWeight: number = 0.6
  ): Promise<VectorMemory[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.initialized) {
      // Fallback to text search
      const fallback = await db
        .select()
        .from(memories)
        .where(eq(memories.agentId, agentId));

      return fallback
        .filter((m: typeof memories.$inferSelect) => m.content.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map((m: typeof memories.$inferSelect) => ({
          memoryId: m.id,
          agentId: m.agentId,
          content: m.content,
          embedding: [],
          importance: m.importance,
          tick: m.tick,
          similarity: 0.5, // Default similarity for text match
        }));
    }

    try {
      const queryEmbedding = await generateEmbedding(query);
      const queryVecString = embeddingToSqliteVec(queryEmbedding);

      // Combined score: semanticWeight * similarity + (1 - semanticWeight) * importance
      const rows: any[] = await db.all(sql`
        SELECT
          m.id as memory_id,
          m.agent_id,
          m.content,
          m.importance,
          m.tick,
          e.distance,
          (1 - (e.distance / 2)) as similarity,
          (${semanticWeight} * (1 - (e.distance / 2)) + ${1 - semanticWeight} * m.importance) as combined_score
        FROM memory_embeddings e
        JOIN memories m ON e.memory_id = m.id
        WHERE e.agent_id = ${agentId}
        AND e.embedding MATCH ${queryVecString}
        ORDER BY combined_score DESC
        LIMIT ${limit}
      `);
      return rows.map((row: any) => ({
        memoryId: row.memory_id,
        agentId: row.agent_id,
        content: row.content,
        embedding: [],
        importance: row.importance,
        tick: row.tick,
        similarity: row.similarity,
      }));
    } catch (error) {
      console.error("[VectorMemory] Hybrid search failed:", error);
      return [];
    }
  }

  // Delete embedding for a memory
  async deleteEmbedding(memoryId: string): Promise<void> {
    if (!this.initialized) return;

    try {
      db.run(sql`
        DELETE FROM memory_embeddings WHERE memory_id = ${memoryId}
      `);
    } catch (error) {
      console.error("[VectorMemory] Failed to delete embedding:", error);
    }
  }

  // Delete all embeddings for an agent
  async clearAgentEmbeddings(agentId: string): Promise<void> {
    if (!this.initialized) return;

    try {
      db.run(sql`
        DELETE FROM memory_embeddings WHERE agent_id = ${agentId}
      `);
    } catch (error) {
      console.error("[VectorMemory] Failed to clear agent embeddings:", error);
    }
  }

  // Check if vector search is available
  isAvailable(): boolean {
    return this.initialized;
  }
}

// Global instance
export const vectorMemoryStore = new VectorMemoryStore();
