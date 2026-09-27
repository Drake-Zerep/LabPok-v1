# LabPok v1

Centro personal de estudio de póker Cash 6-Max.

## Fase 2 — Preflop Lab
- Arquitectura visual negro + dorado/neón.
- Editor 13×13 reutilizable para cualquier módulo.
- OR con LJ, HJ, CO pendiente, BTN y SB.
- Plantillas de ISO RAISE.
- Plantillas de 3BET / Cold Call.
- Plantillas de VS 3BET.
- Plantillas de 4BET.
- BB DEFENSE validado disponible.
- Plantillas Blind vs Blind.
- Tablas PENDIENTES claramente separadas de las VALIDADO.
- No se inventan rangos de Fase 2: las plantillas se completarán con los datos que vayamos validando.

## Acciones personalizables
Desde **Pintar acción → ⚙ Personalizar** puedes:
- Cambiar el nombre de una acción.
- Cambiar su color.
- Crear acciones nuevas (por ejemplo MIX, JAM, COLD 4BET, etc.).
- Eliminar acciones personalizadas; las casillas que las usaban vuelven a FOLD.
- Las acciones y sus colores forman parte del backup JSON.

## Datos y backups
- Exporta un backup JSON completo.
- Importa el backup en otro equipo.
- Cada tabla mantiene historial de versiones.
- El proyecto no depende de localStorage para conservar la estrategia.

## Uso
Abre `index.html` directamente en el navegador. No requiere servidor ni dependencias.

## GitHub Pages
Sube el contenido de esta carpeta a un repositorio nuevo y activa GitHub Pages desde `Settings → Pages → Deploy from a branch`.

## Próximas fases
- Fase 3: Guía de póker completa.
- Fase 4: entrenamiento y quiz conectado a las mismas tablas.
- Fase 5: manos, leaks y evolución.
