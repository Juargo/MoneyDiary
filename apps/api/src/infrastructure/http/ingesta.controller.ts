import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProcessIngestaUseCase } from '../../application/use-cases/process-ingesta.use-case';
import { MulterFileReaderAdapter } from './multer-file-reader.adapter';

/**
 * IngestaController — endpoint de ingesta + persistencia de archivos bancarios.
 *
 * Recibe el multipart, delega al ProcessIngestaUseCase (que encadena
 * validar → detectar → validar estructura → normalizar → persistir)
 * y traduce el Result<T,E> a respuesta HTTP.
 */
@Controller('api/ingestas')
export class IngestaController {
  constructor(private readonly processIngesta: ProcessIngestaUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async ingestar(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'No se recibió ningún archivo. Envía el archivo en el campo "file".',
      );
    }

    const fileReader = new MulterFileReaderAdapter(file);
    const result = await this.processIngesta.execute(fileReader);

    if (result.isFail()) {
      throw new BadRequestException(result.getError().message);
    }

    const data = result.getValue();

    return {
      message: 'Archivo procesado correctamente.',
      ingestaId: data.ingestaId,
      archivo: data.archivo,
      banco: data.banco,
      transacciones: data.transacciones,
    };
  }
}
