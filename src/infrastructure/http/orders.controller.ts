import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { CreateOrderCommand } from '../../domain/commands/create-order';
import { CreateOrderHandler } from '../../application/handlers/create-order.handler';
import type { Response } from 'express';

@Controller('orders')
export class OrdersController {
  constructor(private readonly createOrderHandler: CreateOrderHandler) {}

  @Post()
  async create(
    @Body() command: CreateOrderCommand,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ orderId: string }> {
    const result = await this.createOrderHandler.execute(command);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return { orderId: result.orderId };
  }
}
