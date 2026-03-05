-- Enable pgvector extension
create extension if not exists vector;

-- Context entries table
create table if not exists context_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  project text,
  repo text,
  branch text,
  pr_number int,
  title text not null,
  content text not null,
  embedding vector(768),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  vault_path text unique
);

-- Indexes
create index if not exists idx_context_entries_project on context_entries (project);
create index if not exists idx_context_entries_repo on context_entries (repo);
create index if not exists idx_context_entries_branch on context_entries (branch);
create index if not exists idx_context_entries_pr on context_entries (pr_number);
create index if not exists idx_context_entries_type on context_entries (type);

-- Vector similarity search function
create or replace function match_context_entries(
  query_embedding vector(768),
  match_count int default 10,
  filter_project text default null,
  filter_repo text default null,
  filter_type text default null
)
returns table (
  id uuid,
  type text,
  project text,
  repo text,
  branch text,
  pr_number int,
  title text,
  content text,
  metadata jsonb,
  vault_path text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ce.id,
    ce.type,
    ce.project,
    ce.repo,
    ce.branch,
    ce.pr_number,
    ce.title,
    ce.content,
    ce.metadata,
    ce.vault_path,
    ce.created_at,
    ce.updated_at,
    1 - (ce.embedding <=> query_embedding) as similarity
  from context_entries ce
  where
    ce.embedding is not null
    and (filter_project is null or ce.project = filter_project)
    and (filter_repo is null or ce.repo = filter_repo)
    and (filter_type is null or ce.type = filter_type)
  order by ce.embedding <=> query_embedding
  limit match_count;
end;
$$;
