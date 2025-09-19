import {
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res
} from '@nestjs/common';
import { CreateOrderCommand } from '../../domain/commands/create-order';
import { CreateOrderHandler } from '../../application/handlers/create-order.handler';
import type { Response } from 'express';
import { SqliteOrderProjection } from '../projections/sqlite-projection';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly createOrderHandler: CreateOrderHandler,
    private readonly projection: SqliteOrderProjection
  ) {}

  @Post()
  async create(
    @Body() command: CreateOrderCommand,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ orderId: string }> {
    const result = await this.createOrderHandler.execute(command);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return { orderId: result.orderId };
  }

  @Get(':id')
  async findOne(@Param('id') orderId: string) {
    const view = this.projection.getOrderById(orderId);
    if (!view) {
      throw new NotFoundException('order not found');
    }

    return {
      orderId: view.orderId,
      clientRequestId: view.clientRequestId,
      customerId: view.customerId,
      items: view.items,
      totalAmount: view.totalAmount,
      currency: view.currency,
      status: view.status,
      paymentRequested: view.paymentRequested,
      version: view.version,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt
    };
  }
}
