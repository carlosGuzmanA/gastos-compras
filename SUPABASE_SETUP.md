# Guía de Configuración: Supabase, Base de Datos y Notificaciones Push

Sigue estos pasos detallados para configurar la infraestructura gratuita de la aplicación en **Supabase** y habilitar el sistema de notificaciones automáticas gratuitas.

---

## Paso 1: Crear tu Cuenta y Proyecto en Supabase

1. Ve a [Supabase.com](https://supabase.com) y regístrate con tu cuenta de GitHub o correo electrónico (es 100% gratuito).
2. Haz clic en **New Project** (Nuevo Proyecto).
3. Configura los datos de tu proyecto:
   - **Name**: `Control de Gastos Negocio`
   - **Database Password**: Introduce una contraseña segura y **guárdala bien**.
   - **Region**: Selecciona la más cercana a tu país (ej. *South America* o *East US*).
   - **Pricing Plan**: Selecciona **Free** (Capa Gratuita).
4. Haz clic en **Create new project** y espera un par de minutos a que la base de datos se inicialice.

---

## Paso 2: Crear las Tablas en la Base de Datos (SQL)

Una vez que tu proyecto esté listo:
1. En el panel lateral izquierdo de Supabase, ve al **SQL Editor** (icono con el símbolo `SQL`).
2. Haz clic en **New query** (Nueva consulta).
3. Pega el siguiente script de creación de tablas y políticas de seguridad (RLS):

```sql
-- 1. Habilitar extensiones necesarias
create extension if not exists "uuid-ossp";

-- 2. Crear la tabla de Gastos
create table public.gastos (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  concepto text not null,
  monto numeric(12,2) not null,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('contado', 'fiado')),
  proveedor text,
  pagado boolean default false not null,
  creado_por text not null
);

-- 3. Crear la tabla para almacenar Suscripciones Push
create table public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  subscription jsonb not null
);

-- 4. Habilitar seguridad a nivel de filas (RLS) para proteger los datos
alter table public.gastos enable row level security;
alter table public.push_subscriptions enable row level security;

-- 5. Crear políticas para la tabla 'gastos' (Acceso público mediante llave Anon del cliente)
create policy "Permitir lectura de gastos" on public.gastos
  for select using (true);

create policy "Permitir insertar gastos" on public.gastos
  for insert with check (true);

create policy "Permitir actualizar gastos" on public.gastos
  for update using (true);

-- 6. Crear políticas para la tabla 'push_subscriptions'
create policy "Permitir lectura de suscripciones" on public.push_subscriptions
  for select using (true);

create policy "Permitir registrar suscripciones" on public.push_subscriptions
  for insert with check (true);

create policy "Permitir eliminar suscripciones" on public.push_subscriptions
  for delete using (true);
```

4. Haz clic en el botón **Run** (Ejecutar) arriba a la derecha. Debería aparecer un mensaje de éxito: `Success. No rows returned.`

---

## Paso 3: Generar las Llaves VAPID (Notificaciones Push)

Las llaves VAPID son claves criptográficas que garantizan que solo tú puedas enviar notificaciones push a tus usuarios registrados.

Puedes generarlas abriendo una terminal en la carpeta del proyecto y ejecutando:
```bash
npx web-push generate-vapid-keys
```

El comando te devolverá algo similar a esto:
```text
=======================================
Public Key:
BEl39...[Una cadena muy larga de texto]...

Private Key:
-mG_...[Otra cadena larga de texto]...
=======================================
```
*Guarda estas llaves en un bloc de notas temporal.*

---

## Paso 4: Configurar el Entorno del Cliente (.env)

1. En la raíz de tu proyecto local, crea un archivo llamado `.env` (o `.env.local`).
2. Añade las siguientes variables de entorno sustituyendo con tus datos de Supabase y las claves VAPID generadas en el paso anterior:

```env
# URL de tu proyecto en Supabase (Se encuentra en Project Settings -> API)
VITE_SUPABASE_URL=https://tu-id-de-proyecto.supabase.co

# Llave pública Anon (Se encuentra en Project Settings -> API)
VITE_SUPABASE_ANON_KEY=tu-llave-anon-publica

# Llave VAPID pública que generaste en el paso 3
VITE_VAPID_PUBLIC_KEY=tu-llave-vapid-publica
```

*Al guardar este archivo y reiniciar el servidor local, la aplicación saldrá automáticamente del "Modo Demo" y se conectará en tiempo real a tu base de datos.*

---

## Paso 5: Configurar y Desplegar la Edge Function para Notificaciones

Supabase permite desplegar funciones de servidor gratuitas (Edge Functions) en TypeScript/Deno. Desplegaremos la función que lee las suscripciones y envía las alertas push.

1. Instala la herramienta de línea de comandos de Supabase en tu computadora (requiere Docker instalado para desarrollo local, pero para **desplegar directamente** no es obligatorio):
   ```bash
   npm install -g supabase
   ```
2. Inicia sesión en Supabase desde la terminal:
   ```bash
   supabase login
   ```
   *(Sigue las instrucciones en el navegador para autorizar la terminal).*
3. Vincula la terminal local con tu proyecto de Supabase:
   ```bash
   supabase link --project-ref tu-id-de-proyecto
   ```
   *(El ID de proyecto se encuentra en la URL de tu panel de Supabase: `https://supabase.com/dashboard/project/tu-id-de-proyecto`).*
4. Guarda las claves secretas de la Edge Function en Supabase:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY="tu-llave-vapid-publica" VAPID_PRIVATE_KEY="tu-llave-vapid-privada" VAPID_EMAIL="mailto:tu-correo@negocio.com"
   ```
5. Despliega la Edge Function:
   ```bash
   supabase functions deploy send-push --no-verify-jwt
   ```

---

## Paso 6: Configurar el Webhook de la Base de Datos

Para que las notificaciones se envíen solas cada vez que alguien registra un gasto, configuraremos un webhook en Supabase:

1. En tu panel de Supabase, ve a la sección **Database** (icono de base de datos) en el menú izquierdo.
2. Haz clic en **Webhooks** (o *Database Webhooks*).
3. Haz clic en **Create Webhook** (Crear Webhook) y configúralo de la siguiente manera:
   - **Name**: `send_push_notification`
   - **Table**: `gastos`
   - **Events**: Marca únicamente **Insert** (esto asegura que se envíe al añadir un nuevo gasto).
   - **Type of Webhook**: Selecciona **Supabase Edge Functions**.
   - **Method**: `POST`
   - **Edge Function**: Selecciona `send-push` de la lista desplegable.
   - **Timeout**: Dejar por defecto (10000ms).
4. Haz clic en **Save** (Guardar).

¡Listo! A partir de ahora, cada vez que un usuario agregue un gasto, la base de datos disparará automáticamente la función Edge en milisegundos, enviando notificaciones push a todos los teléfonos móviles o navegadores suscritos de manera gratuita y automática.
