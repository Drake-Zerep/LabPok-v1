# LabPok v1 — Firebase · Phase 7A Winamax 5-MAX RFI

Esta versión continúa la fase 7A: RFI por posición. UTG ya está construido como 7A-A y CO queda documentado como 7A-B.

## RFI base experimental

### 7A-B · CO
La tabla CO queda construida con 54 celdas de mano y 330 combos (24.89%). La referencia de trabajo francesa sitúa CO aproximadamente en 25-30% en micro 5-max; se adopta el extremo conservador como punto de partida y se documentan las manos frontera para futuras expansiones.
- UTG: 20.1% / 266 combos / 2.5 BB
- CO: 24.9% / 330 combos / 2.5 BB · 7A-B
- BTN: 46.9% / 622 combos / 2.5 BB
- SB: 50.8% / 674 combos / 3 BB

Estas tablas son una **base de estudio experimental**, no una afirmación de GTO ni una validación definitiva del pool actual. Se construyeron tomando como referencia material francés sobre micro-límites y 5-max, especialmente Kill Tilt y Poker Académie, y se mantienen separadas del sistema 6-MAX.

## Estructura 5-MAX
- RFI
- BB DEFENSE
- 3BET / CC
- VS 3BET
- 4BET
- ISO RAISE

Las categorías que todavía no se han construido permanecen PENDIENTES.

## Instalación
Conserva el `firebase-config.js` que ya funciona en tu proyecto. Sustituye `index.html`, `app.js`, `styles.css` y este README. No es necesario volver a importar el backup si Firebase ya contiene tus datos.


## Phase 7A-C — Winamax 5-MAX BTN
BTN 46.9% / 622 combos / 2.5 BB, estado EXPERIMENTAL. La base se construye a partir de referencias francesas de micro 5-MAX y se mantiene separada de los rangos 6-MAX. Las fuentes encontradas sirven como contexto, no como tabla oficial ni como GTO; la validación se hará con composición, pool y datos propios.


## Phase 7A-D — SB 5-MAX
SB RFI queda cargado como base experimental: 50.8% / 674 combos / open 3 BB. La construcción debe validarse junto con BB vs SB y datos propios del pool.

## Phase 7B-1 — BB vs UTG
- Winamax 5-MAX
- Open de referencia: 3 BB
- Defensa total: 14.03% (186 combos)
- 3BET: 58 combos (4.37%)
- CALL: 128 combos (9.65%)
- Estado: EXPERIMENTAL
- Fuente/contexto: discusión francesa Kill Tilt sobre la variabilidad de BB vs UTG (HJ en 5-max), comparando referencias de ~13% y ~23%; el rango se trata como base de estudio, no como GTO.


## Phase 7B-2 — BB vs CO
- Winamax 5-MAX
- Open de referencia: 2.5 BB
- Defensa total: 31.8% (422 combos)
- 3BET: 106 combos (8.0%)
- CALL: 316 combos (23.8%)
- Estado: EXPERIMENTAL
- Fuente/contexto: referencia solver reciente para BB vs CO a 100bb de ~31.4% total (23.8% CALL + 7.7% 3BET). La base de LabPok se mantiene en 31.8% y se considera experimental, con ajuste conservador por rake y pendiente de validación con datos propios de Winamax.


## Phase 7B-3 — BB vs BTN
- Winamax 5-MAX
- Open de referencia: 2.5 BB
- BTN del módulo: 46.9% RFI / 622 combos
- Defensa total: 39.1% (518 combos)
- 3BET: 154 combos (11.6%)
- CALL: 364 combos (27.5%)
- Estado: EXPERIMENTAL
- Construcción: base inferida para un BTN amplio. La investigación francesa consultada considera BB vs BTN un spot central y señala que la defensa debe adaptarse al rango de apertura. Poker Académie muestra un spot teórico BB vs BU contra 40% de open a 2.5x con rake del 5%, pero el texto consultado no proporciona una frecuencia única que deba copiar. Por ello esta tabla es una base propia de estudio, no una tabla GTO.
- Fuente/contexto: Poker Académie, «Spot de Master n°7 : Defendre sa BB» y material de defensa BB micro; Kill Tilt, «CG NL10 5-max : Défense de BB vs steal du BU» y discusión NL2 JTo en BB vs BTN.


## Phase 7B-4 — BB vs SB (Blind vs Blind)
- Winamax 5-MAX
- SB del módulo: 50.8% RFI / 674 combos / open 3 BB
- Defensa total BB: 55.4% (734 combos)
- 3BET: 180 combos (13.6%)
- CALL: 554 combos (41.8%)
- Estado: EXPERIMENTAL
- Construcción: BvB tratado como un spot específico porque BB queda IP postflop. Las referencias francesas consultadas distinguen esta situación de las defensas BB OOP y contemplan una defensa más amplia y una estrategia de 3BET polarizada/mixada. La base de LabPok queda ligeramente por encima del RFI de SB, con un rango de call amplio y un bloque de 3BET polarizado. No se presenta como GTO ni como rango universal.
- Fuentes/contexto: Poker Académie, «Challenge 5-max micro limites» y discusiones sobre defensa BB vs SB; Poker Académie sobre rangos BvB y ajuste al rango de SB.
