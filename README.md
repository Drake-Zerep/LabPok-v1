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
