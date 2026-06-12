import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { PatronNoEncontradoError } from '../../domain/errors/patron-invalido.error';
import {
  MatchTypePatron,
  Patron,
  PatronInput,
} from '../../domain/value-objects/patron';
import {
  CreatePatronUseCase,
  DeletePatronUseCase,
  ListPatronesUseCase,
  UpdatePatronUseCase,
} from '../../application/use-cases/manage-patrones.use-case';

interface PatronBody {
  bucketName?: string;
  label?: string | null;
  icon?: string | null;
  expression?: string;
  matchType?: string;
  priority?: number;
  active?: boolean;
}

// TODO(auth): cuando exista auth, agregar guard de admin.
@Controller('api/patrones')
export class PatronesController {
  constructor(
    private readonly list: ListPatronesUseCase,
    private readonly create: CreatePatronUseCase,
    private readonly update: UpdatePatronUseCase,
    private readonly remove: DeletePatronUseCase,
  ) {}

  @Get()
  async listar() {
    const patrones = await this.list.execute();
    return { total: patrones.length, patrones: patrones.map(serialize) };
  }

  @Post()
  @HttpCode(201)
  async crear(@Body() body: PatronBody) {
    const input = this.parseFullBody(body);
    const result = await this.create.execute(input);
    if (result.isFail()) throw new BadRequestException(result.getError().message);
    return serialize(result.getValue());
  }

  @Put(':id')
  async actualizar(@Param('id') id: string, @Body() body: PatronBody) {
    const partial = this.parsePartialBody(body);
    const result = await this.update.execute(id, partial);
    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof PatronNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException(error.message);
    }
    return serialize(result.getValue());
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@Param('id') id: string) {
    const result = await this.remove.execute(id);
    if (result.isFail()) throw new NotFoundException(result.getError().message);
  }

  private parseFullBody(body: PatronBody): PatronInput {
    if (!body.bucketName || !body.expression || !body.matchType || body.priority === undefined) {
      throw new BadRequestException(
        'Campos requeridos: bucketName, expression, matchType, priority.',
      );
    }
    const matchType = this.parseMatchType(body.matchType);
    return {
      bucketName: body.bucketName,
      label: body.label ?? null,
      icon: body.icon ?? null,
      expression: body.expression,
      matchType,
      priority: body.priority,
      active: body.active ?? true,
    };
  }

  private parsePartialBody(body: PatronBody): Partial<PatronInput> {
    type Mutable = { -readonly [K in keyof PatronInput]?: PatronInput[K] };
    const out: Mutable = {};
    if (body.bucketName !== undefined) out.bucketName = body.bucketName;
    if (body.label !== undefined) out.label = body.label;
    if (body.icon !== undefined) out.icon = body.icon;
    if (body.expression !== undefined) out.expression = body.expression;
    if (body.matchType !== undefined) out.matchType = this.parseMatchType(body.matchType);
    if (body.priority !== undefined) out.priority = body.priority;
    if (body.active !== undefined) out.active = body.active;
    return out;
  }

  private parseMatchType(raw: string): MatchTypePatron {
    if (!Object.values(MatchTypePatron).includes(raw as MatchTypePatron)) {
      throw new BadRequestException(
        `matchType inválido. Debe ser uno de: ${Object.values(MatchTypePatron).join(', ')}`,
      );
    }
    return raw as MatchTypePatron;
  }
}

function serialize(p: Patron) {
  return {
    id: p.id,
    bucketName: p.bucketName,
    label: p.label,
    icon: p.icon,
    expression: p.expression,
    matchType: p.matchType,
    priority: p.priority,
    active: p.active,
  };
}

