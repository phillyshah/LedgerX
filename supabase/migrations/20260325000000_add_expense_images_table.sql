-- Create expense_images table for multiple images per transaction
create table if not exists expense_images (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  image_path text not null,
  image_mime text,
  image_width integer,
  image_height integer,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Index for fast lookup by expense
create index expense_images_expense_id_idx on expense_images(expense_id);

-- Migrate existing single-image data from expenses table
insert into expense_images (expense_id, image_path, image_mime, image_width, image_height, display_order)
select id, image_path, image_mime, image_width, image_height, 0
from expenses
where image_path is not null;

-- Enable RLS
alter table expense_images enable row level security;

-- RLS policy: users can view images for expenses in their households
create policy "Users can view images for their household expenses"
  on expense_images for select
  using (
    exists (
      select 1 from expenses e
      join household_members hm on hm.household_id = e.household_id
      where e.id = expense_images.expense_id
        and hm.user_id = auth.uid()
    )
  );

-- RLS policy: users can insert images for expenses in their households
create policy "Users can insert images for their household expenses"
  on expense_images for insert
  with check (
    exists (
      select 1 from expenses e
      join household_members hm on hm.household_id = e.household_id
      where e.id = expense_images.expense_id
        and hm.user_id = auth.uid()
    )
  );

-- RLS policy: users can delete images for expenses in their households
create policy "Users can delete images for their household expenses"
  on expense_images for delete
  using (
    exists (
      select 1 from expenses e
      join household_members hm on hm.household_id = e.household_id
      where e.id = expense_images.expense_id
        and hm.user_id = auth.uid()
    )
  );

-- Admin override policies
create policy "Admins can view all expense images"
  on expense_images for select
  using (
    exists (
      select 1 from user_roles where user_id = auth.uid() and is_admin = true
    )
  );

create policy "Admins can insert expense images"
  on expense_images for insert
  with check (
    exists (
      select 1 from user_roles where user_id = auth.uid() and is_admin = true
    )
  );

create policy "Admins can delete expense images"
  on expense_images for delete
  using (
    exists (
      select 1 from user_roles where user_id = auth.uid() and is_admin = true
    )
  );
