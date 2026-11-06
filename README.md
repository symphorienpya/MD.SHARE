# Point.share MDai

Private, administrator-managed resource sharing and team communication platform built with Node.js, Express, EJS, Supabase/PostgreSQL, Socket.IO, Multer, and Bootstrap.

## Features

- Administrator-created user accounts with first-login password change
- Role-based administration and member access
- Video, link, and document sharing
- Validated uploads with stored-file access checks
- Real-time notifications and team presence
- Live organization chat
- Responsive, restrained workspace interface

## Setup

1. Install Node.js 18 or newer.
2. Create the tables in `supabase/schema.sql` using the Supabase SQL Editor. If an existing database was created before mobile/profile support was added, run `supabase/migrations/20261105_add_user_profile_columns.sql` too. The migration also reloads PostgREST's schema cache.
3. For existing databases that do not yet contain the scheduling tables, run `supabase/migrations/20261105_add_events.sql` in the Supabase SQL Editor. This adds persistent events, countdown support data, and reminder scheduling.
3. Copy `.env.example` to `.env`, then set the Supabase URL and service-role key and a strong `SESSION_SECRET`.
   The publishable key may be used for this configuration if Supabase row-level security is disabled by the included schema.
4. Install dependencies: `npm install`
5. Create the initial administrator: `npm run seed`
6. Start the platform: `npm run dev`
7. Open `http://localhost:3000`

The default seed credentials come from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Change the example password before deployment.
