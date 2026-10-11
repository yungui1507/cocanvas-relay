"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistStrokes = persistStrokes;
exports.saveSnapshotMeta = saveSnapshotMeta;
exports.loadSnapshotMeta = loadSnapshotMeta;
exports.touchBoard = touchBoard;
/**
 * 持久化适配器
 * 把操作日志批量写入 WorkBuddy Database。
 */
const node_fetch_1 = __importDefault(require("node-fetch"));
const config_1 = require("./config");
const DB_PATH = '/.cloud/database/rest';
const SERVICE_TOKEN = process.env.WB_SERVICE_TOKEN || '';
function dbHeaders() {
    const headers = {
        'X-Publishable-Key': config_1.Config.WORKBUDDY.publishableKey,
        'Content-Type': 'application/json'
    };
    if (SERVICE_TOKEN) {
        headers['Authorization'] = `Bearer ${SERVICE_TOKEN}`;
    }
    return headers;
}
/**
 * 批量写入笔画操作
 */
async function persistStrokes(ops) {
    if (ops.length === 0)
        return;
    // 免登录模式：无云端可落库，跳过（操作日志仍在内存窗口内可补发）
    if (!config_1.Config.WORKBUDDY.endpoint)
        return;
    const rows = ops.map(op => ({
        stroke_id: op.stroke.strokeId,
        board_id: op.boardId,
        user_id: op.userId,
        server_seq: op.seq,
        client_seq: op.stroke.clientSeq || 0,
        payload: JSON.stringify(op.stroke),
        created_at: op.createdAt
    }));
    try {
        const res = await (0, node_fetch_1.default)(`${config_1.Config.WORKBUDDY.endpoint}${DB_PATH}/stroke_logs`, {
            method: 'POST',
            headers: dbHeaders(),
            body: JSON.stringify(rows)
        });
        if (!res.ok) {
            throw new Error(`persist failed, status=${res.status}`);
        }
        console.log(`[Persist] saved ${rows.length} strokes`);
    }
    catch (e) {
        console.error('[Persist] persistStrokes failed:', e);
        throw e;
    }
}
/**
 * 写入快照元信息
 *
 * 存到 board_snapshots 表：记录某画板的快照覆盖到哪个 seq，
 * 新成员加入时可直接从该 seq 起步，不必拉全量操作日志。
 */
async function saveSnapshotMeta(boardId, coveredSeq, coverUrl) {
    if (!config_1.Config.WORKBUDDY.endpoint)
        return;
    try {
        const res = await (0, node_fetch_1.default)(`${config_1.Config.WORKBUDDY.endpoint}${DB_PATH}/board_snapshots`, {
            method: 'POST',
            headers: dbHeaders(),
            body: JSON.stringify({
                board_id: boardId,
                covered_seq: coveredSeq,
                cover_url: coverUrl,
                created_at: Date.now()
            })
        });
        if (!res.ok) {
            console.warn(`[Persist] saveSnapshotMeta failed, status=${res.status}`);
            return;
        }
        console.log(`[Persist] snapshot meta saved for ${boardId}, seq=${coveredSeq}`);
        // 同步更新画板封面与最后活跃时间
        await touchBoard(boardId, coverUrl);
    }
    catch (e) {
        console.error('[Persist] saveSnapshotMeta failed:', e);
    }
}
/**
 * 读取画板最新快照元信息
 */
async function loadSnapshotMeta(boardId) {
    if (!config_1.Config.WORKBUDDY.endpoint)
        return null;
    try {
        const url = `${config_1.Config.WORKBUDDY.endpoint}${DB_PATH}/board_snapshots` +
            `?board_id=eq.${encodeURIComponent(boardId)}&order=covered_seq.desc&limit=1`;
        const res = await (0, node_fetch_1.default)(url, { method: 'GET', headers: dbHeaders() });
        if (!res.ok)
            return null;
        const rows = await res.json();
        if (!rows || rows.length === 0)
            return null;
        return rows[0];
    }
    catch (e) {
        console.error('[Persist] loadSnapshotMeta failed:', e);
        return null;
    }
}
/**
 * 更新画板最后活跃时间 + 缩略图
 */
async function touchBoard(boardId, coverUrl) {
    if (!config_1.Config.WORKBUDDY.endpoint)
        return;
    try {
        const payload = { updated_at: Date.now(), last_stroke_at: Date.now() };
        if (coverUrl) {
            payload.cover_url = coverUrl;
        }
        const res = await (0, node_fetch_1.default)(`${config_1.Config.WORKBUDDY.endpoint}${DB_PATH}/boards?id=eq.${encodeURIComponent(boardId)}`, {
            method: 'PATCH',
            headers: dbHeaders(),
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            console.warn(`[Persist] touchBoard failed, status=${res.status}`);
        }
    }
    catch (e) {
        console.error('[Persist] touchBoard failed:', e);
    }
}
//# sourceMappingURL=PersistenceAdapter.js.map