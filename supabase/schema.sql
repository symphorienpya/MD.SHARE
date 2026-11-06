create extension if not exists "pgcrypto";

-- This application authenticates users itself and performs database access
-- through the server-side Supabase key.
alter table if exists public.users disable row level security;
alter table if exists public.posts disable row level security;
alter table if exists public.messages disable row level security;
alter table if exists public.notifications disable row level security;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists mobile text;
alter table public.users add column if not exists profile_picture text;

-- Refresh PostgREST's schema cache after adding application columns.
notify pgrst, 'reload schema';

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  invited_by uuid references public.users(id) on delete set null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(team_id, user_id)
);

alter table public.messages add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.posts add column if not exists team_id uuid references public.teams(id) on delete cascade;
notify pgrst, 'reload schema';

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  type text not null check (type in ('video', 'link', 'document')),
  url text,
  file_name text,
  file_path text,
  file_size bigint,
  mime_type text,
  author_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid references public.users(id) on delete cascade,
  body text not null check (char_length(body) <= 2000),
  read boolean not null default false,
  team_id uuid references public.teams(id) on delete cascade,
  reply_to_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  link text not null default '/dashboard',
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  reminder_minutes integer not null default 15,
  reminder_sent_at timestamptz,
  shared_with uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

notify pgrst, 'reload schema';
