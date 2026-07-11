import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  InternalServerErrorException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProcessIngestaUseCase } from '../../application/use-cases/process-ingesta.use-case';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { MulterFileReaderAdapter } from './multer-file-reader.adapter';
import { aIngestaResponseDto } from './dto/ingesta-response.dto';
import { USER_ID_FIJO } from '../persistence/constants';

/**
 * IngestaController — endpoint de ingesta de archivos bancarios.
 *
 * Vive en infrastructure/http porque depende de NestJS y HTTP.
 * Su única responsabilidad es:
 *   1. Recibir el archivo multipart
 *   2. Crear el adapter y llamar a ProcessIngestaUseCase (el mismo
 *      orquestador que usa el CLI — detectar → asegurar cuenta → validar →
 *      normalizar → persistir; CLI y HTTP comparten un único pipeline)
 *   3. Traducir el Result<T,E> a respuesta HTTP
 *
 * No contiene lógica de negocio. USER_ID_FIJO es la constante de
 * infraestructura del MVP mono-usuario (US-011) — nunca viene del request.
 */
@Controller('api/ingestas')
export class IngestaController {
  constructor(private readonly processIngestaUseCase: ProcessIngestaUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // buffer en memoria, sin escribir a disco
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo
    }),
  )
  async ingestar(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'No se recibió ningún archivo. Envía el archivo en el campo "file".',
      );
    }

    const fileReader = new MulterFileReaderAdapter(file);
    const result = await this.processIngestaUseCase.execute({
      fileReader,
      userId: USER_ID_FIJO,
    });

    if (result.isFail()) {
      const error = result.getError();
      // PersistenciaFallidaError es un fallo de infraestructura (DB) → 500.
      // El resto son errores de validación del archivo enviado → 400. Ambos
      // mensajes son seguros: ningún error de este pipeline interpola
      // montos u otros datos sensibles (ver PersistenciaFallidaError y los
      // errores de dominio de extensión/banco/estructura/normalización).
      if (error instanceof PersistenciaFallidaError) {
        throw new InternalServerErrorException(error.message);
      }
      throw new BadRequestException(error.message);
    }

    return aIngestaResponseDto(result.getValue());
  }
}
