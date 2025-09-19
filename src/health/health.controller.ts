import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/healthz')
  healthz() {
    return { ok: true, service: 'lab001', ts: new Date().toISOString() };
  }
}
