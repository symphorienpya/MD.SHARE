alter table if exists public.users disable row level security;
alter table if exists public.posts disable row level security;
alter table if exists public.messages disable row level security;
alter table if exists public.notifications disable row level security;
alter table if exists public.events disable row level security;
alter table if exists public.teams disable row level security;
alter table if exists public.team_members disable row level security;

notify pgrst, 'reload schema';
