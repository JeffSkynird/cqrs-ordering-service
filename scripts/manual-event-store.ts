// store as a scripts/manual-event-store.ts
import { FileEventStore } from '../src/infrastructure/eventstore/file-event-store';
import { generateId } from '../src/common/id';
import { now } from '../src/common/clock';

async function main() {
  const store = new FileEventStore();

  const written = await store.append({
    type: 'order.created',
    payload: { orderId: generateId(), amount: 42 },
    metadata: {
      eventId: generateId(),
      aggregateId: 'order-123',
      version: 1,
      ts: now(),
    },
  });
  console.log('append ->', written);

  console.log('stream from 0:');
  for await (const event of store.stream(0)) {
    console.log(event);
  }
}

main().catch(console.error);
