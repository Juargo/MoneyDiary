# demo-data Specification

## Purpose

Define the demo data template — a realistic month of Chilean transactions seeded per demo user, showing a typical 50/30/20 distribution to showcase MoneyDiary's full functionality.

## Requirements

### Requirement: DEMO-DATA-01 — Transaction Volume and Buckets

The demo data template MUST contain between 25 and 35 transactions distributed across all 5 budget buckets (Ahorro, Necesidades, Vivienda, Deseos, and any additional buckets defined in `BUCKET_IDS`).

#### Scenario: Full bucket coverage

- GIVEN a new demo user is created
- WHEN the demo seeder inserts transactions
- THEN at least 1 transaction MUST be assigned to each existing bucket
- AND the total transaction count MUST be between 25 and 35

### Requirement: DEMO-DATA-02 — Realistic 50/30/20 Distribution

The demo template MUST reflect a Chilean professional's monthly finances, respecting the 50/30/20 rule categories with realistic amounts and descriptions.

#### Scenario: Income allocation

- GIVEN the demo data is generated
- THEN the data MUST include exactly 1 income transaction (abono) of ~$1,200,000 CLP with a realistic description (e.g., "Sueldo" or "Remuneración mensual")
- AND all other transactions MUST be expenses (cargo)

#### Scenario: Needs ~60% of spending

- GIVEN the demo transactions
- THEN spending on needs (Necesidades + Vivienda buckets) MUST total between 55% and 65% of total expenses
- AND MUST include realistic Chilean items: Arriendo (~$400K), Isapre (~$90K), Gastos comunes (~$50K), Supermercado Líder/Jumbo (~$200K), Bencina (~$60K), Agua/Luz/Internet (~$80K)

#### Scenario: Wants ~20% of spending

- GIVEN the demo transactions
- THEN spending on Deseos bucket MUST total between 15% and 25% of total expenses
- AND MUST include items like Netflix (~$7K), Spotify (~$5K), restaurants (~$60K), cinema/entertainment (~$20K), Rappi/Uber Eats (~$40K)

#### Scenario: Savings ~10% of spending

- GIVEN the demo transactions
- THEN spending on Ahorro bucket MUST total between 5% and 15% of total expenses
- AND MUST include at least 1 transaction described as "Transferencia a cuenta de ahorro" (~$120K)

### Requirement: DEMO-DATA-03 — Amounts Within Realistic Bounds

Every demo transaction amount MUST fall within realistic Chilean spending ranges. No transaction MAY have a zero or negative amount.

#### Scenario: Valid amount ranges

- GIVEN any demo transaction
- THEN `cargo` or `abono` MUST be a positive BigInt
- AND cargo MUST be ≤ $5,000,000 CLP
- AND abono MUST be ≤ $10,000,000 CLP

### Requirement: DEMO-DATA-04 — Isolated Per User

Each demo user MUST receive their own copy of the data template. Demo data MUST be created within the same Prisma transaction as the User and Account, ensuring atomic creation.

#### Scenario: Two demo users have independent data

- GIVEN two demo users are created sequentially
- WHEN querying their transactions
- THEN each user MUST have their own Account, Ingesta, and Transaccion records
- AND the `accountId` values MUST differ between users

### Requirement: DEMO-DATA-05 — Uses Current Bucket IDs

The demo seeder MUST read bucket IDs from the `BUCKET_IDS` constant at runtime, NOT hardcode them. This ensures demo data survives bucket migrations.

#### Scenario: Bucket reclassification

- GIVEN the BUCKET_IDS constant is updated with a new bucket
- WHEN a new demo user is created
- THEN the demo seeder MUST reference the updated BUCKET_IDS
- AND any transaction previously assigned to a now-removed bucket MUST fall back to an existing valid bucket
