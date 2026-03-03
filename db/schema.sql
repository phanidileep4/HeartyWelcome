create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null default auth.uid(),
  title text not null,
  host text not null,
  event_datetime timestamptz not null,
  location text not null,
  details text,
  deadline date,
  passcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  guest_name text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  name_normalized text generated always as (lower(name)) stored,
  email text,
  email_normalized text generated always as (nullif(lower(email), '')) stored,
  status text not null check (status in ('yes', 'maybe', 'no')),
  attendees integer not null check (attendees > 0),
  note text,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_host_user_id on public.events(host_user_id);
create index if not exists idx_events_datetime on public.events(event_datetime);
create index if not exists idx_invite_tokens_event_id on public.invite_tokens(event_id);
create index if not exists idx_invite_tokens_token on public.invite_tokens(token);
create index if not exists idx_rsvps_event_id on public.rsvps(event_id);
create unique index if not exists ux_primary_invite_token_per_event
on public.invite_tokens(event_id)
where is_primary = true and is_active = true;
create unique index if not exists ux_rsvps_event_email
on public.rsvps(event_id, email_normalized)
where email_normalized is not null;
create unique index if not exists ux_rsvps_event_name_without_email
on public.rsvps(event_id, name_normalized)
where email_normalized is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists trg_rsvps_updated_at on public.rsvps;
create trigger trg_rsvps_updated_at
before update on public.rsvps
for each row execute function public.set_updated_at();

create or replace function public.current_invite_token()
returns text
language sql
stable
as $$
  select nullif((current_setting('request.headers', true)::jsonb ->> 'x-invite-token'), '');
$$;

create or replace function public.is_valid_invite_token(
  p_event_id uuid,
  p_token text default public.current_invite_token()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invite_tokens it
    where it.event_id = p_event_id
      and it.is_active = true
      and it.token = p_token
  );
$$;

create or replace function public.create_event_with_primary_token(
  p_title text,
  p_host text,
  p_event_datetime timestamptz,
  p_location text,
  p_details text,
  p_deadline date,
  p_passcode text
)
returns table(event_id uuid, invite_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.events (
    host_user_id, title, host, event_datetime, location, details, deadline, passcode
  )
  values (
    auth.uid(), p_title, p_host, p_event_datetime, p_location, p_details, p_deadline, p_passcode
  )
  returning id into v_event_id;

  insert into public.invite_tokens (event_id, is_primary, is_active)
  values (v_event_id, true, true)
  returning token into v_token;

  return query select v_event_id, v_token;
end;
$$;

create or replace function public.submit_rsvp_with_token(
  p_event_id uuid,
  p_token text,
  p_name text,
  p_email text,
  p_status text,
  p_attendees integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valid boolean;
  v_email text;
begin
  select exists (
    select 1
    from public.invite_tokens it
    where it.event_id = p_event_id
      and it.token = p_token
      and it.is_active = true
  ) into v_valid;

  if not v_valid then
    raise exception 'Invalid invite token';
  end if;

  v_email := nullif(lower(trim(p_email)), '');

  if v_email is not null then
    update public.rsvps
    set
      name = p_name,
      email = v_email,
      status = p_status,
      attendees = p_attendees,
      note = p_note,
      responded_at = now()
    where event_id = p_event_id
      and email_normalized = v_email;

    if not found then
      insert into public.rsvps (event_id, name, email, status, attendees, note)
      values (p_event_id, p_name, v_email, p_status, p_attendees, p_note);
    end if;
  else
    update public.rsvps
    set
      name = p_name,
      email = null,
      status = p_status,
      attendees = p_attendees,
      note = p_note,
      responded_at = now()
    where event_id = p_event_id
      and email_normalized is null
      and name_normalized = lower(trim(p_name));

    if not found then
      insert into public.rsvps (event_id, name, email, status, attendees, note)
      values (p_event_id, p_name, null, p_status, p_attendees, p_note);
    end if;
  end if;
end;
$$;

grant execute on function public.create_event_with_primary_token(
  text, text, timestamptz, text, text, date, text
) to authenticated;

grant execute on function public.submit_rsvp_with_token(
  uuid, text, text, text, text, integer, text
) to anon, authenticated;

grant execute on function public.is_valid_invite_token(uuid, text) to anon, authenticated;

alter table public.events enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.rsvps enable row level security;

drop policy if exists "events_select" on public.events;
drop policy if exists "events_insert" on public.events;
drop policy if exists "events_update" on public.events;
drop policy if exists "events_delete" on public.events;
drop policy if exists "invite_tokens_select" on public.invite_tokens;
drop policy if exists "invite_tokens_insert" on public.invite_tokens;
drop policy if exists "invite_tokens_update" on public.invite_tokens;
drop policy if exists "invite_tokens_delete" on public.invite_tokens;
drop policy if exists "rsvps_select" on public.rsvps;
drop policy if exists "rsvps_insert" on public.rsvps;
drop policy if exists "rsvps_update" on public.rsvps;
drop policy if exists "rsvps_delete" on public.rsvps;

create policy "events_select" on public.events
for select
using (
  auth.uid() = host_user_id
  or public.is_valid_invite_token(events.id)
);

create policy "events_insert" on public.events
for insert
with check (auth.uid() = host_user_id);

create policy "events_update" on public.events
for update
using (auth.uid() = host_user_id)
with check (auth.uid() = host_user_id);

create policy "events_delete" on public.events
for delete
using (auth.uid() = host_user_id);

create policy "invite_tokens_select" on public.invite_tokens
for select
using (
  exists (
    select 1 from public.events e
    where e.id = invite_tokens.event_id
      and e.host_user_id = auth.uid()
  )
  or token = public.current_invite_token()
);

create policy "invite_tokens_insert" on public.invite_tokens
for insert
with check (
  exists (
    select 1 from public.events e
    where e.id = invite_tokens.event_id
      and e.host_user_id = auth.uid()
  )
);

create policy "invite_tokens_update" on public.invite_tokens
for update
using (
  exists (
    select 1 from public.events e
    where e.id = invite_tokens.event_id
      and e.host_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events e
    where e.id = invite_tokens.event_id
      and e.host_user_id = auth.uid()
  )
);

create policy "invite_tokens_delete" on public.invite_tokens
for delete
using (
  exists (
    select 1 from public.events e
    where e.id = invite_tokens.event_id
      and e.host_user_id = auth.uid()
  )
);

create policy "rsvps_select" on public.rsvps
for select
using (
  exists (
    select 1 from public.events e
    where e.id = rsvps.event_id
      and e.host_user_id = auth.uid()
  )
  or public.is_valid_invite_token(rsvps.event_id)
);

create policy "rsvps_insert" on public.rsvps
for insert
with check (
  exists (
    select 1 from public.events e
    where e.id = rsvps.event_id
      and e.host_user_id = auth.uid()
  )
  or public.is_valid_invite_token(rsvps.event_id)
);

create policy "rsvps_update" on public.rsvps
for update
using (
  exists (
    select 1 from public.events e
    where e.id = rsvps.event_id
      and e.host_user_id = auth.uid()
  )
  or public.is_valid_invite_token(rsvps.event_id)
)
with check (
  exists (
    select 1 from public.events e
    where e.id = rsvps.event_id
      and e.host_user_id = auth.uid()
  )
  or public.is_valid_invite_token(rsvps.event_id)
);

create policy "rsvps_delete" on public.rsvps
for delete
using (
  exists (
    select 1 from public.events e
    where e.id = rsvps.event_id
      and e.host_user_id = auth.uid()
  )
);
