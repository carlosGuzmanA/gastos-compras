import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import webpush from "npm:web-push@3.6.1";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
let VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") || "mailto:negocio@compras-familia.com";
if (VAPID_EMAIL && !VAPID_EMAIL.startsWith("mailto:") && !VAPID_EMAIL.startsWith("http:") && !VAPID_EMAIL.startsWith("https:")) {
  VAPID_EMAIL = `mailto:${VAPID_EMAIL}`;
}

// Configurar detalles VAPID para Web Push
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

serve(async (req) => {
  // Manejar Preflight OPTIONS para CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const body = await req.json();
    
    // El formato del webhook de base de datos de Supabase envía los datos del registro en body.record
    const record = body.record;
    if (!record) {
      return new Response(JSON.stringify({ error: "No record found in request body" }), {
        headers: { "Content-Type": "application/json" },
        status: 400
      });
    }

    const { concepto, monto, creado_por, tipo } = record;

    // Inicializar cliente Supabase con el rol Service Role para poder leer y escribir saltando RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Las variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están definidas.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Obtener todas las suscripciones registradas
    const { data: subscriptions, error: fetchError } = await supabase
      .from("push_subscriptions")
      .select("*");

    if (fetchError) throw fetchError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No active push subscriptions found" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    }

    // Filtrar las suscripciones para no notificar al usuario que registró el gasto
    const targetSubscriptions = subscriptions.filter((sub: any) => {
      // Si la suscripción no tiene usuario asociado en el JSON, la enviamos para compatibilidad
      if (!sub.subscription || !sub.subscription.usuario) return true;
      // Excluir si coincide con el usuario creador del gasto
      return sub.subscription.usuario !== creado_por;
    });

    if (targetSubscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No recipient subscriptions found (creator excluded)" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    }

    // Configurar el payload de la notificación push
    const notificationPayload = JSON.stringify({
      title: "💸 Nuevo Gasto Registrado",
      body: `${creado_por} anotó: $${Math.round(Number(monto)).toLocaleString('es-CL')} en "${concepto}" (${tipo === 'contado' ? 'Al Contado' : 'Fiado'})`
    });

    // Enviar las notificaciones de manera asíncrona
    const pushPromises = targetSubscriptions.map((sub: any) => {
      return webpush.sendNotification(sub.subscription, notificationPayload)
        .then(() => {
          console.log(`Notificación enviada con éxito a suscripción: ${sub.id}`);
        })
        .catch(async (err: any) => {
          // Si el servidor de notificaciones devuelve un 410 (Gone) o 404 (Not Found),
          // significa que la suscripción ha expirado o ya no existe, por lo que la removemos de la BD.
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`Suscripción expirada encontrada: ${sub.id}. Removiendo de base de datos...`);
            const { error: deleteError } = await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);
            if (deleteError) {
              console.error(`Error al eliminar suscripción muerta ${sub.id}:`, deleteError);
            }
          } else {
            console.error(`Error al enviar notificación push para la suscripción ${sub.id}:`, err);
          }
        });
    });

    await Promise.all(pushPromises);

    return new Response(JSON.stringify({ success: true, notifications_sent: targetSubscriptions.length }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 200
    });
  } catch (err: any) {
    console.error("Error en Edge Function:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500
    });
  }
});
