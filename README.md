# LabPok v1 — Firebase Cloud · Phase 6

LabPok conectado a Firebase Authentication + Cloud Firestore.

## Datos
El estado completo `labpok.v1` se guarda en `users/{UID}` para esta primera migración.

## Configuración
1. Authentication → Método de acceso → Email/Password activado.
2. Authentication → Configuración → Dominios autorizados → `drake-zerep.github.io`.
3. Firestore → Rules → publicar `firestore.rules`.
4. GitHub Pages → subir el contenido de esta carpeta.

## Migración
Inicia sesión y usa Datos & Backups → Cargar backup. Selecciona `LabPok_v1_Backup_2026-09-27.json`.

## Phase 6
- Training muestra combinaciones explícitas como cartas y etiqueta SUITED/OFFSUIT/PAIR.
- Nuevo módulo Manos / Leaks con cola de revisión y plan de corrección.


## Fase 6 — Postflop Lab
- Drill de texturas y sizings basado en la guía actual de LabPok.
- Biblioteca K72r, J96 two-tone, 987 two-tone, 772 y monotone.
- Registro persistente de spots de estudio.
- Puntuación postflop guardada en Firebase.
- No pretende sustituir solver/GTO: es una base de estudio y revisión.


## Fase 7 — Winamax 5-MAX
- Perfil independiente de Cash 5-MAX.
- Posiciones: UTG, CO, BTN, SB, BB.
- Plantillas PENDIENTES para RFI, BB Defense, 3BET/CC, VS 3BET, 4BET e ISO RAISE.
- No se convierten automáticamente rangos 6-MAX en rangos 5-MAX.
- El objetivo de esta fase es cargar y validar los rangos específicos antes de conectarlos al entrenamiento.
