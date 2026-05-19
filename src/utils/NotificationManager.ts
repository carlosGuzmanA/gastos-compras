import { supabase, isSupabaseConfigured } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const NotificationManager = {
  // Verificar si las notificaciones están soportadas por el navegador
  isSupported(): boolean {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  // Obtener el estado actual del permiso
  getPermissionState(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  },

  // Solicitar permiso e inmediatamente suscribir al usuario
  async requestPermissionAndSubscribe(): Promise<PushSubscription | null> {
    if (!this.isSupported()) {
      console.warn('Las notificaciones push no están soportadas en este navegador.');
      return null;
    }

    if (!isSupabaseConfigured) {
      console.warn('Supabase no está configurado. No se puede guardar la suscripción.');
      return null;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.warn('La clave VITE_VAPID_PUBLIC_KEY no está configurada.');
      return null;
    }

    try {
      // 1. Solicitar permisos al navegador
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permiso de notificaciones denegado por el usuario.');
      }

      // 2. Obtener el registro del Service Worker activo
      const registration = await navigator.serviceWorker.ready;

      // 3. Verificar si ya existe una suscripción activa
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // 4. Si no existe, crear una nueva suscripción
        const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as any
        });
      }

      // 5. Enviar la suscripción a Supabase para almacenarla
      await this.saveSubscriptionToDatabase(subscription);

      return subscription;
    } catch (error) {
      console.error('Error al suscribirse a notificaciones push:', error);
      throw error;
    }
  },

  // Guardar la suscripción en Supabase
  async saveSubscriptionToDatabase(subscription: PushSubscription): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      const subscriptionJSON = subscription.toJSON();
      
      // Para evitar duplicados en la base de datos, buscaremos si el endpoint ya existe
      const { data: existing } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('subscription->endpoint', subscriptionJSON.endpoint)
        .maybeSingle();

      if (existing) {
        console.log('El dispositivo ya estaba suscrito en la base de datos.');
        return;
      }

      // Si no existe, lo insertamos
      const { error } = await supabase
        .from('push_subscriptions')
        .insert([{ subscription: subscriptionJSON }]);

      if (error) throw error;
      console.log('Dispositivo suscrito y guardado con éxito en Supabase.');
    } catch (error) {
      console.error('Error al guardar la suscripción en la base de datos:', error);
    }
  },

  // Desuscribir al dispositivo
  async unsubscribe(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Eliminar de Supabase primero
        const endpoint = subscription.endpoint;
        if (isSupabaseConfigured) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('subscription->endpoint', endpoint);
        }

        // Desuscribir en el navegador
        const success = await subscription.unsubscribe();
        console.log('Dispositivo desuscrito:', success);
        return success;
      }
      return false;
    } catch (error) {
      console.error('Error al desuscribirse de las notificaciones:', error);
      return false;
    }
  }
};
