-- Apply only in a session that has completed and verified an external pg_dump.
-- SET LOCAL app.ahs_backup_verified = 'on' must be set in the same transaction.
do $$ begin
  if current_setting('app.ahs_backup_verified', true) is distinct from 'on' then
    raise exception 'AHS migration requires a verified database backup';
  end if;
end $$;

alter table projects add column if not exists volume numeric(18,4);

update projects p set volume = chosen.volume
from (
  select distinct on (project_id) project_id, volume
  from ahs order by project_id, created_at desc, id desc
) chosen
where chosen.project_id = p.id and p.volume is null;

create function pg_temp.strip_ahs_workbook(doc jsonb, project_volume numeric)
returns jsonb language plpgsql as $$
declare
  result_doc jsonb := doc;
  snapshot jsonb := coalesce(doc->'univerWorkbook', '{}'::jsonb);
  old_sheet jsonb := snapshot#>'{sheets,ahs}';
  cells jsonb;
  row_entry record;
  col_entry record;
  resource jsonb;
  resources jsonb := '[]'::jsonb;
  mapping jsonb;
  entry record;
  retained jsonb;
  revised_resource jsonb;
  new_sheets jsonb;
  new_order jsonb;
begin
  if old_sheet is not null then
    cells := coalesce(old_sheet->'cellData', '{}'::jsonb);
    for row_entry in select key, value from jsonb_each(cells) loop
      retained := row_entry.value;
      if row_entry.key ~ '^[0-9]+$' and row_entry.key::integer < 40 then
        for col_entry in select key, value from jsonb_each(row_entry.value) loop
          if col_entry.key ~ '^[0-9]+$' and col_entry.key::integer between 4 and 15 then
            retained := retained - col_entry.key;
          end if;
        end loop;
      end if;
      cells := jsonb_set(cells, array[row_entry.key], retained);
    end loop;
    old_sheet := jsonb_set(old_sheet, '{cellData}', cells);
    old_sheet := jsonb_set(old_sheet, '{name}', to_jsonb('Evaluasi pemasok'::text));
    old_sheet := jsonb_set(old_sheet, '{id}', to_jsonb('vendor_evaluation'::text));
    old_sheet := old_sheet - 'mergeData';
    new_sheets := (snapshot->'sheets') - 'ahs';
    new_sheets := jsonb_set(new_sheets, '{vendor_evaluation}', old_sheet);
    snapshot := jsonb_set(snapshot, '{sheets}', new_sheets);
    select jsonb_agg(case when value = '"ahs"'::jsonb then '"vendor_evaluation"'::jsonb else value end)
      into new_order from jsonb_array_elements(snapshot->'sheetOrder');
    snapshot := jsonb_set(snapshot, '{sheetOrder}', coalesce(new_order, '[]'::jsonb));
  end if;
  for resource in select value from jsonb_array_elements(coalesce(snapshot->'resources','[]'::jsonb)) loop
    revised_resource := resource;
    if resource->>'name' = 'SHEET_DEFINED_NAME_PLUGIN' then
      mapping := coalesce((resource->>'data')::jsonb, '{}'::jsonb);
      retained := '{}'::jsonb;
      for entry in select key, value from jsonb_each(mapping) loop
        if coalesce(entry.value->>'comment','') !~ '^(ahs|cost|result)\.' then
          retained := retained || jsonb_build_object(entry.key,
            case when old_sheet is not null then
              jsonb_set(entry.value, '{formulaOrRefString}',
                to_jsonb(replace(entry.value->>'formulaOrRefString', '''AHS''!', '''Evaluasi pemasok''!')))
            else entry.value end);
        end if;
      end loop;
      retained := retained || jsonb_build_object('proc_project_volume',
        jsonb_build_object('id','proc_project_volume','name','proc_project_volume',
          'formulaOrRefString','''Data proyek''!$B$8','comment','project.volume'));
      revised_resource := jsonb_set(resource, '{data}', to_jsonb(retained::text));
    end if;
    resources := resources || jsonb_build_array(revised_resource);
  end loop;
  snapshot := jsonb_set(snapshot, '{resources}', resources);
  if snapshot#>'{sheets,procurement_inputs,cellData}' is not null then
    snapshot := jsonb_set(snapshot, '{sheets,procurement_inputs,cellData,7}',
      jsonb_build_object('0',jsonb_build_object('v','Volume (L)'),
                         '1',jsonb_build_object('v',project_volume)));
  end if;
  result_doc := jsonb_set(result_doc, '{univerWorkbook}', snapshot);
  result_doc := result_doc - 'businessProjection';
  result_doc := jsonb_set(result_doc, '{workbookFormulas}',
    (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
       from jsonb_each(coalesce(result_doc->'workbookFormulas','{}'::jsonb))
       where key !~ '^(ahs:|cost:)'));
  result_doc := jsonb_set(result_doc, '{sheets}',
    coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(result_doc->'sheets','[]'::jsonb))
      where value->>'key' not in ('harga_jual','konversi','poin_perhitungan')),
      '[{"key":"lembar_kerja","title":"Lembar kerja","columns":[{"key":"nilai","label":"Nilai"}],"rows":[],"merges":[],"styles":{}}]'::jsonb));
  return result_doc;
end $$;

update project_sheets ps set doc = pg_temp.strip_ahs_workbook(ps.doc, p.volume)
from projects p where p.id = ps.project_id;

drop table if exists ahs_cost_items;
drop table if exists ahs;
