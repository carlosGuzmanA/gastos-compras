# Guía de Resolución de Problemas: Notificaciones y Tiempo Real

Sigue esta guía paso a paso para resolver los dos detalles pendientes en tu aplicación.

---

## 🛠️ Problema 1: Resolver las Notificaciones Push

Si te sigue saliendo el mensaje *"No se pudo activar las notificaciones. Verifica los permisos del navegador"*, se debe a que tu navegador ya tiene guardada una regla que bloquea las notificaciones de ese dominio o que la clave VAPID de tu servidor no coincide con la de tu web.

### Paso 1.1: Desbloquear los permisos en tu Teléfono (Chrome)
1. Abre tu aplicación desde tu dispositivo Android.
2. Mira la barra de direcciones de Chrome arriba a la izquierda (donde escribes la URL de la web).
3. **Toca el icono de la campana tachada** (o el icono de ajustes que está al lado de la dirección).
4. Selecciona **Permisos** (o *Configuración del sitio*).
5. Cambia el estado de **Notificaciones** de *Bloqueado* a **Permitido** (o activa el interruptor).
6. Regresa a la app, recarga la página y presiona el botón **Activar** en el banner.

### Paso 1.2: Asegurar que Vercel compiló la clave pública correcta
Como modificaste la clave pública en Vercel, debes cerciorarte de que la web fue reconstruida:
1. Ve al dashboard de **Vercel**.
2. Entra en tu proyecto y ve a la pestaña **Deployments**.
3. Haz clic en los **tres puntos (...)** al lado del último despliegue.
4. Selecciona **Redeploy** (Redesplegar) y espera a que termine.
5. Abre la web en tu celular, recárgala y vuelve a presionar **Activar**.

---

## 🔄 Problema 2: Sincronización y Tiempo Real (Realtime)

Si registras una compra en el celular y no se actualiza inmediatamente en la web en tiempo real:

### Paso 2.1: Comprobar si el gasto se guardó en Supabase o es "Local"
1. Abre la app en tu celular y ve al **Historial**.
2. Mira si el gasto que agregaste tiene una etiqueta gris que dice **`Local`**:
   * **SI dice `Local`:** El celular no pudo enviar el gasto a Supabase (lo rechazó la base de datos). Ve al **Paso 2.2**.
   * **NO dice `Local`:** El gasto se guardó perfectamente en Supabase, pero la web no se entera al instante. Ve al **Paso 2.3**.

### Paso 2.2: Reparar y asegurar las políticas de escritura (RLS)
Si los gastos se quedan trabados en "Local", Supabase está rechazando la inserción. Soluciónalo ejecutando este código SQL:
1. Entra a tu panel de **Supabase**.
2. Ve al **SQL Editor** (menú izquierdo) -> **New query**.
3. Pega este bloque completo de código y haz clic en **Run**:

```sql
-- 1. Habilitar seguridad de filas (RLS)
alter table public.gastos enable row level security;

-- 2. Limpiar políticas previas para evitar conflictos
drop policy if exists "Permitir lectura de gastos" on public.gastos;
drop policy if exists "Permitir insertar gastos" on public.gastos;
drop policy if exists "Permitir actualizar gastos" on public.gastos;

-- 3. Crear políticas para acceso público con la llave Anon
create policy "Permitir lectura de gastos" on public.gastos 
  for select using (true);

create policy "Permitir insertar gastos" on public.gastos 
  for insert with check (true);

create policy "Permitir actualizar gastos" on public.gastos 
  for update using (true);
```

### Paso 2.3: Forzar el Tiempo Real en la tabla
Si los gastos se guardan (no dicen "Local") pero la web no se actualiza hasta que recargas manualmente la página, activa el motor de Realtime de Supabase gratis mediante SQL:
1. En el **SQL Editor** de Supabase, abre una nueva consulta (**New query**).
2. Pega la siguiente instrucción y haz clic en **Run**:

```sql
-- Agregar la tabla de gastos a la publicación de tiempo real de Supabase
alter publication supabase_realtime add table public.gastos;
```

---

## 🚀 Prueba de Verificación Final
Una vez completados los pasos anteriores:
1. Entra a la web desde tu computadora y selecciona un usuario (ej. *María*).
2. Entra a la web desde tu celular Android y selecciona otro (ej. *Carlos*).
3. **Agrega un gasto desde el celular**.
4. Mira la pantalla de tu computadora: **El gasto debe aparecer en el Dashboard y en el Historial al mismo segundo, sin recargar la página.**
5. Al mismo tiempo, si activaste las notificaciones en la computadora, deberías recibir una alerta en pantalla avisando del nuevo gasto.
