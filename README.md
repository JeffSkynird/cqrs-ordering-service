# CQRS Ordering Service

Order Service implementing CQRS + Event Sourcing with SQLite projections + DDD, an outbox + dispatcher pipeline, Prometheus metrics (`/metrics`), k6 load tests, and a Docker-friendly local setup built with NestJS and TypeScript.

## What Exists Today
- `GET /healthz` returns a JSON heartbeat with the service identifier and timestamp for readiness checks
- `GET /metrics` exposes Prometheus-friendly metrics so the service can be scraped and observed

These endpoints lay the groundwork for the broader CQRS architecture that will be layered in next.

## Try the Endpoints
- **Health probe**: 
  ```bash
  curl -s http://localhost:8080/healthz | jq
  ```
  Example response:
  ```json
  {
    "ok": true,
    "service": "ordering",
    "ts": "2025-09-19T12:34:56.789Z"
  }
  ```

- **Prometheus metrics**: 
  ```bash
  curl -s http://localhost:8080/metrics | grep -A12 http_server_request_duration_seconds
  ```

  Example snippet:
  ```
  # HELP http_request_duration_seconds HTTP request duration histogram
  # TYPE http_request_duration_seconds histogram
  http_request_duration_seconds_bucket{le="0.1",method="GET",path="/healthz",status="200"} 3
  http_request_duration_seconds_sum{method="GET",path="/healthz",status="200"} 0.012
  http_request_duration_seconds_count{method="GET",path="/healthz",status="200"} 3
  ```

## Create an Order via HTTP
With the API running you can submit a `CreateOrder` command. The endpoint is idempotent by `client_request_id`:

```bash
curl -s http://localhost:8080/orders \
  -H 'content-type: application/json' \
  -d '{
    "clientRequestId": "17b6e695-7cbd-4bd5-b62e-ff3f6ccab04c",
    "customerId": "5e2ad359-8624-4bd9-8d8c-31f04b7ce986",
    "currency": "USD",
    "items": [
      { "sku": "widget-001", "quantity": 2, "unitPrice": 25 }
    ],
    "payment": {
      "method": "credit_card",
      "amount": 50,
      "currency": "USD"
    }
  }' | jq
```

Example response:
```json
{
  "orderId": "be305f32-0153-4ec3-83e5-23e10d9e9596"
}
```

Replaying the same request returns the same `orderId` without duplicating events.

## Query the SQLite projection
The background projector subscribes to the event store, upserts the `order_views` table in `data/read-model.sqlite`, and resumes from its checkpoint after restarts. Once the projector processes the `OrderCreated` event you can fetch the read model:

```bash
ORDER_ID="<orderId-from-create-response>"
curl -s "http://localhost:8080/orders/${ORDER_ID}" | jq
```

The response reflects the projected state (`status`, `paymentRequested`, etc.). Check `/metrics` for the `projector_event_lag_seconds{projector="order-sqlite-projector"}` gauge to confirm the worker is keeping up.

> 🧹 **Resets**: if you wipe `data/events.jsonl` to start fresh, also remove `data/read-model.sqlite*` so the projector rebuilds the read model from the new stream.

## Exercise the Event Store
Run the manual script that appends an event and then replays the JSONL file:

```bash
cd app/node
npx ts-node scripts/manual-event-store.ts
```

The script ensures `data/events.jsonl` exists, writes a new event with an incremental `offset`, and prints all stored events.

## Outbox + RabbitMQ Dispatcher
Domain events appended to the file-based event store are mirrored into an outbox table (`data/outbox.sqlite`). A background dispatcher polls the table, retries with exponential backoff, and publishes each message to RabbitMQ using persistent delivery.

### Start RabbitMQ
```bash
docker compose -f infra/docker-compose.yml up -d
```
RabbitMQ exposes AMQP on `5672` and the management UI on `15672` (`guest/guest` by default). Queue name defaults to `orders.integration-events` and can be overridden with `RABBITMQ_OUTBOX_QUEUE`.

### Run the Service with the Dispatcher
```bash
cp .env.example .env # if you want a template; otherwise ensure .env contains the variables below
npm install
npm run dev
```

Relevant variables (already present in `.env`):
- `RABBITMQ_URL` – AMQP connection string (defaults to `amqp://guest:guest@localhost:5672`)
- `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS` – propagated to docker-compose
- `OUTBOX_DISPATCHER_*` – poll interval, backoff, max attempts and failure injectors (`FAIL_ONCE`, `FAIL_EVENT_TYPE`, `FAIL_UNTIL_ATTEMPTS`)

### Verify Delivery
1. Create an order (see [Create an Order via HTTP](#create-an-order-via-http)).
2. Inspect `data/outbox.sqlite` to see the row marked `sent`.
3. In the RabbitMQ UI (`http://localhost:15672`), select the `orders.integration-events` queue and `Get Message(s)` to view the dispatched payload.

### Simulate Failures
Set one of the env flags and restart the app:
- `OUTBOX_DISPATCHER_FAIL_ONCE=true` – first message fails once, then succeeds on retry.
- `OUTBOX_DISPATCHER_FAIL_EVENT_TYPE=order.created` – all events of that type fail (useful to test max-attempt handling).
- `OUTBOX_DISPATCHER_FAIL_UNTIL_ATTEMPTS=3` – fail until the dispatcher has retried three times.

Logs show the retries and backoff, and the outbox row keeps track of attempts, next retry timestamp, and terminal failures.
