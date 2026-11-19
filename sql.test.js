'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { controlSql, criteriaParams, reportSql } = require('./sql');

const cfg = {
  schema: 'catastro_iag',
  tblCatastro: 'catastro',
  tblCodigos: 'data_codigos_trabajo',
};

const criteria = {
  ctrl_bio: '1',
  unidad03_min: 0,
  cultivo1: 'canha',
  cultivo2: 'semilla',
  zafra: 2026,
  unidad03_excl: 41594,
  financia: 'IAG',
  anio1: 2025,
  anio2: 2026,
};

test('maps Excel ctrl_bio 0/1 criteria to PostgreSQL booleans', () => {
  for (const value of ['0', '1']) {
    assert.equal(criteriaParams({ ...criteria, ctrl_bio: value })[0], value);
  }

  for (const sql of [reportSql(cfg), controlSql(cfg)]) {
    assert.match(sql, /ctrl_bio = \(\$1::int = 1\)/);
  }
});

test('planting columns apply finance and unit filters, and recommendation excludes overlaps', () => {
  const report = reportSql(cfg).replace(/\s+/g, ' ');
  const control = controlSql(cfg).replace(/\s+/g, ' ');

  assert.match(report, /SUM\(area\) FILTER \(WHERE sie AND y1\), 0\) AS s1/);
  assert.match(control, /SUM\(area\) FILTER \(WHERE sie AND y1\), 0\)::float8 AS s1/);
  assert.match(report, /SUM\(area\) FILTER \(WHERE sie AND y2\), 0\) AS s2/);
  assert.match(control, /SUM\(area\) FILTER \(WHERE sie AND y2\), 0\)::float8 AS s2/);

  for (const sql of [report, control]) {
    assert.match(
      sql,
      /COALESCE\(SUM\(area\) FILTER \(WHERE base\), 0\) - COALESCE\(SUM\(area\) FILTER \(WHERE base AND sie AND y1\), 0\) - COALESCE\(SUM\(area\) FILTER \(WHERE base AND sie AND y2\), 0\)/,
    );
  }
});

test('report queries no longer calculate lot counts', () => {
  for (const sql of [reportSql(cfg), controlSql(cfg)]) {
    assert.doesNotMatch(sql, /\bAS lotes\b/);
  }
});
