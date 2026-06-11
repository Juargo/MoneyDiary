import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestaModule } from './infrastructure/http/ingesta.module';
import { TransaccionesModule } from './infrastructure/http/transacciones.module';

@Module({
  imports: [IngestaModule, TransaccionesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
