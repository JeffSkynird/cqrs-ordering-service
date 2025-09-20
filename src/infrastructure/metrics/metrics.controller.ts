import { Controller, Get, Header } from '@nestjs/common';
import { getRegistry } from './prom';

@Controller()
export class MetricsController {
  @Get('/metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    const registry = getRegistry();
    return await registry.metrics();
  }
}
