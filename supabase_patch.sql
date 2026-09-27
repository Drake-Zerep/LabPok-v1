-- LabPok Cloud patch
-- Necesario para que LabPok pueda reconstruir el historial
-- de versiones de un rango durante una sincronización.

drop policy if exists "Users can delete own range versions"
on public.range_versions;

create policy "Users can delete own range versions"
on public.range_versions
for delete
to authenticated
using (
  exists (
    select 1
    from public.range_tables r
    where r.id = range_versions.range_id
      and r.user_id = auth.uid()
  )
);
