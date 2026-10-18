import type { ConnectionCommand } from './backend/connection/connection.protocol.js';
import type { ClearHistoryCommand } from './backend/history/history.protocol.js';
import type { MessageFlowCommand } from './backend/message-flow/message-flow.protocol.js';
import type { SessionUpdate } from './backend/application/application.protocol.js';
import type {
  ControlResult,
  ControlError,
} from './backend/control/control.protocol.js';
export type ControlClientMessage =
  ConnectionCommand | ClearHistoryCommand | MessageFlowCommand;
export type ControlServerMessage = SessionUpdate | ControlResult | ControlError;
