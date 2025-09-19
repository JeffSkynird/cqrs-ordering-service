export interface EventMetadata {
  eventId: string;
  aggregateId: string;
  version: number;
  ts: string;
}

export interface DomainEvent<
  TType extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>
> {
  type: TType;
  payload: TPayload;
  metadata: EventMetadata;
}

export interface StoredEvent extends DomainEvent {
  offset: number;
}
