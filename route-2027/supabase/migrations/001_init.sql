-- Route 2027: initial schema
-- Roles: player (anonymous nickname users), coordinator (county), factdesk, editor, admin, superadmin

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text,
  role text not null default 'player'
    check (role in ('player','coordinator','factdesk','editor','admin','superadmin')),
  county text,               -- coordinators only: the county they cover
  display_name text,         -- team members only
  created_at timestamptz not null default now()
);

-- Role helpers (security definer so RLS policies can call them without recursion)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'player')
$$;
create or replace function public.has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = any(roles)
$$;
create or replace function public.my_county() returns text
language sql stable security definer set search_path = public as $$
  select county from public.profiles where id = auth.uid()
$$;

-- Every new auth user (anonymous players and team members) gets a profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role) values (new.id, 'player') on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Players may set their own nick, never their own role or county
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role / SQL editor, which may change anything
  if auth.uid() is not null and not public.has_role(array['admin','superadmin']) then
    new.role := old.role; new.county := old.county; new.display_name := old.display_name;
  end if;
  if auth.uid() is not null and new.role = 'superadmin' and old.role <> 'superadmin' and public.my_role() <> 'superadmin' then
    new.role := old.role;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select using (id = auth.uid());
create policy "team reads profiles" on public.profiles for select using (public.has_role(array['coordinator','factdesk','editor','admin','superadmin']));
create policy "own profile update" on public.profiles for update using (id = auth.uid());
create policy "admins update profiles" on public.profiles for update using (public.has_role(array['admin','superadmin']));

-- ---------- player state (the whole journey progress as JSON) ----------
create table public.player_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  county text,
  updated_at timestamptz not null default now()
);
alter table public.player_state enable row level security;
create policy "own state" on public.player_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "team reads state" on public.player_state for select using (public.has_role(array['editor','admin','superadmin']));
create policy "coordinator reads county state" on public.player_state for select
  using (public.has_role(array['coordinator']) and county is not null and lower(county) = lower(public.my_county()));

-- ---------- inbox: ground reports, fact-check claims, questions ----------
create table public.inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('report','claim','question')),
  nick text,
  county text, issue text, impact text, solution text,   -- reports
  text text, topic text,                                  -- claims, questions
  ref text,
  status text not null default 'new',                     -- new | verified | published | rejected | pending
  public_ok boolean,
  verdict text, answer text, source text,
  answered_by uuid references auth.users(id),
  answered_at timestamptz,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index inbox_type_idx on public.inbox(type, created_at desc);
create index inbox_user_idx on public.inbox(user_id);
alter table public.inbox enable row level security;
create policy "player inserts own" on public.inbox for insert with check (user_id = auth.uid());
create policy "player reads own" on public.inbox for select using (user_id = auth.uid());
create policy "player deletes own" on public.inbox for delete using (user_id = auth.uid());
create policy "player marks own" on public.inbox for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "desk reads all" on public.inbox for select using (public.has_role(array['factdesk','editor','admin','superadmin']));
create policy "desk updates all" on public.inbox for update using (public.has_role(array['factdesk','editor','admin','superadmin']));
create policy "coordinator reads county reports" on public.inbox for select
  using (type = 'report' and public.has_role(array['coordinator']) and lower(county) like '%' || lower(public.my_county()) || '%');
create policy "coordinator updates county reports" on public.inbox for update
  using (type = 'report' and public.has_role(array['coordinator']) and lower(county) like '%' || lower(public.my_county()) || '%');

-- Players can only change public_ok and seen on their own rows
create or replace function public.guard_inbox_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare np boolean := new.public_ok; ns boolean := new.seen;
begin
  if auth.uid() is not null and not public.has_role(array['coordinator','factdesk','editor','admin','superadmin']) then
    new := old; new.public_ok := np; new.seen := ns;
  elsif new.answer is distinct from old.answer then
    new.answered_by := auth.uid(); new.answered_at := now(); new.seen := false;
  end if;
  return new;
end $$;
create trigger inbox_guard before update on public.inbox
  for each row execute function public.guard_inbox_update();

-- ---------- content managed by the team ----------
create table public.content (
  kind text not null check (kind in ('chapter','task','topic')),
  id text not null,
  data jsonb not null,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
alter table public.content enable row level security;
create policy "everyone reads content" on public.content for select using (true);
create policy "editors write content" on public.content for all
  using (public.has_role(array['editor','admin','superadmin']))
  with check (public.has_role(array['editor','admin','superadmin']));
-- Manifesto topics: only admins may set status 'approved'
create or replace function public.guard_topic_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'topic' and (new.data->>'status') = 'approved' and auth.uid() is not null and not public.has_role(array['admin','superadmin']) then
    new.data := jsonb_set(new.data, '{status}', '"draft"');
  end if;
  return new;
end $$;
create trigger content_topic_guard before insert or update on public.content
  for each row execute function public.guard_topic_approval();

-- ---------- leaderboard ----------
create table public.leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  nick text not null,
  best integer not null default 0 check (best >= 0 and best < 10000000),
  updated_at timestamptz not null default now()
);
alter table public.leaderboard enable row level security;
create policy "everyone reads board" on public.leaderboard for select using (true);
create policy "own board row" on public.leaderboard for insert with check (user_id = auth.uid());
create policy "own board update" on public.leaderboard for update using (user_id = auth.uid());
create policy "own board delete" on public.leaderboard for delete using (user_id = auth.uid());
create policy "admins moderate board" on public.leaderboard for delete using (public.has_role(array['admin','superadmin']));

-- ---------- media (voice notes, explainer videos) ----------
insert into storage.buckets (id, name, public) values ('media','media', true) on conflict (id) do nothing;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
create policy "editors upload media" on storage.objects for insert
  with check (bucket_id = 'media' and public.has_role(array['editor','admin','superadmin']));
create policy "editors delete media" on storage.objects for delete
  using (bucket_id = 'media' and public.has_role(array['editor','admin','superadmin']));

-- ---------- self-service delete (DELETE everything in the bot) ----------
create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if public.my_role() <> 'player' then raise exception 'Team accounts are removed by an admin'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_me() from public;
grant execute on function public.delete_me() to authenticated;
