'use strict';
// Construye las consultas para la hoja "grupos_trabajo".

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name) {
  if (!IDENT.test(String(name || ''))) throw new Error('Nombre inválido: ' + name);
  return '"' + name + '"';
}
function qual(schema, table) { return ident(schema) + '.' + ident(table); }

// params: [1]ctrl_bio [2]unidad_03 > [3]cultivo1 [4]cultivo2 [5]zafra
//         [6]unidad_03 excluida [7]financia [8]año siembra 1 [9]año siembra 2
function criteriaParams(c) {
  return [
    String(c.ctrl_bio), Number(c.unidad03_min), String(c.cultivo1), String(c.cultivo2),
    Number(c.zafra), Number(c.unidad03_excl), String(c.financia),
    Number(c.anio1), Number(c.anio2),
  ];
}

const CTE = (cat) => `
c AS (
  SELECT cod_tra, area, fs,
    (cultivo IN ($3::text, $4::text) AND ctrl_bio = ($1::int = 1)
       AND unidad_03 > $2::numeric AND zafra = $5::int) AS base,
    (unidad_03 IS DISTINCT FROM $6::numeric AND financia = $7::text) AS sie
  FROM ${cat}
),
f AS (
  SELECT cod_tra, area, base, sie,
    (fs >= make_date($8::int,1,1) AND fs < make_date($8::int+1,1,1)) AS y1,
    (fs >= make_date($9::int,1,1) AND fs < make_date($9::int+1,1,1)) AS y2
  FROM c
)`;

const AGG = `
  COALESCE(SUM(area) FILTER (WHERE sie AND y1), 0)                AS s1,
  COALESCE(SUM(area) FILTER (WHERE sie AND y2), 0)                AS s2,
  COALESCE(SUM(area) FILTER (WHERE base), 0)
    - COALESCE(SUM(area) FILTER (WHERE base AND sie AND y1), 0)
    - COALESCE(SUM(area) FILTER (WHERE base AND sie AND y2), 0)   AS rec`;

function reportSql(cfg) {
  const cat = qual(cfg.schema, cfg.tblCatastro);
  const cod = qual(cfg.schema, cfg.tblCodigos);
  return `
WITH ${CTE(cat)},
agg AS (SELECT cod_tra, ${AGG} FROM f GROUP BY cod_tra),
grp AS (SELECT DISTINCT cod_tra FROM ${cod}),
del AS (SELECT DISTINCT ON (cod_tra) cod_tra, nom_ca FROM ${cod}
        WHERE delegado = 'DELEGADO' ORDER BY cod_tra, id)
SELECT g.cod_tra,
       COALESCE(d.nom_ca, 'Sin delegado') AS delegado,
       COALESCE(a.s1, 0)::float8          AS s1,
       COALESCE(a.s2, 0)::float8          AS s2,
       COALESCE(a.rec, 0)::float8         AS rec
FROM grp g
LEFT JOIN del d ON d.cod_tra = g.cod_tra
LEFT JOIN agg a ON a.cod_tra = g.cod_tra
ORDER BY g.cod_tra`;
}

function controlSql(cfg) {
  const cat = qual(cfg.schema, cfg.tblCatastro);
  return `WITH ${CTE(cat)}
SELECT COALESCE(SUM(area) FILTER (WHERE sie AND y1), 0)::float8 AS s1,
       COALESCE(SUM(area) FILTER (WHERE sie AND y2), 0)::float8 AS s2,
       (COALESCE(SUM(area) FILTER (WHERE base), 0)
         - COALESCE(SUM(area) FILTER (WHERE base AND sie AND y1), 0)
         - COALESCE(SUM(area) FILTER (WHERE base AND sie AND y2), 0))::float8 AS rec
FROM f`;
}

module.exports = { ident, qual, criteriaParams, reportSql, controlSql };
