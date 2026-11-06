alter table public.events
  add column if not exists category text not null default 'meeting',
  add column if not exists all_day boolean not null default false;

alter table public.events
  drop constraint if exists events_category_check;
alter table public.events
  add constraint events_category_check
  check (category in ('meeting', 'work', 'deadline', 'personal', 'holiday'));

notify pgrst, 'reload schema';
