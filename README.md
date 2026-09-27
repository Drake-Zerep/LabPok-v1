# LabPok v1 — Firebase Cloud

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
