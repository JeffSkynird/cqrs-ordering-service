import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Database as BetterSqlite3Database, Statement } from 'better-sqlite3';
import DatabaseConstructor = require('better-sqlite3');
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { StoredEvent } from '../../domain/events';

export type OutboxStatus = 'pending' | 'sent' | 'failed';

export interface OutboxMessage {
  messageId: string;
  event: StoredEvent;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
}

interface OutboxRow {
  message_id: string;
  event_json: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
}

@Injectable()
export class OutboxRepository implements OnModuleDestroy {
  private readonly db: BetterSqlite3Database;
  private readonly insertStmt: Statement;
  private readonly dueStmt: Statement;
  private readonly markSentStmt: Statement;
  private readonly recordAttemptStmt: Statement;
  private readonly markFailedStmt: Statement;

  constructor() {
    const dataDir = join(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'outbox.sqlite');

    this.db = new DatabaseConstructor(dbPath);
    this.initialize();

    this.insertStmt = this.db.prepare(`
      INSERT INTO outbox_messages (
        message_id,
        aggregate_id,
        event_type,
        event_json,
        status,
        attempts,
        next_attempt_at,
        created_at,
        updated_at
      ) VALUES (
        @message_id,
        @aggregate_id,
        @event_type,
        @event_json,
        @status,
        @attempts,
        @next_attempt_at,
        @created_at,
        @updated_at
      )
      ON CONFLICT(message_id) DO NOTHING;
    `);

    this.dueStmt = this.db.prepare(`
      SELECT
        message_id,
        event_json,
        status,
        attempts,
        next_attempt_at,
        last_attempt_at,
        last_error
      FROM outbox_messages
      WHERE status = 'pending' AND next_attempt_at <= @now
      ORDER BY next_attempt_at ASC
      LIMIT @limit;
    `);

    this.markSentStmt = this.db.prepare(`
      UPDATE outbox_messages
      SET
        status = 'sent',
        sent_at = @sent_at,
        updated_at = @updated_at
      WHERE message_id = @message_id AND status != 'sent';
    `);

    this.recordAttemptStmt = this.db.prepare(`
      UPDATE outbox_messages
      SET
        attempts = @attempts,
        next_attempt_at = @next_attempt_at,
        last_attempt_at = @last_attempt_at,
        last_error = @last_error,
        updated_at = @updated_at
      WHERE message_id = @message_id AND status = 'pending';
    `);

    this.markFailedStmt = this.db.prepare(`
      UPDATE outbox_messages
      SET
        status = 'failed',
        attempts = @attempts,
        last_attempt_at = @last_attempt_at,
        last_error = @last_error,
        updated_at = @updated_at
      WHERE message_id = @message_id;
    `);
  }

  addFromEvent(event: StoredEvent): void {
    const nowIso = new Date().toISOString();
    const payload = {
      message_id: event.metadata.eventId,
      aggregate_id: event.metadata.aggregateId,
      event_type: event.type,
      event_json: JSON.stringify(event),
      status: 'pending' as OutboxStatus,
      attempts: 0,
      next_attempt_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso
    };

    this.insertStmt.run(payload);
  }

  getPendingMessages(limit: number): OutboxMessage[] {
    const nowIso = new Date().toISOString();
    const rows = this.dueStmt.all({ now: nowIso, limit }) as OutboxRow[];
    return rows.map((row) => ({
      messageId: row.message_id,
      event: JSON.parse(row.event_json) as StoredEvent,
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      lastAttemptAt: row.last_attempt_at,
      lastError: row.last_error ?? null
    }));
  }

  markAsSent(messageId: string): void {
    const nowIso = new Date().toISOString();
    this.markSentStmt.run({ message_id: messageId, sent_at: nowIso, updated_at: nowIso });
  }

  recordDispatchError(
    messageId: string,
    attempts: number,
    nextAttemptAt: string,
    errorMessage: string
  ): void {
    const nowIso = new Date().toISOString();
    this.recordAttemptStmt.run({
      message_id: messageId,
      attempts,
      next_attempt_at: nextAttemptAt,
      last_attempt_at: nowIso,
      last_error: errorMessage,
      updated_at: nowIso
    });
  }

  markAsFailed(messageId: string, attempts: number, errorMessage: string): void {
    const nowIso = new Date().toISOString();
    this.markFailedStmt.run({
      message_id: messageId,
      attempts,
      last_attempt_at: nowIso,
      last_error: errorMessage,
      updated_at: nowIso
    });
  }

  onModuleDestroy(): void {
    this.db.close();
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox_messages (
        message_id TEXT PRIMARY KEY,
        aggregate_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        next_attempt_at TEXT NOT NULL,
        last_attempt_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status_next_attempt
        ON outbox_messages(status, next_attempt_at);
    `);
  }
}
