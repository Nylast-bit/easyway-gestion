// Definición de las entidades principales basadas en la BD
export interface Client {
    id?: number;
    nombre: string;
    telefono: string;
    correo: string;
    created_at?: string;
}

export interface Technician {
    id?: number;
    nombre: string;
    telefono: string;
    correo: string;
}

export interface Vehicle {
    id?: number;
    cliente_id: number;
    marca: string;
    modelo: string;
    año: number | null;
    placa: string | null;
    chasis: string | null;
    color: string;
}

export interface Gps {
    id?: number;
    imei: string;
    modelo?: string;
    estado: 'Disponible' | 'Instalado' | 'Retirado' | 'Dañado';
}

export interface Simcard {
    id?: number;
    numero: string;
    fecha_compra?: string | null;
    fecha_vencimiento?: string | null;
    estado: 'Disponible' | 'Asignada' | 'Suspendida' | 'Vencida';
}
