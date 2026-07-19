# Boost Hub

Hub para que tu equipo registre encargos de boosting, calcule el pago neto automáticamente y suba las capturas de antes/después. Corre 100% en Cloudflare (Pages + Functions + D1 + R2) — no necesitas servidor propio.

## Qué incluye

- **Landing**: cada amigo elige su nombre de una lista (sin contraseña).
- **Dashboard por persona**: formulario para registrar un encargo (oferta, ingreso, descuento → total neto calculado solo), lista de sus encargos, subida de capturas antes/después, marcar como completado, eliminar.
- **Resumen / Ranking**: total ganado por cada quien y total general del hub.

## Estructura del proyecto

```
boost-hub/
├── wrangler.toml          # config de Cloudflare (D1 + R2)
├── schema.sql              # esquema de la base de datos + amigos iniciales
├── public/                 # frontend (HTML/CSS/JS puro, sin build)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── functions/api/          # backend (Cloudflare Pages Functions)
    ├── friends.js
    ├── resumen.js
    ├── img/[key].js
    └── encargos/
        ├── index.js
        └── [id]/
            ├── index.js
            └── captura.js
```

## Despliegue paso a paso en dash.cloudflare.com

### 1. Crear la base de datos (D1)

1. En el dashboard de Cloudflare, ve a **Storage & Databases → D1 SQL Database → Create**.
2. Nómbrala `boost-hub-db` y créala.
3. Entra a la base recién creada → pestaña **Console** → pega el contenido completo de `schema.sql` y ejecútalo. Esto crea las tablas y mete a Trolo, Abramn12, Rafapene, Kin, 7th y Chubby como amigos iniciales.
   - ⚠️ La consola de D1 junta todo lo que pegas en una sola línea, así que si el archivo tuviera comentarios `--` se comerían el resto del script (por eso `schema.sql` no lleva ninguno). Si más adelante editas el archivo, no le agregues comentarios `--`.
4. Copia el **Database ID** que aparece en la vista general — lo necesitas en el paso 3.

### 2. Crear el bucket de capturas (R2)

1. Ve a **R2 Object Storage → Create bucket**.
2. Nómbralo `boost-hub-capturas` (o el nombre que prefieras) y créalo. No necesita acceso público: las imágenes se sirven a través del propio backend (`/api/img/:key`).

### 3. Conectar los nombres en `wrangler.toml`

Abre `wrangler.toml` y reemplaza:
- `database_id` con el ID que copiaste en el paso 1.
- `bucket_name` si le pusiste otro nombre al bucket en el paso 2.

### 4. Crear el proyecto de Pages

**Opción A — desde el dashboard (arrastrar carpeta):**
1. **Workers & Pages → Create → Pages → Upload assets**.
2. Sube la carpeta `public/` cuando te la pida (esto sube el frontend).
3. Una vez creado el proyecto, ve a **Settings → Functions** y confirma que las Functions de la carpeta `functions/` se detectaron (Pages las reconoce automáticamente si subes el proyecto completo por Git; con "Upload assets" sube también la carpeta `functions/` en la misma subida si el dashboard te lo permite, o usa la Opción B).

**Opción B — recomendada, conectando un repo de Git:**
1. Sube esta carpeta completa (`boost-hub/`) a un repositorio de GitHub.
2. **Workers & Pages → Create → Pages → Connect to Git**, elige el repo.
3. Build settings: framework preset **None**, build command **(vacío)**, build output directory **`public`**.
4. Despliega.

### 5. Enlazar D1 y R2 al proyecto de Pages

1. Entra al proyecto ya creado → **Settings → Bindings → Add binding**.
2. Agrega un binding tipo **D1 database**: variable name `DB`, selecciona `boost-hub-db`.
3. Agrega un binding tipo **R2 bucket**: variable name `CAPTURES`, selecciona tu bucket.
4. Guarda y vuelve a desplegar (**Deployments → Retry deployment** o haz un nuevo push si usaste Git).

### 6. Listo

Abre la URL que te dio Cloudflare (`https://boost-hub.pages.dev` o como la hayas nombrado) y compártela con tu equipo. Cada quien entra, elige su nombre, registra sus encargos y sube sus capturas.

## Notas

- Los descuentos se guardan como fracción (`0.2` = 20%), igual que en tu Excel original.
- El botón **"+ Agregar invocador"** en la landing te deja sumar amigos nuevos sin tocar la base de datos a mano.
- Las capturas se guardan en R2 (no en la base de datos), así que no hay límite práctico de tamaño de imagen a diferencia de guardarlas como texto/base64.
- Si en algún momento quieres agregar login real con contraseña, lo más simple en Cloudflare es **Cloudflare Access** apuntando al dominio del proyecto — no requiere tocar el código.
