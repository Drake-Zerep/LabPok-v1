# LabPok v1 — Firebase / Winamax 5-MAX — Phase 7C-4

## Phase 7C-4: 3BET / CC — BB vs UTG

Esta versión incorpora **7C-4 · BB vs UTG** al bloque **7C — 3BET / CC** de Winamax 5-MAX.

### Tabla incorporada

- **Situación:** BB vs UTG open
- **UTG open de referencia:** 3 BB
- **UTG RFI actual del sistema:** 20.1%
- **3BET:** 58 combos · 4.37% del total
- **CALL:** 128 combos · 9.65% del total
- **Continuación total:** 186 combos · 14.03% del total
- **Estado:** EXPERIMENTAL

### Diferencia respecto a 7B-1

**7B-1 — BB Defense vs UTG** estudia la **defensa total** de BB frente al mismo open.

**7C-4 — 3BET / CC BB vs UTG** separa explícitamente esa defensa en las dos acciones de continuación:

- 3BET
- CALL

La base de frecuencias se mantiene coherente entre ambos módulos: **58 3BET + 128 CALL = 186 combos / 14.03%**.

### Criterio de construcción

Las referencias francesas consultadas sobre 5-MAX muestran que la defensa de BB frente a una posición temprana debe mantenerse relativamente contenida. Una discusión de Kill Tilt compara referencias de aproximadamente 13% y 23% de defensa frente a UTG/HJ y señala que el rango depende del rival y del juego postflop. Otra fuente de Poker Académie presenta una estrategia de BB en 5-MAX descrita como predominantemente lineal/mixta OOP, con low Axs utilizados con frecuencia en 3BET. Estas fuentes son contexto histórico de micro límites, no una tabla oficial de Winamax NL2 2026. citeturn0search10turn0search7

Para LabPok mantenemos una base conservadora de **14.03%**, consistente con 7B-1. No se presenta como GTO ni como rango universal; debe revisarse con pool y datos propios.

### Instalación

Sustituye en GitHub:

- `index.html`
- `app.js`
- `styles.css`
- `README.md`

Conserva el `firebase-config.js` que ya funciona.

No es necesario importar el backup. Al iniciar sesión, `ensureWinamax7A()` detecta la tabla `w5_3b_bb_utg` si está pendiente/vacía y carga automáticamente la 7C-4 en Firebase.

Los archivos deben permanecer directamente en la raíz del repositorio para GitHub Pages.

## Estado del bloque 7C

- **7C-1:** CO vs UTG — 58 3BET / 96 CALL
- **7C-2:** BTN vs UTG — 76 3BET / 160 CALL
- **7C-3:** SB vs UTG — 62 3BET / 76 CALL
- **7C-4:** BB vs UTG — 58 3BET / 128 CALL

## Próximo desarrollo

Continuaremos con los siguientes spots de **3BET / CC** una vez comprobada esta versión en Firebase. El bloque posterior incluirá VS 3BET, 4BET e ISO RAISE.

Las notas generales sobre **cómo leer los rangos, especificaciones, sizings de apertura/apuesta y juego postflop** se recopilarán en un apartado final cuando terminemos la construcción de todos los rangos, tal como está previsto para el proyecto.
