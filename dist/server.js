"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.opLog = exports.rooms = exports.wss = exports.app = void 0;
/**
 * CoCanvas WebSocket 中继服务
 *
 * 职责：
 *  - 鉴权（WorkBuddy Auth + 画板成员校验）
 *  - 房间管理（画板 = 房间）
 *  - 实时笔画广播
 *  - 操作日志分配 seq + 增量补发
 *  - 在线状态广播
 *  - 心跳与限流
 */
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const config_1 = require("./config");
const AuthVerifier_1 = require("./AuthVerifier");
const RoomManager_1 = require("./RoomManager");
const OpLog_1 = require("./OpLog");
const RedisBridge_1 = require("./RedisBridge");
// ===== 初始化 =====
const app = (0, express_1.default)();
exports.app = app;
app.use(express_1.default.json());
// WebSocketServer 挂在独立的 http server 上，
// 避免 app.listen 返回类型与 ws 期望的 Server 类型不兼容
const httpServer = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({
    server: httpServer,
    path: '/ws',
    // 放宽单条消息上限，笔画数据可能较大
    maxPayload: 1024 * 512
});
exports.wss = wss;
const rooms = new RoomManager_1.RoomManager();
exports.rooms = rooms;
const opLog = new OpLog_1.OpLog();
exports.opLog = opLog;
/** 正在等待客户端上传快照的画板，避免重复请求 */
const pendingSnapshots = new Set();
/**
 * Redis 桥接（多实例）
 * 未配置 REDIS_URL 时自动降级为单实例内存模式
 */
const bridge = new RedisBridge_1.RedisBridge({
    onRemoteMessage: (boardId, payload) => {
        // 来自其他实例的消息，转给本实例该画板的本地成员
        rooms.broadcast(boardId, payload);
    },
    onPresenceChange: (boardId, onlineUserIds) => {
        rooms.broadcast(boardId, JSON.stringify({
            type: 'presence',
            boardId,
            data: { boardId, onlineUserIds }
        }));
    }
});
// ===== 健康检查 =====
app.get('/health', (req, res) => {
    const stats = rooms.stats();
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        rooms: stats.totalRooms,
        members: stats.totalMembers
    });
});
// ===== 统计接口 =====
app.get('/stats', (req, res) => {
    res.json(rooms.stats());
});
// ===== WebSocket 处理 =====
wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || '';
    const boardId = url.searchParams.get('boardId') || '';
    if (!token || !boardId) {
        console.warn('[WS] missing token or boardId');
        ws.close(config_1.Config.CLOSE_CODE.AUTH_FAILED, 'missing params');
        return;
    }
    // ===== 鉴权 =====
    const authUser = await (0, AuthVerifier_1.verifyToken)(token);
    if (!authUser) {
        console.warn(`[WS] auth failed for board ${boardId}`);
        ws.close(config_1.Config.CLOSE_CODE.AUTH_FAILED, 'auth failed');
        return;
    }
    // ===== 成员校验 =====
    const boardMember = await (0, AuthVerifier_1.checkBoardMember)(authUser.userId, boardId);
    if (!boardMember) {
        console.warn(`[WS] user ${authUser.userId} not a member of board ${boardId}`);
        ws.close(config_1.Config.CLOSE_CODE.NOT_MEMBER, 'not a board member');
        return;
    }
    // ===== 加入房间 =====
    const roomMember = {
        userId: boardMember.userId,
        nickname: (0, AuthVerifier_1.isGuestMode)() ? authUser.nickname : boardMember.nickname,
        color: boardMember.color,
        ws,
        rateWindowStart: Date.now(),
        rateCount: 0,
        awaitingPong: false
    };
    const room = rooms.join(boardId, roomMember);
    console.log(`[WS] ${roomMember.nickname}(${roomMember.userId}) joined board ${boardId}, ` +
        `room size=${room.size}`);
    // 多实例：订阅画板频道 + 标记在线
    await bridge.subscribeBoard(boardId);
    await bridge.markOnline(boardId, roomMember.userId);
    // 广播在线状态
    rooms.broadcastPresence(boardId);
    // 补发增量（重连场景）
    sendHistory(ws, boardId, url.searchParams.get('since'));
    // ===== 消息处理 =====
    ws.on('message', async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        }
        catch (e) {
            console.warn('[WS] invalid JSON');
            return;
        }
        // 限流
        if (!room.checkRateLimit(roomMember.userId)) {
            console.warn(`[WS] rate limit exceeded for ${roomMember.userId}`);
            ws.close(config_1.Config.CLOSE_CODE.RATE_LIMITED, 'rate limit');
            return;
        }
        switch (msg.type) {
            case 'stroke': {
                handleStroke(boardId, roomMember, msg, ws);
                break;
            }
            case 'stroke_undo': {
                handleUndo(boardId, roomMember, msg);
                break;
            }
            case 'cursor': {
                // 光标广播：转发给房间内其他人
                rooms.broadcast(boardId, JSON.stringify({
                    type: 'cursor',
                    boardId,
                    data: {
                        ...msg.data,
                        userId: roomMember.userId,
                        nickname: roomMember.nickname,
                        color: roomMember.color
                    }
                }), roomMember.userId);
                break;
            }
            case 'snapshot_req': {
                sendHistory(ws, boardId, msg.data?.since);
                break;
            }
            case 'snapshot_upload_ack': {
                handleSnapshotAck(boardId, roomMember, msg);
                break;
            }
            case 'ping': {
                ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
                roomMember.awaitingPong = false;
                break;
            }
            default:
                console.warn(`[WS] unknown message type: ${msg.type}`);
                break;
        }
    });
    // ===== 断开处理 =====
    ws.on('close', () => {
        const remaining = rooms.leave(boardId, roomMember.userId);
        console.log(`[WS] ${roomMember.nickname}(${roomMember.userId}) left board ${boardId}` +
            (remaining ? `, room size=${remaining.size}` : ', room closed'));
        // 多实例：清除在线标记，房间空则退订
        bridge.markOffline(boardId, roomMember.userId);
        if (!remaining) {
            bridge.unsubscribeBoard(boardId);
        }
        if (remaining) {
            rooms.broadcastPresence(boardId);
        }
    });
    ws.on('error', (err) => {
        console.error(`[WS] socket error for ${roomMember.userId}:`, err.message);
    });
});
/**
 * 处理笔画消息：分配 seq → 广播 → 记日志
 */
function handleStroke(boardId, member, msg, ws) {
    const stroke = msg.data;
    if (!stroke || !stroke.strokeId) {
        console.warn('[WS] malformed stroke');
        return;
    }
    // 服务端盖上权威字段
    stroke.boardId = boardId;
    stroke.userId = member.userId;
    const op = opLog.appendStroke(boardId, member.userId, stroke);
    // 广播给房间内其他人（不回发给自己）
    const payload = JSON.stringify({
        type: 'stroke',
        boardId,
        data: op.payload
    });
    rooms.broadcast(boardId, payload, member.userId);
    // 多实例：转发到其他进程
    if (bridge.isEnabled()) {
        bridge.publish(boardId, payload);
    }
    // 给发送方回 ack（带 serverSeq）
    if (stroke.state === 'committed') {
        ws.send(JSON.stringify({
            type: 'ack',
            boardId,
            data: op.seq
        }));
    }
    // 累计操作超阈值 → 请一位成员导出快照
    maybeTriggerSnapshot(boardId);
}
/**
 * 处理撤销
 * 语义：只能撤销自己的笔画，服务端盖上权威 userId 防止伪造
 */
function handleUndo(boardId, member, msg) {
    const undo = msg.data;
    if (!undo || !undo.strokeId) {
        console.warn('[WS] malformed undo');
        return;
    }
    // 权威 userId 来自连接身份，不信任客户端上报
    undo.userId = member.userId;
    const op = opLog.appendUndo(boardId, member.userId, undo.strokeId);
    // 广播给房间内所有人（含发起者，用于确认）
    const payload = JSON.stringify({
        type: 'stroke_undo',
        boardId,
        data: op.payload
    });
    rooms.broadcast(boardId, payload);
    if (bridge.isEnabled()) {
        bridge.publish(boardId, payload);
    }
    console.log(`[WS] undo stroke ${undo.strokeId} by ${member.userId}, seq=${op.seq}`);
}
/**
 * 快照触发：累计操作超过阈值时，请房间里任一成员导出画布
 */
function maybeTriggerSnapshot(boardId) {
    const count = opLog.countSinceSnapshot(boardId);
    if (count < config_1.Config.SNAPSHOT.TRIGGER_COUNT) {
        return;
    }
    const room = rooms.get(boardId);
    if (!room || room.size === 0) {
        return;
    }
    // 已在等待快照上传，避免重复请求
    if (pendingSnapshots.has(boardId)) {
        return;
    }
    pendingSnapshots.add(boardId);
    const coveredSeq = opLog.currentSeq(boardId);
    // 任选一位成员（取第一个），请其导出画布
    const target = Array.from(room.members.values())[0];
    try {
        target.ws.send(JSON.stringify({
            type: 'snapshot_upload_req',
            boardId,
            data: coveredSeq
        }));
        console.log(`[WS] snapshot requested for ${boardId} at seq=${coveredSeq}, ` +
            `target=${target.userId}`);
    }
    catch (e) {
        pendingSnapshots.delete(boardId);
    }
}
/**
 * 处理快照上传回报
 */
function handleSnapshotAck(boardId, member, msg) {
    const ack = msg.data;
    if (!ack || !ack.coverUrl) {
        pendingSnapshots.delete(boardId);
        return;
    }
    const coveredSeq = ack.coveredSeq || opLog.currentSeq(boardId);
    opLog.setSnapshot(boardId, coveredSeq, ack.coverUrl);
    pendingSnapshots.delete(boardId);
    // 记录到 boards 表，便于新成员直接从快照起步
    persistSnapshotMeta(boardId, coveredSeq, ack.coverUrl);
}
/**
 * 补发历史：since 之后的操作
 *
 * 三种情况：
 *  1. since=0（全新进入）：若有快照，先给快照图水位，再给水位后的操作
 *  2. since 落在内存窗口外：标记 outOfWindow，客户端从 DB 拉
 *  3. 正常增量：直接给窗口内的操作
 */
function sendHistory(ws, boardId, sinceStr) {
    const since = sinceStr ? parseInt(sinceStr, 10) || 0 : 0;
    const latestSeq = opLog.currentSeq(boardId);
    const snap = opLog.getSnapshot(boardId);
    if (since === 0) {
        // 全新进入：给水位之后的操作（更早的内容由快照承载）
        const from = Math.max(since, snap.watermark);
        const ops = opLog.since(boardId, from);
        ws.send(JSON.stringify({
            type: 'snapshot',
            boardId,
            data: ops.map(op => op.payload),
            latestSeq,
            snapshotUrl: snap.url,
            snapshotWatermark: snap.watermark
        }));
        return;
    }
    // 落后于快照水位：直接从快照起步 + 水位后的增量
    if (snap.watermark > 0 && since < snap.watermark) {
        const ops = opLog.since(boardId, snap.watermark);
        ws.send(JSON.stringify({
            type: 'snapshot',
            boardId,
            data: ops.map(op => op.payload),
            latestSeq,
            snapshotUrl: snap.url,
            snapshotWatermark: snap.watermark
        }));
        return;
    }
    if (opLog.isOutOfWindow(boardId, since)) {
        // 超出内存窗口且无快照覆盖，让客户端从 WorkBuddy DB 拉全量
        ws.send(JSON.stringify({
            type: 'snapshot',
            boardId,
            data: [],
            latestSeq,
            outOfWindow: true
        }));
        return;
    }
    const ops = opLog.since(boardId, since);
    ws.send(JSON.stringify({
        type: 'snapshot',
        boardId,
        data: ops.map(op => op.payload),
        latestSeq
    }));
}
/**
 * 快照元信息落库
 */
async function persistSnapshotMeta(boardId, coveredSeq, coverUrl) {
    try {
        const { saveSnapshotMeta } = require('./PersistenceAdapter');
        await saveSnapshotMeta(boardId, coveredSeq, coverUrl);
    }
    catch (e) {
        console.error('[Server] persistSnapshotMeta failed:', e);
    }
}
// ===== 服务端心跳 =====
const heartbeatTimer = setInterval(() => {
    for (const client of wss.clients) {
        if (client.readyState !== 1)
            continue;
        try {
            client.ping();
        }
        catch (e) {
            // ignore
        }
    }
    rooms.cleanup();
}, config_1.Config.HEARTBEAT.INTERVAL_MS);
// ===== 优雅退出 =====
async function shutdown(signal) {
    console.log(`\n[Server] ${signal} received, shutting down...`);
    clearInterval(heartbeatTimer);
    // flush 所有待落库操作
    await opLog.destroy();
    // 清理 Redis 连接
    await bridge.destroy();
    // 关闭所有连接
    for (const client of wss.clients) {
        try {
            client.close(1001, 'server shutting down');
        }
        catch (e) {
            // ignore
        }
    }
    wss.close(() => {
        console.log('[Server] closed');
        process.exit(0);
    });
    // 兜底：10 秒后强制退出
    setTimeout(() => process.exit(0), 10000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
    console.error('[Server] unhandled rejection:', reason);
});
// ===== 启动 =====
const server = httpServer.listen(config_1.Config.PORT, async () => {
    console.log(`[Server] CoCanvas relay listening on port ${config_1.Config.PORT}`);
    console.log(`[Server] WebSocket endpoint: ws://localhost:${config_1.Config.PORT}/ws`);
    if (!config_1.Config.WORKBUDDY.endpoint) {
        console.warn('[Server] WARNING: WB_ENDPOINT not set, auth will fail');
    }
    // 多实例桥接（失败则单实例运行）
    const redisOk = await bridge.init();
    if (redisOk) {
        console.log('[Server] multi-instance mode enabled via Redis');
    }
});
exports.server = server;
//# sourceMappingURL=server.js.map