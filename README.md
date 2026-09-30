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

## Phase 7C-5 — BTN vs CO
- Position: BTN
- Opponent: CO
- CO open reference: 2.5 BB
- 3BET: 110 combos (8.30%)
- CALL: 208 combos (15.69%)
- Total continuation: 318 combos (23.98%)
- Status: EXPERIMENTAL
- Rationale: BTN has position, so the call range can be broader than in OOP positions. The 3BET frequency is within the 7–10% contextual range cited in Kill Tilt for BU vs CO in NL2, while the final composition is an experimental LabPok construction for Winamax 5-MAX.


## Phase 7C — bloque completo 3BET / CC

Se completa el bloque 7C con 10 spots específicos de Winamax 5-MAX:
- CO vs UTG
- BTN vs UTG
- SB vs UTG
- BB vs UTG
- BTN vs CO
- SB vs CO
- BB vs CO
- SB vs BTN
- BB vs BTN
- BB vs SB

Todos quedan como EXPERIMENTAL y se separan en 3BET y CALL. Las defensas BB de 7B y las tablas 7C mantienen coherencia entre sí: 7B representa defensa total; 7C descompone esa defensa en acciones de continuación.

## Selector de rangos Winamax

El editor de rangos mantiene la categoría WINAMAX 5-MAX como módulo independiente y ahora agrupa visualmente sus tablas por subcategoría: RFI, BB DEFENSE, 3BET / CC, VS 3BET, 4BET e ISO RAISE. Esto evita mezclar las tablas al seleccionarlas desde el editor.

El siguiente bloque de desarrollo es **7D — VS 3BET**. Las plantillas de ese bloque permanecen disponibles, pero todavía no se han rellenado con estrategia.

## Phase 7D — VS 3BET

Bloque incorporado para Winamax 5-MAX. Las tablas parten de que Hero abrió preflop y recibió una 3BET. Cada spot separa `4BET VALUE`, `4BET BLUFF`, `CALL` y `FOLD`.

| Tabla | 4BET VALUE | 4BET BLUFF | CALL | Continuación |
|---|---:|---:|---:|---:|
| UTG vs 3BET | 34 | 16 | 62 | 112 (8,45%) |
| CO vs 3BET | 34 | 16 | 68 | 118 (8,90%) |
| BTN vs 3BET | 40 | 24 | 92 | 156 (11,76%) |
| SB vs 3BET | 34 | 24 | 54 | 112 (8,45%) |

Estado de todas: `EXPERIMENTAL`.

Las frecuencias son una base de estudio para NL2 Winamax 5-MAX, no una tabla GTO oficial. Se deben revisar posteriormente con pool, perfiles y resultados propios.

## Selector Winamax 5-MAX

Las seis categorías de Winamax 5-MAX ahora se muestran como **acordeones desplegables**. Al pulsar una categoría se muestran únicamente sus tablas; al volver a pulsarla se contrae. Esto evita una lista larga de tablas y permite trabajar por bloques.

Orden de bloques:
1. RFI
2. BB DEFENSE
3. 3BET / CC
4. VS 3BET
5. 4BET
6. ISO RAISE

## Phase 7F — ISO RAISE Winamax 5-MAX

Bloque completo de aislamiento frente a 1 limper:

- CO vs UTG limper — 334 combos (25.19%), sizing base 4.5 BB.
- BTN vs UTG limper — 614 combos (46.30%), sizing base 4.5 BB.
- SB vs UTG limper — 422 combos (31.83%), sizing base 5.5 BB.
- BB vs UTG limper — 450 combos (33.94%), sizing base 5.5 BB.

Las cuatro tablas son EXPERIMENTAL. Con un limper adicional, aumentar aproximadamente 1 BB por limper como punto de partida; ajustar según limp/fold, tendencia a pagar y juego postflop del rival.

El selector de Winamax 5-MAX en Rangos agrupa las tablas en acordeones desplegables por categoría: RFI, BB DEFENSE, 3BET / CC, VS 3BET, 4BET e ISO RAISE.
