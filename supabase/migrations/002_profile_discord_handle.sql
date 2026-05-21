alter table public.hoops_profiles
  add column if not exists discord_handle text;

alter table public.hoops_profiles
  add column if not exists updated_at timestamptz not null default now();
