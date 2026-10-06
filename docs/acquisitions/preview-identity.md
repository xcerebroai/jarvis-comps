# Preview runtime identity checkpoint

The exact approved isolated target is database neondb, Neon project tiny-recipe-78351340, branch br-purple-cherry-aws7cy1w, endpoint ep-falling-leaf-aw5i8ldf. Hosting metadata alone does not establish the actual Prisma runtime target.

GET `/api/acquisitions/preview-identity` exists only when VERCEL_ENV is preview, requires an active existing isAdmin session, and executes only current_database plus the three neon provider settings. It returns an explicit four-field allowlist with matches and migrationBlocked. Production/development receive 404 before session/database access. No URL, credentials, environment value, customer row or persistent diagnostic secret is returned. Keep Vercel deployment protection enabled independently.

A schema-only preview has no existing users. There is deliberately no anonymous bootstrap route. Owner must provision a fresh synthetic active admin through normal authorized account tooling on the already approved isolated branch, then sign in privately through the existing signin page. Do not copy customer rows, password hashes, sessions or credentials. No acquisition-table migration is necessary for this authentication checkpoint because User and Session already exist in the schema-only branch.

After owner sign-in on the exact new preview deployment, visit this endpoint in the same browser. Require HTTP200 and all four exact IDs. HTTP409, absent settings, a different branch/endpoint, failed auth or unavailable metadata means STOP: runtime binding remains unverified. Do not infer identity by parsing or exposing DATABASE_URL. Provider settings may be unsupported; in that case this diagnostic intentionally fails closed and an owner-run protected runtime check using supported Neon/Vercel tooling is still required.

This is an inspection gate, not a migration executor. No production migration is authorized by its success. Production identity/recovery must be checked separately before production changes.
