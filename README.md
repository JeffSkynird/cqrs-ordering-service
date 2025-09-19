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



## Roadmap Highlights
- CQRS command and query handlers powered by event sourcing and domain-driven aggregates
- Outbox dispatcher to deliver domain events reliably to external systems
- SQLite projection stores and read models tuned for fast queries
- k6 load-testing scenarios plus a Docker-based developer experience for effortless local setup
