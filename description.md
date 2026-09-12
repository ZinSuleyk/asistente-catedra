# Classroom Compass

Classroom Compass es un asistente para docentes que convierte el material de una clase y trabajos de estudiantes en un diagnostico instruccional accionable. La aplicacion permite detectar patrones de comprension, identificar conceptos que necesitan refuerzo y generar recursos de seguimiento para la proxima intervencion pedagogica.

## Que hace

- Analiza una leccion cargada por el docente junto con entregas de estudiantes.
- Resume el dominio general de la clase y el nivel por objetivo de aprendizaje.
- Senala la principal misconception o dificultad comun detectada en los trabajos.
- Propone el siguiente movimiento didactico recomendado.
- Permite consultar un chat contextual basado en el diagnostico de la sesion.
- Genera materiales descargables: presentacion PPTX, resumen de audio MP3, ejercicios en Markdown y plan de repaso en calendario ICS.

## Flujo de uso

1. El docente carga el material de la clase, como PDF, PowerPoint, TXT o Markdown.
2. Luego agrega trabajos de estudiantes en PDF, TXT o Markdown.
3. La aplicacion envia los archivos al servidor local para procesarlos con OpenAI.
4. El servidor devuelve un diagnostico estructurado con fortalezas, brechas y recomendaciones.
5. Desde el mismo diagnostico, el docente puede generar materiales adaptados a la necesidad detectada.

Tambien existe un modo demo con una leccion y tres entregas de ejemplo. Ese modo no requiere credenciales y sirve para recorrer la interfaz sin llamar a la API.

## Arquitectura

La aplicacion usa una interfaz web estatica servida por un backend Node.js con Express. El navegador no llama directamente a OpenAI: sube los archivos al servidor de mismo origen, y el servidor realiza las solicitudes necesarias.

Componentes principales:

- `index.html`: estructura de la interfaz.
- `styles.css`: estilos visuales del workspace docente.
- `app.js`: logica del cliente, carga de archivos, estado de la UI y descargas.
- `server.js`: API Express, integracion con OpenAI, generacion de archivos y sesiones en memoria.

## Requisitos

- Node.js 20 o superior.
- Dependencias instaladas con `npm install`.
- `OPENAI_API_KEY` configurada en `.env` para usar analisis en vivo y generacion de recursos.

Para ejecutar localmente:

```bash
npm run dev
```

Luego abrir:

```text
http://localhost:3000
```

## Privacidad y datos

La aplicacion renombra los archivos enviados a OpenAI con nombres neutrales como `lesson` y `student-1`, pero no elimina identificadores que esten dentro del contenido del documento. Antes de subir material real, se recomienda quitar nombres de estudiantes y otros datos sensibles cuando sea posible.

Las respuestas del modelo se solicitan con almacenamiento desactivado y los archivos temporales subidos a OpenAI se eliminan despues del procesamiento. Por defecto, los diagnosticos quedan solo en memoria del servidor y desaparecen al reiniciarlo. Opcionalmente se puede configurar Supabase para persistir sesiones.

## Deploy

Este proyecto necesita ejecutarse como servicio Node.js porque incluye rutas API y manejo server-side de archivos. No es compatible con hosting puramente estatico. Para produccion se recomienda agregar autenticacion, limites de subida, control de acceso por docente o institucion y politicas claras para tratamiento de datos educativos.
