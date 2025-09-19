import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Database as BetterSqlite3Database, Statement } from 'better-sqlite3';
import DatabaseConstructor = require('better-sqlite3');
import { mkdirSync } from 'fs';
import { join } from 'path';
import type {
  OrderCreatedEvent,
  OrderEvent,
  PaymentRequestedEvent,
  OrderItem
} from '../../domain/aggregates/order';

export interface OrderView {
  orderId: string;
  clientRequestId: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  status: string;
  paymentRequested: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface OrderViewRow {
  order_id: string;
  client_request_id: string;
  customer_id: string;
  items_json: string;
  total_amount: number;
  currency: string;
  status: string;
  payment_requested: number;
  version: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ProjectionDatabase implements OnModuleDestroy {
  private readonly db: BetterSqlite3Database;

  constructor() {
    const dataDir = join(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, 'read-model.sqlite');

    this.db = new DatabaseConstructor(dbPath);
    this.initialize();
  }

  get connection(): BetterSqlite3Database {
    return this.db;
  }

  private initialize(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS order_views (
        order_id TEXT PRIMARY KEY,
        client_request_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        items_json TEXT NOT NULL,
        total_amount REAL NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        payment_requested INTEGER NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projection_checkpoints (
        projector_name TEXT PRIMARY KEY,
        last_offset INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}

@Injectable()
export class SqliteOrderProjection {
  private readonly insertOrUpdateOrderStmt: Statement;
  private readonly markPaymentRequestedStmt: Statement;
  private readonly getOrderByIdStmt: Statement;

  constructor(private readonly database: ProjectionDatabase) {
    const db = this.database.connection;

    this.insertOrUpdateOrderStmt = db.prepare(`
      INSERT INTO order_views (
        order_id,
        client_request_id,
        customer_id,
        items_json,
        total_amount,
        currency,
        status,
        payment_requested,
        version,
        created_at,
        updated_at
      ) VALUES (
        @order_id,
        @client_request_id,
        @customer_id,
        @items_json,
        @total_amount,
        @currency,
        @status,
        @payment_requested,
        @version,
        @created_at,
        @updated_at
      )
      ON CONFLICT(order_id) DO UPDATE SET
        client_request_id = excluded.client_request_id,
        customer_id = excluded.customer_id,
        items_json = excluded.items_json,
        total_amount = excluded.total_amount,
        currency = excluded.currency,
        status = excluded.status,
        payment_requested = excluded.payment_requested,
        version = excluded.version,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
    `);

    this.markPaymentRequestedStmt = db.prepare(`
      UPDATE order_views
      SET
        status = @status,
        payment_requested = @payment_requested,
        version = @version,
        updated_at = @updated_at
      WHERE order_id = @order_id;
    `);

    this.getOrderByIdStmt = db.prepare(`
      SELECT
        order_id,
        client_request_id,
        customer_id,
        items_json,
        total_amount,
        currency,
        status,
        payment_requested,
        version,
        created_at,
        updated_at
      FROM order_views
      WHERE order_id = @order_id
    `);
  }

  project(event: OrderEvent): void {
    switch (event.type) {
      case 'order.created':
        this.applyOrderCreated(event);
        break;
      case 'payment.requested':
        this.applyPaymentRequested(event);
        break;
      default:
        // ignore events not related to the order read model
        break;
    }
  }

  getOrderById(orderId: string): OrderView | null {
    const row = this.getOrderByIdStmt.get({ order_id: orderId }) as
      | OrderViewRow
      | undefined;
    if (!row) {
      return null;
    }

    return {
      orderId: row.order_id,
      clientRequestId: row.client_request_id,
      customerId: row.customer_id,
      items: JSON.parse(row.items_json) as OrderItem[],
      totalAmount: row.total_amount,
      currency: row.currency,
      status: row.status,
      paymentRequested: row.payment_requested === 1,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private applyOrderCreated(event: OrderCreatedEvent): void {
    const payload = event.payload;

    this.insertOrUpdateOrderStmt.run({
      order_id: payload.orderId,
      client_request_id: payload.clientRequestId,
      customer_id: payload.customerId,
      items_json: JSON.stringify(payload.items),
      total_amount: payload.totalAmount,
      currency: payload.currency,
      status: 'created',
      payment_requested: 0,
      version: event.metadata.version,
      created_at: event.metadata.ts,
      updated_at: event.metadata.ts
    });
  }

  private applyPaymentRequested(event: PaymentRequestedEvent): void {
    this.markPaymentRequestedStmt.run({
      order_id: event.payload.orderId,
      status: 'payment-requested',
      payment_requested: 1,
      version: event.metadata.version,
      updated_at: event.metadata.ts
    });
  }
}
