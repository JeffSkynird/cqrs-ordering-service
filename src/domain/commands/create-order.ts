import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested
} from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateOrderPaymentDto {
  @IsString()
  @IsNotEmpty()
  method!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class CreateOrderCommand {
  @IsUUID()
  clientRequestId!: string;

  @IsUUID()
  customerId!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderPaymentDto)
  payment?: CreateOrderPaymentDto;
}
