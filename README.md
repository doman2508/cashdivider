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
- centrum zrodel danych pod przyszly auto-sync banku

## Jak odpalic lokalnie

1. Skopiuj `.env.example` do `.env`.
2. Ustaw `DATABASE_URL` do lokalnego lub Railway Postgresa.
3. Opcjonalnie ustaw `APP_PASSWORD` i `APP_SESSION_SALT`, jesli chcesz zablokowac dostep do online'owej instancji.
4. Jesli chcesz przygotowac auto-import, uzupelnij tez `OPEN_BANKING_PROVIDER`, `OPEN_BANKING_CLIENT_ID`, `OPEN_BANKING_CLIENT_SECRET` i `OPEN_BANKING_REDIRECT_URI`. Dla prawdziwego banku ustaw `OPEN_BANKING_ENVIRONMENT=live`, a opcjonalnie podaj `OPEN_BANKING_TRUELAYER_PROVIDER_ID`, jesli chcesz preselect konkretnego banku w TrueLayer. Jesli chcesz uzyc linku wygenerowanego przez TrueLayer Builder 1:1, ustaw `OPEN_BANKING_AUTH_URL`.
5. Zainstaluj zaleznosci: `npm install`
6. Wygeneruj klienta Prisma: `npm run prisma:generate`
7. Po podpieciu bazy uruchom migracje: `npm run prisma:push`
8. Uruchom aplikacje: `npm run dev`

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
- spiac AIS providera i przygotowac pierwszy spike auto-importu
