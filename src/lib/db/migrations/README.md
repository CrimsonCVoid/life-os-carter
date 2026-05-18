# Drizzle migrations

Generated SQL lives here. **Don't hand-edit migration files** — change
`src/lib/db/schema.ts` and re-run `npm run db:generate`.

## Workflow

```bash
# 1. edit src/lib/db/schema.ts
# 2. generate a migration file:
npm run db:generate
# 3. apply to Neon:
npm run db:push        # quick dev sync, no migration file needed
# or
npm run db:migrate     # apply all pending migration files
# 4. open the visual editor:
npm run db:studio
```

`db:push` and `db:migrate` both read from `DATABASE_URL_UNPOOLED` so they
can use a direct connection (Neon's pooler doesn't accept some DDL).

The runtime app uses `DATABASE_URL` (pooled) — see `src/lib/db/index.ts`.
