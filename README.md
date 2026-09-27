# LabPok v1 — Firebase Cloud

Versión de LabPok conectada a:

- Firebase Authentication (email + contraseña)
- Cloud Firestore
- GitHub Pages como hosting estático

## Estructura de datos

Para esta primera migración, todo el estado de LabPok se guarda en:

`users/{UID}`

El documento contiene el estado completo `labpok.v1`: rangos, celdas, acciones, historial, notas, guía, leaks, entrenamiento y configuración.

Esto evita crear manualmente decenas de colecciones y permite migrar el backup JSON completo de una vez.

El backup actual mide aproximadamente 266 KB, por debajo del límite de 1 MiB de un documento de Firestore.

## Seguridad

`firestore.rules` permite que un usuario autenticado lea/escriba únicamente su propio documento `/users/{UID}`.

## Configuración necesaria en Firebase Console

1. Authentication → Método de acceso → Email/Password activado.
2. Authentication → Configuración → Dominios autorizados:
   añade `drake-zerep.github.io` cuando publiques LabPok ahí.
3. Firestore → Rules:
   publica las reglas de `firestore.rules`.

## Migración

1. Publica esta versión en GitHub Pages.
2. Abre LabPok.
3. Inicia sesión con el usuario Firebase.
4. Ve a Datos & Backups → Cargar backup.
5. Selecciona `LabPok_v1_Backup_2026-09-27.json`.
6. Confirma la importación.
7. LabPok guardará el estado completo en Firebase.
8. Recarga la página para comprobar que los 43 rangos vuelven desde Firestore.

No hay que crear colecciones manualmente.

## Backup

El botón Exportar backup sigue generando un JSON independiente de Firebase.
