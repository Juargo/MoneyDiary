# demo-cleanup Specification

## Purpose

Prevent accumulation of stale demo accounts. The system MUST remove demo users whose `demoCreatedAt` exceeds 7 days, using both lazy cleanup (on demo creation) and a scheduled daily cron as safety net.

## Requirements

### Requirement: DEMO-CLN-01 — Cleanup Criteria

A demo user is considered expired when `demoCreatedAt` is older than 7 days (168 hours). The system MUST compare against the current time using the injected `IReloj` port.

#### Scenario: Expired detection

- GIVEN a demo user with `demoCreatedAt = now() - 8 days`
- WHEN the cleanup runs
- THEN the system MUST include this user in the deletion set
- AND MUST use cascade order: Session → Transaccion → Ingesta → Account → User

#### Scenario: Active demo preserved

- GIVEN a demo user with `demoCreatedAt = now() - 3 days`
- WHEN the cleanup runs
- THEN the system MUST NOT delete this user
- AND all their data MUST remain accessible

### Requirement: DEMO-CLN-02 — Lazy Cleanup

The system MUST run lazy cleanup before creating a new demo user. This passes the cleanup before any new demo account creation.

#### Scenario: Cleanup before create

- GIVEN a `CrearDemoUseCase` execution
- WHEN the use case starts
- THEN the system MUST delete all expired demo users BEFORE creating the new one
- AND all deletions MUST happen in a single Prisma transaction

#### Scenario: Lazy cleanup removes stale accounts

- GIVEN 5 expired demo accounts exist
- WHEN an anonymous visitor triggers demo creation
- THEN before the new user is created, all 5 expired accounts MUST be deleted
- AND their associated Sessions, Transacciones, Ingestas, and Accounts MUST be deleted first

### Requirement: DEMO-CLN-03 — Daily Cron Cleanup

The system MUST run a scheduled job daily at 3:00 AM (`0 3 * * *`) via `@nestjs/schedule` that deletes all expired demo accounts. This is a safety net if lazy cleanup misses some expired accounts (e.g., no demo creation requests for several days).

#### Scenario: Cron deletes expired demos

- GIVEN the time is 3:00 AM
- WHEN the cron job triggers
- THEN the system MUST query `User WHERE esDemo=true AND demoCreatedAt < now() - 7 days`
- AND MUST delete all matching users with full cascade in order: Session → Transaccion → Ingesta → Account → User
- AND SHOULD log the number of deleted accounts

#### Scenario: No expired demos

- GIVEN the time is 3:00 AM
- AND there are no expired demo users
- WHEN the cron job triggers
- THEN the job MUST complete successfully
- AND MUST log "0 expired demo accounts cleaned"
- AND MUST NOT throw or fail
