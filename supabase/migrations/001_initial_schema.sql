create table if not exists public.hoops_card_sets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  release_year text,
  created_at timestamptz not null default now()
);

create table if not exists public.hoops_cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.hoops_card_sets(id) on delete cascade,
  category text not null,
  subset text not null,
  card_number text not null,
  player_name text not null,
  team_name text not null,
  image_url text,
  created_at timestamptz not null default now(),
  unique (set_id, card_number, subset)
);

create table if not exists public.hoops_profiles (
  id uuid primary key,
  display_name text not null,
  discord_handle text,
  contact_url text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.hoops_profiles
  add column if not exists discord_handle text;

alter table public.hoops_profiles
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.hoops_user_cards (
  user_id uuid not null references public.hoops_profiles(id) on delete cascade,
  card_id uuid not null references public.hoops_cards(id) on delete cascade,
  owned_count integer not null default 0 check (owned_count >= 0),
  trade_count integer not null default 0 check (trade_count >= 0),
  wanted boolean not null default false,
  priority integer not null default 0 check (priority between 0 and 3),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  check (trade_count <= owned_count)
);

create index if not exists hoops_cards_set_category_idx on public.hoops_cards(set_id, category);
create index if not exists hoops_cards_player_idx on public.hoops_cards using gin (to_tsvector('simple', player_name));
create index if not exists hoops_user_cards_card_idx on public.hoops_user_cards(card_id);
create index if not exists hoops_user_cards_wanted_idx on public.hoops_user_cards(user_id, wanted);

alter table public.hoops_profiles enable row level security;
alter table public.hoops_user_cards enable row level security;

create policy "hoops profiles are publicly readable"
  on public.hoops_profiles for select
  using (true);

create policy "users can manage their hoops profile"
  on public.hoops_profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "hoops collections are publicly readable"
  on public.hoops_user_cards for select
  using (true);

create policy "users can manage their hoops collection"
  on public.hoops_user_cards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
