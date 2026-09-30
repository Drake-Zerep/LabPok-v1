# LabPok v1 — Firebase / Winamax 5-MAX — Phase 7C-1

## Phase 7C-1: 3BET / CC — CO vs UTG

Esta versión inicia el bloque **7C — 3BET / CC** para Winamax 5-MAX.

### Tabla incorporada

- **Situación:** CO vs UTG open
- **UTG open de referencia:** 2.5 BB
- **UTG RFI actual del sistema:** 20.1%
- **3BET:** 58 combos · 4.37% del total
- **CALL:** 96 combos · 7.24% del total
- **Defensa/continuación total:** 154 combos · 11.61% del total
- **Estado:** EXPERIMENTAL

### Criterio de construcción

UTG es la primera posición de apertura y utiliza un rango relativamente fuerte dentro del módulo 5-MAX. CO es la primera posición que responde y además juega en posición postflop contra UTG. La tabla se construye con una 3BET contenida y un rango de cold call selectivo, priorizando valor, algunos bluffs suited y manos con buena jugabilidad IP.

No se presenta como una solución GTO universal. Las fronteras se revisarán con muestras reales de Winamax, rake, sizings y perfiles del pool.

### Referencias de contexto

Las discusiones francesas consultadas sobre Winamax 5-MAX sitúan el primer open aproximadamente en 18–20% y remarcan que la adaptación del 5-MAX debe tratarse de forma específica. Una referencia reciente sobre 3BET en NL2-NL10 sitúa las posiciones tempranas alrededor del 4–6% como rango de trabajo. Estas referencias sirven como contexto, no como tabla oficial de Winamax.

### Instalación

Sustituye en GitHub:

- `index.html`
- `app.js`
- `styles.css`
- `README.md`

Conserva el `firebase-config.js` que ya funciona en tu instalación.

No es necesario importar el backup. Al iniciar sesión, `ensureWinamax7A()` detecta la tabla `w5_3b_utg` si está pendiente/vacía y carga automáticamente la 7C-1 en Firebase.

### Estructura del proyecto

Los archivos deben permanecer en la raíz del repositorio para GitHub Pages.
