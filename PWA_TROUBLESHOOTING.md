# Guía de Notificaciones Push Desde Cero

Para garantizar que el sistema de notificaciones funcione sin errores de llaves anteriores, he generado un **par de claves VAPID completamente nuevo y limpio**. Además, he modificado la aplicación para que **fuerce y limpie** cualquier suscripción vieja del navegador de manera automática cuando intentes activar el servicio.

Sigue estos 4 sencillos pasos para aplicarlo desde cero:

---

## 🔑 Paso 1: Configurar las Nuevas Claves en Vercel

1. Entra a tu cuenta en **Vercel** y abre tu proyecto.
2. Ve a la pestaña **Settings** -> **Environment Variables**.
3. Busca la variable `VITE_VAPID_PUBLIC_KEY` y edítala (o créala si no existe).
4. Pega tu **Clave Pública VAPID** (la que generaste localmente con `npx web-push generate-vapid-keys`):
   ```text
   <TU_VAPID_PUBLIC_KEY>
   ```
5. Haz clic en **Save** (Guardar).

> ⚠️ **Nunca** pegues claves VAPID reales (especialmente la privada) en archivos versionados. Mantenlas solo en `.env` local y en los secrets de Vercel / Supabase.

---

## 🚀 Paso 2: Redesplegar en Vercel

Dado que las variables de entorno de Vite se integran en la web al compilar, es obligatorio reconstruir el sitio:
1. En Vercel, ve a la pestaña **Deployments** (Despliegues).
2. Haz clic en el botón de **los tres puntos (...)** que está a la derecha del último despliegue (el que acabo de subir hace unos instantes con el mensaje *"fix: force fresh subscription..."*).
3. Selecciona **Redeploy** (Redesplegar) y confirma. Espera unos 30 segundos a que termine.

---

## ⚡ Paso 3: Configurar las Nuevas Claves en Supabase

Abre tu terminal en la computadora en la carpeta de tu proyecto y ejecuta este comando para guardar las nuevas claves en los secretos de tus Edge Functions:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="<TU_VAPID_PUBLIC_KEY>" \
  VAPID_PRIVATE_KEY="<TU_VAPID_PRIVATE_KEY>" \
  VAPID_EMAIL="mailto:<tu-correo>"
```

> Las claves reales no se incluyen en este repositorio. Genéralas tú mismo y guárdalas solo en tu `.env` local y en los secrets de tu proveedor.

---

## 🧼 Paso 4: Limpiar Navegador y Activar

Para que no quede rastro de las configuraciones y claves rotas anteriores:

1. **En tu computadora o celular**:
   * Abre la web de tu aplicación.
   * Haz clic en el icono del candado o la configuración al lado izquierdo de la URL de la web.
   * Ve a **Configuración del sitio** (Site Settings).
   * Haz clic en **Borrar datos** y **Restablecer permisos** (Clear data / Reset permissions) para forzar al navegador a olvidar todo.
2. Abre de nuevo la web de tu aplicación.
3. El banner de notificaciones volverá a aparecer. Haz clic en **Activar**.
4. El navegador te preguntará si deseas permitir las notificaciones. Dale a **Permitir** (Allow).

¡Listo! Con esto, el navegador se registrará con la clave pública correcta y Supabase enviará los mensajes con la clave privada emparejada.
