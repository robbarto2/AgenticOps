/**
 * Calculate the position for a new card on the canvas.
 * Cards are laid out in a grid pattern.
 */

const CARD_WIDTH = 440
const CARD_HEIGHT = 350
const GAP_X = 40
const GAP_Y = 40
const COLS = 3
const START_X = 50
const START_Y = 50

export function getNextCardPosition(existingCount: number): { x: number; y: number } {
  const col = existingCount % COLS
  const row = Math.floor(existingCount / COLS)
  return {
    x: START_X + col * (CARD_WIDTH + GAP_X),
    y: START_Y + row * (CARD_HEIGHT + GAP_Y),
  }
}
