import { BadRequestException, Injectable } from '@nestjs/common';
import { FileEventStore } from '../../infrastructure/eventstore/file-event-store';
import { CreateOrderCommand } from '../../domain/commands/create-order';
import {
  OrderCreatedEvent,
  OrderItem,
  PaymentRequestedEvent
} from '../../domain/aggregates/order';
import { generateId } from '../../common/id';
import { now } from '../../common/clock';
import { StoredEvent } from '../../domain/events';

export interface CreateOrderResult {
  orderId: string;
  created: boolean;
}

@Injectable()
export class CreateOrderHandler {
  constructor(private readonly eventStore: FileEventStore) {}

  async execute(command: CreateOrderCommand): Promise<CreateOrderResult> {
    const existing = await this.findByClientRequestId(command.clientRequestId);
    if (existing) {
      return { orderId: existing.payload.orderId, created: false };
    }

    const totalAmount = calculateTotalAmount(command);
    validatePayment(command, totalAmount);

    const orderId = generateId();
    const items: OrderItem[] = command.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    }));

    const createdEvent: OrderCreatedEvent = {
      type: 'order.created',
      payload: {
        orderId,
        clientRequestId: command.clientRequestId,
        customerId: command.customerId,
        items,
        totalAmount,
        currency: command.currency
      },
      metadata: {
        eventId: generateId(),
        aggregateId: orderId,
        version: 1,
        ts: now()
      }
    };

    await this.eventStore.append(createdEvent);

    if (command.payment) {
      const paymentEvent: PaymentRequestedEvent = {
        type: 'payment.requested',
        payload: {
          orderId,
          clientRequestId: command.clientRequestId,
          amount: command.payment.amount,
          currency: command.payment.currency,
          method: command.payment.method
        },
        metadata: {
          eventId: generateId(),
          aggregateId: orderId,
          version: 2,
          ts: now()
        }
      };

      await this.eventStore.append(paymentEvent);
    }

    return { orderId, created: true };
  }

  private async findByClientRequestId(
    clientRequestId: string
  ): Promise<(StoredEvent & OrderCreatedEvent) | null> {
    for await (const event of this.eventStore.stream(0)) {
      if (
        event.type === 'order.created' &&
        event.payload.clientRequestId === clientRequestId
      ) {
        return event as StoredEvent & OrderCreatedEvent;
      }
    }

    return null;
  }
}

const calculateTotalAmount = (command: CreateOrderCommand): number => {
  return command.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
};

const validatePayment = (command: CreateOrderCommand, totalAmount: number): void => {
  if (!command.payment) {
    return;
  }

  if (command.payment.currency !== command.currency) {
    throw new BadRequestException('payment currency must match order currency');
  }

  const TOLERANCE = 1e-6;
  if (Math.abs(command.payment.amount - totalAmount) > TOLERANCE) {
    throw new BadRequestException('payment amount must match order total');
  }
};
