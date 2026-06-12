import { Injectable } from '@nestjs/common';
import { ICategoryRuleProvider } from '../../application/ports/category-rule-provider.port';
import { ReglaCategorizacion } from '../../domain/value-objects/regla-categorizacion';
import { GrupoPresupuesto } from '../../domain/value-objects/grupo-presupuesto';

/**
 * DefaultCategoryRuleProvider — set seed de reglas para el mercado chileno.
 *
 * Las reglas se ordenan de mayor a menor especificidad cuando hay riesgo
 * de overlap (ej: "uber eats" debe matchear Restaurantes antes que "uber"
 * → Transporte). El orden importa: primera regla que matchea gana.
 *
 * Cuando el usuario pueda agregar reglas propias (US futura), se podrán
 * concatenar antes de éstas para darles prioridad.
 */
@Injectable()
export class DefaultCategoryRuleProvider implements ICategoryRuleProvider {
  private readonly reglas: ReadonlyArray<ReglaCategorizacion> = [
    // ── Gustos — Restaurantes / Delivery (antes de Transporte para evitar choque con "uber eats")
    {
      patron: /uber eats|pedidos ya|rappi|cornershop|justo|delivery/i,
      categoria: { nombre: 'Restaurantes', grupo: GrupoPresupuesto.Gustos },
    },
    {
      patron: /restaurant|starbucks|cafe|mcdonald|burger|kfc|subway|domino|telepizza|sushi/i,
      categoria: { nombre: 'Restaurantes', grupo: GrupoPresupuesto.Gustos },
    },

    // ── Necesidades — Alimentación
    {
      patron: /lider|jumbo|santa isabel|tottus|unimarc|ekono|acuenta|supermercado/i,
      categoria: { nombre: 'Alimentación', grupo: GrupoPresupuesto.Necesidades },
    },

    // ── Necesidades — Vivienda
    {
      patron: /arriendo|inmobiliaria|hipotec|condominio|gastos? comunes/i,
      categoria: { nombre: 'Vivienda', grupo: GrupoPresupuesto.Necesidades },
    },

    // ── Necesidades — Cuentas/Servicios
    {
      patron: /enel|chilectra|aguas|esval|metrogas|lipigas|abastible|movistar|entel|wom|claro|vtr|gtd|directv/i,
      categoria: { nombre: 'Cuentas', grupo: GrupoPresupuesto.Necesidades },
    },

    // ── Necesidades — Transporte
    {
      patron: /uber\b|cabify|didi|metro\b|bencina|copec|shell|petrobras|enex|tag|autopista|bip/i,
      categoria: { nombre: 'Transporte', grupo: GrupoPresupuesto.Necesidades },
    },

    // ── Necesidades — Salud
    {
      patron: /farmacia|cruz verde|salcobrand|ahumada|clinica|hospital|isapre|fonasa|laboratorio/i,
      categoria: { nombre: 'Salud', grupo: GrupoPresupuesto.Necesidades },
    },

    // ── Gustos — Ocio / Suscripciones
    {
      patron: /netflix|spotify|hbo|disney\+?|prime video|youtube|cinemark|hoyts|cinepolis|steam|playstation|xbox/i,
      categoria: { nombre: 'Ocio', grupo: GrupoPresupuesto.Gustos },
    },

    // ── Gustos — Compras / Retail
    {
      patron: /falabella|paris|ripley|la polar|hites|abcdin|mercado libre|amazon|aliexpress|sodimac|easy/i,
      categoria: { nombre: 'Compras', grupo: GrupoPresupuesto.Gustos },
    },

    // ── Ahorro — Inversiones
    {
      patron: /fintual|racional|fondo mutuo|deposito a plazo|inversiones/i,
      categoria: { nombre: 'Ahorro', grupo: GrupoPresupuesto.Ahorro },
    },

    // Ingresos: cualquier transacción con `abono > 0` se clasifica
    // automáticamente como Ingreso en ListTransactionsUseCase — sin reglas
    // por descripción (los nombres de "sueldo"/"deposito" varían demasiado
    // entre bancos para confiarse de un patrón).
  ];

  getReglas(): Promise<ReadonlyArray<ReglaCategorizacion>> {
    return Promise.resolve(this.reglas);
  }
}
