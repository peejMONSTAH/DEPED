# Retired — do not apply these files

Prisma is the single source of truth for this database's schema. Everything under
`backend/prisma/migrations` is authoritative; the SQL in this directory is kept only
as a historical record and **must not be run**.

## Why

`20260812120000_remove_records_role_and_archiving.sql` cannot complete on PostgreSQL.
It uses:

```sql
ALTER TYPE public."UserRole" DROP VALUE IF EXISTS 'RECORDS_PERSONNEL';
```

PostgreSQL has no `ALTER TYPE ... DROP VALUE` — that is a syntax error. When the script
was run it therefore failed partway through, after its earlier statements had already
taken effect. The live database confirms this split outcome:

| Statement | Outcome |
|---|---|
| `DROP TABLE archived_records` | applied — the table is gone |
| `DELETE FROM users/roles WHERE RECORDS_PERSONNEL` | applied — no account holds the role |
| `ALTER TYPE "UserRole" DROP VALUE 'RECORDS_PERSONNEL'` | **never ran** — value still exists |
| `ALTER TYPE "TransactionStatus" DROP VALUE 'ARCHIVED'` | **never ran** — value still exists |

`schema.prisma` therefore correctly still declares `RECORDS_PERSONNEL` and `ARCHIVED`.
Both are unused by application code and held by zero rows.

Removing an enum value in PostgreSQL requires rebuilding the type (create a new enum,
convert every dependent column, drop the old type). That is worth doing only alongside
another migration that already needs downtime — it is not worth a deploy of its own for
two unused labels.

## Row Level Security

`20260811183007_remote_schema.sql` contains `ENABLE ROW LEVEL SECURITY` for `users` and
`personnel`. That is not the live state: no table in the live database has RLS enabled.
The Express API is the trust boundary, and station scoping is enforced in
`backend/src/utils/scope.util.ts`. If RLS is ever adopted, it needs real policies **and**
a non-owner database role — enabling it without policies while connecting as the table
owner does nothing.

## Adding schema changes

Create a Prisma migration instead:

```bash
cd backend && npx prisma migrate dev --name your_change
```
