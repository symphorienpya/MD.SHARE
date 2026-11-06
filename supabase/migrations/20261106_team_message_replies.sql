alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;

create index if not exists messages_team_id_created_at_idx on public.messages(team_id, created_at);
create index if not exists messages_reply_to_id_idx on public.messages(reply_to_id);

notify pgrst, 'reload schema';
