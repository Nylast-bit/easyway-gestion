import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Inicialización del cliente de Supabase usando variables de entorno
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const configuracionPublicaDisponible = Boolean(supabaseUrl && supabaseAnonKey);
let cliente: SupabaseClient | undefined;

// Transición a API propia: no inicializar durante prerender ni usar claves privadas como fallback.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_objeto, propiedad) {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Falta configuración pública de la web');
    cliente ??= createClient(supabaseUrl, supabaseAnonKey);
    const valor = Reflect.get(cliente, propiedad);
    return typeof valor === 'function' ? valor.bind(cliente) : valor;
  },
});
