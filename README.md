# 🚀 CQRS Ordering Service

Order Service implementing CQRS + Event Sourcing with SQLite projections, an outbox/dispatcher pipeline, Prometheus metrics (`/metrics`), k6 load testing, and a Docker-friendly NestJS + TypeScript stack.

## ✨ Highlights
- CQRS command side with an idempotent `CreateOrder` flow backed by a file-based event store
- SQLite read model projections that resume from checkpoints after restarts
- Reliable outbox mirrored to RabbitMQ with exponential backoff, fault injectors, and delivery tracking
- Observability with Prometheus metrics, Grafana dashboards, and SLO burn-rate alerts
- Local developer ergonomics: `.env` template, Docker Compose services, and helper scripts

## ⚙️ Quick Start
1. **Prepare env vars**
   ```bash
   cp .env.example .env
   ```
   Ensure the following are set (defaults already present in `.env`):
   - `RABBITMQ_URL` (e.g. `amqp://guest:guest@localhost:5672`)
   - `RABBITMQ_DEFAULT_USER` / `RABBITMQ_DEFAULT_PASS` for Docker Compose
   - `OUTBOX_DISPATCHER_*` knobs for polling, backoff, and failure injection

2. **Install & launch the service**
   ```bash
   npm install
   npm run dev
   ```
   The API listens on `http://localhost:8080` with `/healthz` and `/metrics` available immediately.

3. **Bring up supporting services (optional but recommended)**
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```
   - Prometheus: `http://localhost:9090`
   - Grafana: `http://localhost:3000`
   - RabbitMQ UI: `http://localhost:15672` (`guest/guest`)

## 🔍 Service Endpoints
- **Health probe**
  ```bash
  curl -s http://localhost:8080/healthz | jq
  ```
  Example:
  ```json
  {
    "ok": true,
    "service": "ordering",
    "ts": "2025-09-19T12:34:56.789Z"
  }
  ```

- **Prometheus metrics**
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

## 📝 Create an Order
Submit a `CreateOrder` command; the endpoint is idempotent on `clientRequestId`:

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

Response:
```json
{
  "orderId": "be305f32-0153-4ec3-83e5-23e10d9e9596"
}
```
Replaying the same payload returns the identical `orderId` without duplicating events.

## 🔎 Query the Projection
The projector consumes the event store, upserts `order_views` in `data/read-model.sqlite`, and resumes from its checkpoint on restart.

```bash
ORDER_ID="<orderId-from-create-response>"
curl -s "http://localhost:8080/orders/${ORDER_ID}" | jq
```

The response reflects projected fields such as `status` and `paymentRequested`. Check `/metrics` for `projector_event_lag_seconds{projector="order-sqlite-projector"}` to ensure the worker keeps up.

> 🧹 **Reset tip**: If you wipe `data/events.jsonl` to start fresh, also remove `data/read-model.sqlite*` so the projector rebuilds from the new stream.

## 🪄 Event Store Playground
Append a manual event and replay the store:

```bash
cd app/node
npx ts-node scripts/manual-event-store.ts
```

The script ensures `data/events.jsonl` exists, writes an event with an incremental `offset`, and prints all stored events.

## 📊 Observability Stack
1. Launch Prometheus & Grafana (see [Quick Start](#-quick-start)).
2. In Grafana (`Dashboards → Import → Upload JSON`), import `infra/grafana/dashboard.json` and map `DS_PROMETHEUS` to `http://prometheus:9090`.
3. Generate traffic (create orders, call `/healthz`, simulate errors) and inspect panels:
   - `Requests per Second` highlights status-class breakdowns
   - `HTTP Latency p95 (ms)` uses Prometheus histogram quantiles
   - `HTTP Error Rate (%)` monitors 5xx ratios
   - `Projector Lag (s)` surfaces `projector_event_lag_seconds`
4. In Prometheus (`Alerts` tab) review burn-rate rules from `infra/prometheus/rules/burn-rate.yml`. Induce 5xx responses to trigger `HTTPErrorBudgetBurnWarning` or `HTTPErrorBudgetBurnCritical`.

Dashboard previews:
![Grafana dashboard](images/dashboard-grafana.png)

![Prometheus alerts](images/prometheus-rules.png)

## 📮 Outbox & RabbitMQ
Domain events are mirrored into `data/outbox.sqlite`. A dispatcher polls the table, retries with exponential backoff, and publishes messages to RabbitMQ using persistent delivery.

### 🐇 Start RabbitMQ
```bash
docker compose -f infra/docker-compose.yml up -d
```
Default queue: `orders.integration-events` (override via `RABBITMQ_OUTBOX_QUEUE`). AMQP is exposed on `5672`; the management UI runs on `15672`.

### 🚀 Run the Service with the Dispatcher
```bash
npm run dev
```
The dispatcher starts alongside the API when the relevant env vars are present.

### ✅ Verify Delivery
1. Create an order (see [Create an Order](#-create-an-order)).
2. Inspect `data/outbox.sqlite` and confirm the row is marked `sent`.
3. In the RabbitMQ UI, open `orders.integration-events` and use **Get Message(s)** to view the payload.

### 🧪 Simulate Failures
Toggle failure injectors and restart the app:
- `OUTBOX_DISPATCHER_FAIL_ONCE=true` – first message fails once, then succeeds
- `OUTBOX_DISPATCHER_FAIL_EVENT_TYPE=order.created` – all matching events fail until the flag is cleared
- `OUTBOX_DISPATCHER_FAIL_UNTIL_ATTEMPTS=3` – fail until the dispatcher reaches the specified attempt count

Dispatcher logs show retry/backoff behavior, and the outbox row tracks attempts, next retry timestamps, and terminal failures.
