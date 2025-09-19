import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/healthz')
  healthz() {
    return { ok: true, service: 'ordering', ts: new Date().toISOString() };
  }
}
