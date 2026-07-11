import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestaModule } from './infrastructure/http/ingesta.module';
import { MovimientosModule } from './infrastructure/http/movimientos.module';

@Module({
  imports: [IngestaModule, MovimientosModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
