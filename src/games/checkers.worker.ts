// Module worker: receives { id, req: CheckersAIRequest }, replies { id, res: CheckersAIReply }.
import { serveWorker } from './aiRunner'
import { thinkCheckers } from './checkersCore'

serveWorker(thinkCheckers)
