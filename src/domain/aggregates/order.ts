import { DomainEvent } from '../events';

export type OrderStatus = 'empty' | 'created' | 'payment-requested';

export interface OrderItem extends Record<string, unknown> {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderCreatedPayload extends Record<string, unknown> {
  orderId: string;
  clientRequestId: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
}

export type OrderCreatedEvent = DomainEvent<'order.created', OrderCreatedPayload>;

export interface PaymentRequestedPayload extends Record<string, unknown> {
  orderId: string;
  clientRequestId: string;
  amount: number;
  currency: string;
  method: string;
}

export type PaymentRequestedEvent = DomainEvent<'payment.requested', PaymentRequestedPayload>;

export type OrderEvent = OrderCreatedEvent | PaymentRequestedEvent;

export interface OrderState {
  status: OrderStatus;
  orderId: string | null;
  version: number;
  clientRequestId: string | null;
  totalAmount: number | null;
  currency: string | null;
  paymentRequested: boolean;
}

export const initialOrderState: OrderState = {
  status: 'empty',
  orderId: null,
  version: 0,
  clientRequestId: null,
  totalAmount: null,
  currency: null,
  paymentRequested: false
};

export const applyOrderEvent = (state: OrderState, event: OrderEvent): OrderState => {
  switch (event.type) {
    case 'order.created':
      return {
        status: 'created',
        orderId: event.payload.orderId,
        version: event.metadata.version,
        clientRequestId: event.payload.clientRequestId,
        totalAmount: event.payload.totalAmount,
        currency: event.payload.currency,
        paymentRequested: false
      };
    case 'payment.requested':
      return {
        ...state,
        status: 'payment-requested',
        version: event.metadata.version,
        paymentRequested: true
      };
    default:
      return state;
  }
};

export const reduceOrder = (events: OrderEvent[]): OrderState =>
  events.reduce<OrderState>((state, event) => applyOrderEvent(state, event), initialOrderState);
