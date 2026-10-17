// Module worker: receives { id, req: ChessAIRequest }, replies { id, res: ChessAIReply }.
import { serveWorker } from './aiRunner'
import { thinkChess } from './chessAI'

serveWorker(thinkChess)
