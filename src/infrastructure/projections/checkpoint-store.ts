import { Injectable } from '@nestjs/common';
import type { Statement } from 'better-sqlite3';
import { ProjectionDatabase } from './sqlite-projection';

type CheckpointRow = {
  last_offset: number;
};

@Injectable()
export class CheckpointStore {
  private readonly getStmt: Statement;
  private readonly upsertStmt: Statement;

  constructor(private readonly database: ProjectionDatabase) {
    const db = this.database.connection;
    this.getStmt = db.prepare(`
      SELECT last_offset
      FROM projection_checkpoints
      WHERE projector_name = @projector_name
    `);

    this.upsertStmt = db.prepare(`
      INSERT INTO projection_checkpoints (
        projector_name,
        last_offset,
        updated_at
      ) VALUES (
        @projector_name,
        @last_offset,
        @updated_at
      )
      ON CONFLICT(projector_name) DO UPDATE SET
        last_offset = excluded.last_offset,
        updated_at = excluded.updated_at;
    `);
  }

  async getLastOffset(projectorName: string): Promise<number | null> {
    const row = this.getStmt.get({ projector_name: projectorName }) as
      | CheckpointRow
      | undefined;
    if (!row) {
      return null;
    }

    return row.last_offset;
  }

  async saveLastOffset(projectorName: string, offset: number): Promise<void> {
    this.upsertStmt.run({
      projector_name: projectorName,
      last_offset: offset,
      updated_at: new Date().toISOString()
    });
  }
}
