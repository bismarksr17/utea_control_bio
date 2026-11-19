# Área de catastro por grupo de trabajo (web)

Replica la hoja `grupos_trabajo` leyendo PostgreSQL (`catastro_iag.catastro`
y `catastro_iag.data_codigos_trabajo`).

## Configuración

1. Copia `.env.example` como `.env` en esta carpeta.
2. Edita `.env` con el host, base de datos, usuario y contraseña de PostgreSQL.
   El esquema y nombres de tablas ya tienen valores predeterminados.
3. Ejecuta `npm install` y `npm start`.
4. Abre http://127.0.0.1:3000. La navegación separa **Resumen**, **Filtros** y
   **Conexión**; desde Conexión puedes probar la configuración del `.env`.

En **Resumen > data_codigos_trabajo** puedes buscar por `cod_ca`, `nom_ca` o
ambos. Al seleccionar una coincidencia, esa misma pestaña muestra todos los
cañeros de su grupo `cod_tra`; el resumen no cambia. La pestaña de vista previa
de `catastro` fue retirada.

La aplicación lee la conexión únicamente en el servidor. Las credenciales no se
envían al navegador ni se guardan en `localStorage`. El archivo `.env` está
excluido por `.gitignore`; no lo compartas ni lo agregues al repositorio.
`.env.example` es solo una plantilla y no debe contener secretos.

## Notas

- Node.js 18 o posterior.
- El servidor escucha en `127.0.0.1` por defecto. Para cambiar el host o puerto
  web, configura `HOST` y `PORT` en `.env`.
- `DB_SSL=true` habilita TLS con validación del certificado del servidor.
- `sql.js` convierte el criterio Excel `ctrl_bio` (0/1) al booleano de PostgreSQL.
- «Siembra 2025» y «Siembra 2026» se agrupan por `cod_tra` y filtran por el año
  de `fs`, `financia = IAG` y `unidad_03` distinta de `41594`.
- «Recomendado» suma el área base y excluye las siembras que también cumplen
  esos filtros dentro de esa área base.
