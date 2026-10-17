// Shared contract between the game engines (pure logic) and the 3D layer.
// Nothing in src/games imports React or three.js.

export type GameId = 'chess' | 'checkers' | 'go'
export type Side = 'human' | 'ai'

/** x = file/column 0..n-1 from the human's left, y = rank/row 0..n-1 from the human's side. */
export interface Square { x: number; y: number }

/** kind: chess 'p','n','b','r','q','k'; checkers 'man','king'; go 'stone'. */
export interface Piece { id: string; kind: string; owner: Side; at: Square }

export interface MoveEvent {
  /** In order, for gliding animation (castling = two entries; checkers multi-jump = one entry per hop for the same id). */
  moved: { id: string; from: Square; to: Square }[]
  /** Piece ids removed. */
  captured: string[]
  /** New pieces (go stones; chess promotion replaces pawn: captured has old id, placed has new queen with new id). */
  placed: Piece[]
  /** Checkers man -> king keeps its id. */
  promoted?: { id: string; kind: string }
  /** e.g. 'Nf3', '12-16', 'C4' or 'pass'. */
  notation: string
}

/** text is a short human sentence, e.g. 'Your move', 'Checkmate. The AI wins.', 'You win by 4.5 points.' */
export interface GameStatus { over: boolean; winner: Side | 'draw' | null; text: string }

export interface BoardGame {
  readonly id: GameId
  /** 8 or 9. */
  readonly size: number
  reset(): void
  pieces(): Piece[]
  turn(): Side
  status(): GameStatus
  /** Squares the human may pick up (empty for go). */
  movableFrom(): Square[]
  /** Legal destinations for the human from 'from'; for go pass null and return all legal points. */
  targets(from: Square | null): Square[]
  /**
   * Human move; null if illegal. Chess promotion auto-queens.
   * Checkers: a multi-jump is chosen by the final landing square (any legal capture path ending there).
   */
  play(from: Square | null, to: Square): MoveEvent | null
  /** Go only. */
  pass?(): MoveEvent
  /** Computes in a Web Worker and applies the move; resolves null if no move (game over). */
  aiMove(): Promise<MoveEvent | null>
  lastMove(): MoveEvent | null
}
