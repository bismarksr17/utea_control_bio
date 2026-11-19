'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const { Pool } = require('pg');
const { qual, criteriaParams, reportSql, controlSql } = require('./sql');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1'; // solo esta computadora por defecto
const PUBLIC = path.join(__dirname, 'public');

function makePool(c) {
  return new Pool({
    host: c.host, port: c.port, database: c.database,
    user: c.user, password: c.password,
    ssl: c.ssl ? { rejectUnauthorized: true } : false,
    max: 2, connectionTimeoutMillis: 8000, statement_timeout: 120000,
  });
}
async function withDb(fn) {
  const cfg = cfgOf();
  const pool = makePool(cfg);
  try { return await fn(pool, cfg); } finally { await pool.end().catch(() => {}); }
}
function readBody(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (e) { rej(e); } });
  });
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function cfgOf() {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER'];
  const missing = required.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) {
    throw new Error(`Completa ${missing.join(', ')} en el archivo .env`);
  }

  const port = Number(process.env.DB_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT debe ser un puerto válido (1-65535)');
  }

  return {
    host: process.env.DB_HOST,
    port,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true',
    schema: process.env.DB_SCHEMA || 'catastro_iag',
    tblCatastro: process.env.DB_TABLE_CATASTRO || 'catastro',
    tblCodigos: process.env.DB_TABLE_CODIGOS || 'data_codigos_trabajo',
  };
}

const routes = {
  '/api/report': async (b) => withDb(async (p, cfg) => {
    const prm = criteriaParams(b.criteria);
    const [rows, ctl] = await Promise.all([
      p.query(reportSql(cfg), prm), p.query(controlSql(cfg), prm)]);
    return { rows: rows.rows, control: ctl.rows[0] };
  }),

  '/api/codigos/search': async (b) => withDb(async (p, cfg) => {
    const codCa = String(b.cod_ca || '').trim();
    const nomCa = String(b.nom_ca || '').trim();
    if (!codCa && !nomCa) throw new Error('Ingresa un código cañero o un nombre para buscar');

    const filters = [];
    const params = [];
    if (codCa) {
      params.push(`%${codCa}%`);
      filters.push(`"cod_ca"::text ILIKE $${params.length}`);
    }
    if (nomCa) {
      params.push(`%${nomCa}%`);
      filters.push(`"nom_ca" ILIKE $${params.length}`);
    }

    const table = qual(cfg.schema, cfg.tblCodigos);
    const where = filters.join(' AND ');
    const [matches, count] = await Promise.all([
      p.query(
        `SELECT "cod_ca", "nom_ca", "cod_tra" FROM ${table}
         WHERE ${where} ORDER BY "nom_ca", "cod_ca", "cod_tra" LIMIT 5000`,
        params),
      p.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE ${where}`, params),
    ]);
    return { rows: matches.rows, total: count.rows[0].total };
  }),

  '/api/codigos/group': async (b) => withDb(async (p, cfg) => {
    const codTra = String(b.cod_tra || '').trim();
    if (!codTra) throw new Error('El código de grupo de trabajo es obligatorio');

    const table = qual(cfg.schema, cfg.tblCodigos);
    const result = await p.query(
      `SELECT "cod_ca", "nom_ca", "cod_tra" FROM ${table}
       WHERE "cod_tra"::text = $1 ORDER BY "nom_ca", "cod_ca"`,
      [codTra],
    );
    return { rows: result.rows };
  }),

};

async function testConnection() {
  return withDb(async (p, cfg) => {
    const [r, t] = await Promise.all([
      p.query('select current_database() db'),
      p.query(
        `select table_name from information_schema.tables where table_schema=$1 and table_name = any($2)`,
        [cfg.schema, [cfg.tblCatastro, cfg.tblCodigos]]),
    ]);
    return {
      ok: true,
      db: r.rows[0].db,
      tablas: t.rows.map((x) => x.table_name),
      esperadas: [cfg.tblCatastro, cfg.tblCodigos],
    };
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/test') {
      return send(res, 200, await testConnection());
    }
    if (req.method === 'POST' && routes[req.url]) {
      return send(res, 200, await routes[req.url](await readBody(req)));
    }
    if (req.method === 'GET') {
      const f = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
      const file = path.join(PUBLIC, path.normalize(f));
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404); return res.end('No encontrado'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404); res.end();
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, HOST, () => console.log(`Listo: http://${HOST}:${PORT}`));
