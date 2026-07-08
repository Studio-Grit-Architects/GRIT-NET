-- Add director role to team_members
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_director boolean NOT NULL DEFAULT false;
