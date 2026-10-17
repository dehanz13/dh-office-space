import { CheckersGame } from './checkers'
import { ChessGame } from './chess'
import { GoGame } from './go'
import type { BoardGame, GameId } from './types'

export type { BoardGame, GameId, GameStatus, MoveEvent, Piece, Side, Square } from './types'
export { CheckersGame, ChessGame, GoGame }

export function createGame(id: GameId): BoardGame {
  switch (id) {
    case 'chess':
      return new ChessGame()
    case 'checkers':
      return new CheckersGame()
    case 'go':
      return new GoGame()
  }
}
