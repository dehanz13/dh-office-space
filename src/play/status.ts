import type { GameId } from '../games'

// What each AI game board shows on its status strip. The 3D game layer writes
// here; the board screens and the game panel read it.

export const boardStatus: Record<GameId, string> = {
  chess: 'ready to play',
  checkers: 'ready to play',
  go: 'ready to play',
}

/** The full sentence for the game panel (the strip only fits about 25 characters). */
export const boardMessage: Record<GameId, string> = {
  chess: '',
  checkers: '',
  go: '',
}

/** True while an AI is choosing a move, per board (the edge lights pulse). */
export const boardThinking: Record<GameId, boolean> = {
  chess: false,
  checkers: false,
  go: false,
}

export type Level = 'easy' | 'medium' | 'hard'

/** Buttons in the game panel call into the board that is open. */
export const boardControls: Partial<Record<GameId, { newGame(): void; pass(): void; canPass(): boolean; level(): Level; setLevel(level: Level): void }>> = {}
