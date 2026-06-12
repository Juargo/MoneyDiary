import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestaModule } from './infrastructure/http/ingesta.module';
import { PatronesModule } from './infrastructure/http/patrones.module';
import { TransaccionesModule } from './infrastructure/http/transacciones.module';

@Module({
  imports: [IngestaModule, PatronesModule, TransaccionesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
