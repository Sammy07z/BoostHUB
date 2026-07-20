1| # Boost Hub
2| 
3| Hub para que tu equipo registre encargos de boosting, calcule el pago neto automáticamente y suba las capturas de antes/después. Corre 100% en Cloudflare (Pages + Functions + D1 + R2) — no nece[...]
4| 
5| ## Qué incluye
6| 
7| - **Landing**: cada amigo elige su nombre de una lista (sin contraseña).
8| - **Dashboard por persona**: formulario para registrar un encargo (oferta, ingreso, descuento → total neto calculado solo), lista de sus encargos, subida de capturas antes/después, marcar como c[...]
9| - **Resumen / Ranking**: total ganado por cada quien y total general del hub.
10| 
11| ## Estructura del proyecto
12| 
13| ```
14| boost-hub/
15| ├── wrangler.toml          # config de Cloudflare (D1 + R2)
16| ├── schema.sql              # esquema de la base de datos + amigos iniciales
17| ├── public/                 # frontend (HTML/CSS/JS puro, sin build)
18| │   ├── index.html
19| │   ├── style.css
20| │   └── app.js
21| └── functions/api/          # backend (Cloudflare Pages Functions)
22|     ├── friends.js
23|     ├── resumen.js
24|     ├── img/[key].js
25|     └── encargos/
26|         ├── index.js
27|         └── [id]/
28|             ├── index.js
29|             └── captura.js
30| ```
31| 
32| ## Despliegue paso a paso en dash.cloudflare.com
33| 
33| ### 1. Crear la base de datos (D1)
34| 
35| 1. En el dashboard de Cloudflare, ve a **Storage & Databases → D1 SQL Database → Create**.
36| 2. Nómbrala `boost-hub-db` y créala.
37| 3. Entra a la base recién creada → pestaña **Console** → pega el contenido completo de `schema.sql` y ejecútalo. Esto crea las tablas y mete a Trolo, Abramn12, Rafapene, Kin, 7th y Chubby c[...]
38|    - ⚠️ La consola de D1 junta todo lo que pegas en una sola línea, así que si el archivo tuviera comentarios `--` se comerían el resto del script (por eso `schema.sql` no lleva ninguno). S[...]
39| 4. Copia el **Database ID** que aparece en la vista general — lo necesitas en el paso 3.
40| 
41| ### 2. Crear el bucket de capturas (R2)
42| 
43| 1. Ve a **R2 Object Storage → Create bucket**.
44| 2. Nómbralo `boost-hub-capturas` (o el nombre que prefieras) y créalo. No necesita acceso público: las imágenes se sirven a través del propio backend (`/api/img/:key`).
45| 
46| ### 3. Conectar los nombres en `wrangler.toml`
47| 
47| Abre `wrangler.toml` y reemplaza:
48| - `database_id` con el ID que copiaste en el paso 1.
49| - `bucket_name` si le pusiste otro nombre al bucket en el paso 2.
50| 
51| ### 4. Crear el proyecto de Pages
52| 
53| **Opción A — desde el dashboard (arrastrar carpeta):**
54| 1. **Workers & Pages → Create → Pages → Upload assets**.
55| 2. Sube la carpeta `public/` cuando te la pida (esto sube el frontend).
56| 3. Una vez creado el proyecto, ve a **Settings → Functions** y confirma que las Functions de la carpeta `functions/` se detectaron (Pages las reconoce automáticamente si subes el proyecto compl[...]
57| 
58| **Opción B — recomendada, conectando un repo de Git:**
59| 1. Sube esta carpeta completa (`boost-hub/`) a un repositorio de GitHub.
60| 2. **Workers & Pages → Create → Pages → Connect to Git**, elige el repo.
60| 3. Build settings: framework preset **None**, build command **(vacío)**, build output directory **`public`**.
61| 4. Despliega.
62| 
63| ### 5. Enlazar D1 y R2 al proyecto de Pages
64| 
64| 1. Entra al proyecto ya creado → **Settings → Bindings → Add binding**.
65| 2. Agrega un binding tipo **D1 database**: variable name `DB`, selecciona `boost-hub-db`.
66| 3. Agrega un binding tipo **R2 bucket**: variable name `CAPTURES`, selecciona tu bucket.
67| 4. Guarda y vuelve a desplegar (**Deployments → Retry deployment** o haz un nuevo push si usaste Git).
68| 
69| ### 6. Listo
70| 
71| Abre la URL que te dio Cloudflare (`https://boost-hub.pages.dev` o como la hayas nombrado) y compártela con tu equipo. Cada quien entra, elige su nombre, registra sus encargos y sube sus capturas[...]
72| 
73| ## Notas
74| 
74| - Los descuentos se guardan como fracción (`0.2` = 20%), igual que en tu Excel original.
75| - El botón **"+ Agregar invocador"** en la landing te deja sumar amigos nuevos sin tocar la base de datos a mano.
76| - Las capturas se guardan en R2 (no en la base de datos), así que no hay límite práctico de tamaño de imagen a diferencia de guardarlas como texto/base64.
77| - Si en algún momento quieres agregar login real con contraseña, lo más simple en Cloudflare es **Cloudflare Access** apuntando al dominio del proyecto — no requiere tocar el código.