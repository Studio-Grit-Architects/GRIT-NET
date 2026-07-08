-- Run this entire file in your Supabase SQL editor
-- Go to: your project > SQL Editor > New query > paste this > Run

-- Team members (auto-populated on Google sign-in)
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  role text default '',
  created_at timestamptz default now()
);

-- Projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text default '',
  color text default '#2D7A3A',
  archived boolean default false,
  created_at timestamptz default now()
);

-- Stages (belong to a project)
create table if not exists stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  position integer default 0,
  completed boolean default false,
  created_at timestamptz default now()
);

-- Time entries
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references team_members(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  stage_id uuid references stages(id) on delete cascade not null,
  hours numeric(5,2) not null check (hours > 0),
  notes text,
  date date not null,
  created_at timestamptz default now(),
  unique(member_id, project_id, stage_id, date)
);

-- Indexes for fast queries
create index if not exists idx_entries_member on time_entries(member_id);
create index if not exists idx_entries_date on time_entries(date);
create index if not exists idx_entries_project on time_entries(project_id);
create index if not exists idx_stages_project on stages(project_id);

-- Row Level Security (RLS) — we use service role key server-side so keep these open
-- but enable RLS to prevent direct client access
alter table team_members enable row level security;
alter table projects enable row level security;
alter table stages enable row level security;
alter table time_entries enable row level security;

-- Allow service role full access (our Next.js server uses this)
create policy "service role full access" on team_members for all using (true);
create policy "service role full access" on projects for all using (true);
create policy "service role full access" on stages for all using (true);
create policy "service role full access" on time_entries for all using (true);
