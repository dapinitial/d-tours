-- Track arbitrary per-item detail (tag year, last re-sling, material, length,
-- diameter, finish, wattage, brand/model…) without rigid columns. Recursive like
-- the dossier beta — add a new spec key anytime. `subcategory` groups within a category.
alter table gear add column if not exists specs jsonb;
alter table gear add column if not exists subcategory text;
