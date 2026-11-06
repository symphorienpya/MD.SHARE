alter table public.users add column if not exists mobile text;
alter table public.users add column if not exists profile_picture text;

notify pgrst, 'reload schema';
