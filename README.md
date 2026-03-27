# CashDivider

Szkielet aplikacji `Next.js + Prisma + PostgreSQL` przygotowany pod wdrozenie na Railway.

## Co jest juz gotowe

- struktura projektu `Next.js` z App Router
- konfiguracja `TypeScript`
- przygotowany model danych w `prisma/schema.prisma`
- endpointy API:
  - `/api/health`
  - `/api/rules`
  - `/api/rules/[id]`
  - `/api/days`
  - `/api/days/[date]`
  - `/api/days/[date]/settle`
  - `/api/imports`
  - `/api/imports/history`
  - `/api/batches`
- prawdziwy CRUD regul oparty o Prisma
- dashboard dni i paczek czytajacy z backendu
- historia importow i paczek czytajaca z backendu
- UI importu CSV z ING i recznego payloadu
- konfiguracja pod Railway i `DATABASE_URL`
- prosta blokada dostepu haslem aplikacji przez `APP_PASSWORD`

## Jak odpalic lokalnie

1. Skopiuj `.env.example` do `.env`.
2. Ustaw `DATABASE_URL` do lokalnego lub Railway Postgresa.
3. Opcjonalnie ustaw `APP_PASSWORD` i `APP_SESSION_SALT`, jesli chcesz zablokowac dostep do online'owej instancji.
4. Zainstaluj zaleznosci: `npm install`
5. Wygeneruj klienta Prisma: `npm run prisma:generate`
6. Po podpieciu bazy uruchom migracje: `npm run prisma:push`
7. Uruchom aplikacje: `npm run dev`

## Docelowy model danych

- `User`
- `AllocationRule`
- `Import`
- `BankTransaction`
- `DailySummary`
- `PaymentBatch`
- `PaymentBatchItem`

## Najblizsze kroki

- zastapic demo usera pelniejszym modelem logowania
- dopracowac workflow dnia po imporcie i zamknieciu paczki
- przygotowac grunt pod eksport lub automatyzacje paczek przelewow
