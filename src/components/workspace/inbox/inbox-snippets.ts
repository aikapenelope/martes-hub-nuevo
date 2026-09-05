export interface QuickSnippet {
  id: string
  shortcut: string
  label: string
  text: string
  category: 'ventas' | 'cobranza' | 'soporte' | 'info'
}

export const DEFAULT_QUICK_SNIPPETS: QuickSnippet[] = [
  {
    id: 'saludo',
    shortcut: '/saludo',
    label: 'Saludo Inicial',
    text: '¡Hola! Un gusto saludarte. ¿Cómo te encuentras hoy? ¿En qué podemos apoyarte?',
    category: 'ventas',
  },
  {
    id: 'pago',
    shortcut: '/pago',
    label: 'Datos de Pago',
    text: 'Para procesar tu pago disponemos de: Pago Móvil, Transferencia bancaria nacional y Zelle. Por favor indícanos cuál prefieres para compartirte los datos exactos.',
    category: 'cobranza',
  },
  {
    id: 'horario',
    shortcut: '/horario',
    label: 'Horario Comercial',
    text: 'Nuestro horario de atención es de Lunes a Viernes de 8:30 AM a 5:30 PM, y Sábados de 9:00 AM a 1:00 PM.',
    category: 'info',
  },
  {
    id: 'ubicacion',
    shortcut: '/ubicacion',
    label: 'Ubicación / Sede',
    text: 'Nos encontramos ubicados en nuestra sede principal. Con gusto podemos agendar una visita o coordinar una reunión presencial si lo deseas.',
    category: 'info',
  },
  {
    id: 'catalogo',
    shortcut: '/catalogo',
    label: 'Propuesta / Planes',
    text: 'Con mucho gusto te comparto nuestra propuesta de servicios. Si tienes alguna duda puntual sobre alcances, tiempos de entrega o cotización, avísanos con total confianza.',
    category: 'ventas',
  },
  {
    id: 'despedida',
    shortcut: '/despedida',
    label: 'Agradecimiento',
    text: '¡Muchas gracias por contactarnos! Quedamos a tu completa disposición para cualquier duda o requerimiento adicional.',
    category: 'soporte',
  },
]
