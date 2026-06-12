import { Result } from '../../shared/result';
import {
  IStructureValidator,
  ValidatedStructure,
} from '../../application/ports/structure-validator.port';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import { ExcelStructureValidatorService } from '../excel/excel-structure-validator.service';
import { PdfjsStructureValidatorService } from '../pdf/pdfjs-structure-validator.service';
import { detectarFormato } from './format-sniffer';

/**
 * IStructureValidator que despacha al validador Excel o PDF según firma binaria.
 *
 * El validador PDF expone metadata rica internamente (rango fechas, columnas X)
 * pero el port espera `ValidatedStructure` (Excel-shape). Como ProcessIngestaUseCase
 * solo usa el resultado como fail-fast, devolvemos campos centinela (-1) para los
 * que no aplican a PDF. Los errores PDF se envuelven en `EstructuraInvalidaError`
 * usando el variant `OrigenPdf` para preservar el mensaje original.
 */
export class CompositeStructureValidatorService implements IStructureValidator {
  constructor(
    private readonly excel: ExcelStructureValidatorService = new ExcelStructureValidatorService(),
    private readonly pdf: PdfjsStructureValidatorService = new PdfjsStructureValidatorService(),
  ) {}

  async validate(
    buffer: Buffer,
    banco: BancoConocido,
  ): Promise<Result<ValidatedStructure, EstructuraInvalidaError>> {
    if (detectarFormato(buffer) !== 'pdf') {
      return this.excel.validate(buffer, banco);
    }

    const r = await this.pdf.validate(buffer, banco, 'archivo.pdf');
    if (r.isFail()) {
      return Result.fail(
        new EstructuraInvalidaError(banco, [
          { tipo: 'OrigenPdf', mensaje: r.getError().message },
        ]),
      );
    }
    return Result.ok({
      banco,
      filaEncabezados: -1,
      primeraFilaDatos: -1,
      totalFilasDatos: -1,
    });
  }
}
