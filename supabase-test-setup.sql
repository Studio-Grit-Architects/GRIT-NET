-- ============================================================
-- FULL SETUP — run this once in a fresh Supabase SQL Editor
-- Go to: your project > SQL Editor > New query > paste > Run
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

create table if not exists team_members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text unique not null,
  role       text default '',
  is_admin   boolean default false,
  created_at timestamptz default now()
);

create table if not exists clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text default '',
  email        text default '',
  phone        text default '',
  address      text default '',
  created_at   timestamptz default now()
);

create table if not exists projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  client_id    uuid references clients(id) on delete set null,
  client       text default '',
  code         text default '',
  color        text default '#4A8C7A',
  status       text default 'planning',
  project_type text default 'time_materials',
  archived     boolean default false,
  start_date   date,
  end_date     date,
  notes        text default '',
  created_at   timestamptz default now()
);

create table if not exists stages (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name       text not null,
  position   integer default 0,
  completed  boolean default false,
  fee        numeric(12,2) default 0,
  billable   boolean default true,
  created_at timestamptz default now()
);

create table if not exists time_entries (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references team_members(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  stage_id   uuid references stages(id) on delete cascade not null,
  hours      numeric(5,2) not null check (hours > 0),
  notes      text,
  date       date not null,
  created_at timestamptz default now(),
  unique(member_id, project_id, stage_id, date)
);

create table if not exists project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade not null,
  member_id   uuid references team_members(id) on delete cascade not null,
  hourly_rate numeric(8,2) default 0,
  created_at  timestamptz default now()
);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade not null,
  title       text not null,
  notes       text,
  status      text default 'not_started',
  assignee_id uuid references team_members(id) on delete set null,
  stage_id    uuid references stages(id) on delete set null,
  position    integer default 0,
  start_date  date,
  due_date    date,
  created_at  timestamptz default now()
);

create table if not exists planning_applications (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  application_type text not null,
  reference_number text,
  submission_date  date,
  status           text not null default 'Preparing',
  notes            text,
  created_at       timestamptz default now()
);

create table if not exists stage_deliverables (
  id         uuid primary key default gen_random_uuid(),
  stage_id   uuid references stages(id) on delete cascade not null,
  title      text not null,
  completed  boolean default false not null,
  position   integer default 0 not null,
  created_at timestamptz default now() not null
);

create table if not exists deliverable_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  riba_stage text not null,
  created_at timestamptz default now() not null
);

create table if not exists deliverable_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid references deliverable_templates(id) on delete cascade not null,
  title       text not null,
  position    integer default 0 not null,
  created_at  timestamptz default now() not null
);

create table if not exists meetings (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  recipient_email text,
  file_name       text,
  transcript      text,
  summary         text,
  email_subject   text,
  email_body      text,
  project_id      uuid references projects(id) on delete set null,
  status          text default 'done',
  created_at      timestamptz default now()
);

-- ── Indexes ─────────────────────────────────────────────────

create index if not exists idx_entries_member    on time_entries(member_id);
create index if not exists idx_entries_date      on time_entries(date);
create index if not exists idx_entries_project   on time_entries(project_id);
create index if not exists idx_stages_project    on stages(project_id);
create index if not exists idx_tasks_project     on tasks(project_id);
create index if not exists idx_pm_project        on project_members(project_id);
create index if not exists idx_planning_project  on planning_applications(project_id);

-- ── Row Level Security ───────────────────────────────────────
-- All DB access goes through the service role key server-side.
-- RLS blocks direct client access; service role bypasses it.

alter table team_members           enable row level security;
alter table clients                enable row level security;
alter table projects               enable row level security;
alter table stages                 enable row level security;
alter table time_entries           enable row level security;
alter table project_members        enable row level security;
alter table tasks                  enable row level security;
alter table planning_applications  enable row level security;
alter table stage_deliverables     enable row level security;
alter table deliverable_templates  enable row level security;
alter table deliverable_template_items enable row level security;
alter table meetings               enable row level security;

-- ── Seed data ───────────────────────────────────────────────
-- Private Residential deliverable templates

do $$
declare
  t_id uuid;
begin
  insert into deliverable_templates (name, riba_stage)
  values ('Private Residential', 'Stage 1 — Preparation & Brief')
  returning id into t_id;

  insert into deliverable_template_items (template_id, title, position)
  values
    (t_id, 'Site appraisal', 0),
    (t_id, 'Site report', 1),
    (t_id, 'Programme costs', 2),
    (t_id, 'Project brief', 3),
    (t_id, 'Procurement / consultant engagements', 4),
    (t_id, 'Sustainability', 5),
    (t_id, 'Bid document', 6);
end $$;
