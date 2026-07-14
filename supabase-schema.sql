-- ─────────────────────────────────────────────────────────────────────────────
-- Prints Galore · Supabase database schema
-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO RUN:
--   1. Go to https://supabase.com and create a free project
--   2. In your project dashboard click "SQL Editor" in the left sidebar
--   3. Click "New query", paste ALL of this file, click "Run"
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Customer profiles (extends built-in auth.users) ──────────────────────────
create table if not exists profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  full_name     text,
  phone         text,
  company       text,
  address_line1 text,
  address_line2 text,
  city          text,
  postcode      text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Quote requests (submitted via the Get a Quote form) ──────────────────────
create table if not exists quotes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  name          text not null,
  email         text not null,
  phone         text,
  service       text,
  quantity      text,
  deadline      text,
  brief         text,
  status        text default 'pending',   -- pending | quoted | paid | cancelled
  quoted_amount numeric(10,2),
  quote_notes   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Orders (created when Stripe confirms payment) ─────────────────────────────
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null,
  quote_id          uuid references quotes(id) on delete set null,
  stripe_session_id text,
  amount_paid       numeric(10,2),
  status            text default 'paid',   -- paid | in_production | dispatched | delivered
  customer_email    text,
  notes             text,
  tracking_number   text,
  estimated_delivery text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ── Row-Level Security (users can only see their own data) ───────────────────
alter table profiles enable row level security;
alter table quotes   enable row level security;
alter table orders   enable row level security;

-- Profiles
create policy "Users manage own profile"
  on profiles for all
  using      (auth.uid() = id)
  with check (auth.uid() = id);

-- Quotes: logged-in users see their own; anyone can submit a new one
create policy "Users see own quotes"
  on quotes for select
  using (auth.uid() = user_id);

create policy "Anyone can submit a quote"
  on quotes for insert
  with check (true);

create policy "Users update own quotes"
  on quotes for update
  using (auth.uid() = user_id);

-- Orders: users see their own only
create policy "Users see own orders"
  on orders for select
  using (auth.uid() = user_id);

-- ── Auto-create profile row when a new user signs up ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
