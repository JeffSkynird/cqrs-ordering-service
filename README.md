# CQRS Ordering Service

Order Service implementing CQRS + Event Sourcing with SQLite projections + DDD, Outbox dispatcher, Prometheus metrics (`/metrics`), k6 load tests, and a Docker-friendly local setup built with NestJS and TypeScript.

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

## Exercise the Event Store
Run the manual script that appends an event and then replays the JSONL file:

```bash
cd app/node
npx ts-node scripts/manual-event-store.ts
```

The script ensures `data/events.jsonl` exists, writes a new event with an incremental `offset`, and prints all stored events.

## Roadmap Highlights
- CQRS command and query handlers powered by event sourcing and domain-driven aggregates
- Outbox dispatcher to deliver domain events reliably to external systems
- SQLite projection stores and read models tuned for fast queries
- k6 load-testing scenarios plus a Docker-based developer experience for effortless local setup
