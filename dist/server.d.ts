import { RoomManager } from './RoomManager';
import { OpLog } from './OpLog';
declare const app: import("express-serve-static-core").Express;
declare const wss: import("ws").Server<typeof import("ws"), typeof import("http").IncomingMessage>;
declare const rooms: RoomManager;
declare const opLog: OpLog;
declare const server: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
export { app, wss, rooms, opLog, server };
