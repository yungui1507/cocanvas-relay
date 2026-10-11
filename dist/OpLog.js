"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpLog = void 0;
/**
 * 操作日志
 *
 * 每个画板维护一个环形缓冲，保留最近 N 条操作。
 * 用途：新成员加入 / 断线重连时补发增量。
 *
 * 记录两类操作：
 *  - stroke：新增笔画
 *  - undo：撤销某条笔画（只允许撤销自己的）
 *
 * 快照水位（snapshotWatermark）：
 *  累计操作超过阈值时，中继请客户端导出画布上传 Storage，
 *  成功后把 coveredSeq 记为水位。此后水位之前的操作可由快照重建，
 *  客户端若落后于水位，从快照起步而非拉全量 DB。
 */
const config_1 = require("./config");
const PersistenceAdapter_1 = require("./PersistenceAdapter");
class OpLog {
    constructor() {
        this.boards = new Map();
        this.flushTimer = null;
        this.flushTimer = setInterval(() => {
            this.flushAll();
        }, config_1.Config.OPLOG.FLUSH_INTERVAL_MS);
    }
    ensure(boardId) {
        let log = this.boards.get(boardId);
        if (!log) {
            log = {
                ops: [],
                nextSeq: 1,
                snapshotWatermark: 0,
                snapshotUrl: '',
                dirtyCount: 0
            };
            this.boards.set(boardId, log);
        }
        return log;
    }
    /**
     * 追加笔画操作
     */
    appendStroke(boardId, userId, stroke) {
        const log = this.ensure(boardId);
        const seq = log.nextSeq++;
        const op = {
            seq,
            boardId,
            userId,
            kind: 'stroke',
            payload: { ...stroke, serverSeq: seq },
            createdAt: Date.now(),
            persisted: false
        };
        this.pushOp(log, op);
        return op;
    }
    /**
     * 追加撤销操作
     * @param strokeId 被撤销的笔画
     */
    appendUndo(boardId, userId, strokeId) {
        const log = this.ensure(boardId);
        const seq = log.nextSeq++;
        const op = {
            seq,
            boardId,
            userId,
            kind: 'undo',
            payload: { strokeId, serverSeq: seq },
            createdAt: Date.now(),
            persisted: false
        };
        this.pushOp(log, op);
        return op;
    }
    /**
     * 推入并做窗口裁剪
     */
    pushOp(log, op) {
        log.ops.push(op);
        log.dirtyCount++;
        if (log.ops.length > config_1.Config.OPLOG.WINDOW_SIZE) {
            const overflow = log.ops.length - config_1.Config.OPLOG.WINDOW_SIZE;
            log.ops.splice(0, overflow);
        }
        if (log.dirtyCount >= config_1.Config.OPLOG.FLUSH_THRESHOLD) {
            this.flushBoard(op.boardId);
        }
    }
    /**
     * 拉取 since 之后的操作
     */
    since(boardId, sinceSeq) {
        const log = this.boards.get(boardId);
        if (!log)
            return [];
        return log.ops.filter(op => op.seq > sinceSeq);
    }
    /**
     * 当前最大 seq
     */
    currentSeq(boardId) {
        const log = this.boards.get(boardId);
        return log ? log.nextSeq - 1 : 0;
    }
    /**
     * 取最近 n 条
     */
    recent(boardId, n) {
        const log = this.boards.get(boardId);
        if (!log)
            return [];
        return log.ops.slice(Math.max(0, log.ops.length - n));
    }
    /**
     * 判断 since 是否落在内存窗口之外
     */
    isOutOfWindow(boardId, sinceSeq) {
        const log = this.boards.get(boardId);
        if (!log || log.ops.length === 0) {
            return sinceSeq > 0;
        }
        const oldest = log.ops[0].seq;
        return sinceSeq > 0 && sinceSeq < oldest - 1;
    }
    /**
     * 水位之后的累计操作数（达到阈值触发快照）
     */
    countSinceSnapshot(boardId) {
        const log = this.boards.get(boardId);
        if (!log)
            return 0;
        return log.ops.filter(op => op.seq > log.snapshotWatermark).length;
    }
    /**
     * 记录快照水位
     */
    setSnapshot(boardId, coveredSeq, coverUrl) {
        const log = this.ensure(boardId);
        log.snapshotWatermark = coveredSeq;
        log.snapshotUrl = coverUrl;
        console.log(`[OpLog] snapshot recorded for ${boardId}, watermark=${coveredSeq}`);
    }
    getSnapshot(boardId) {
        const log = this.boards.get(boardId);
        return {
            watermark: log?.snapshotWatermark || 0,
            url: log?.snapshotUrl || ''
        };
    }
    /**
     * flush 单个画板（撤销记录不进 DB，由快照覆盖）
     */
    async flushBoard(boardId) {
        const log = this.boards.get(boardId);
        if (!log || log.dirtyCount === 0)
            return;
        const toFlush = log.ops.filter(op => !op.persisted && op.kind === 'stroke');
        if (toFlush.length === 0) {
            log.dirtyCount = 0;
            return;
        }
        try {
            await (0, PersistenceAdapter_1.persistStrokes)(toFlush.map(op => ({
                seq: op.seq,
                boardId: op.boardId,
                userId: op.userId,
                stroke: op.payload,
                createdAt: op.createdAt
            })));
            toFlush.forEach(op => (op.persisted = true));
            log.dirtyCount = 0;
        }
        catch (e) {
            console.error(`[OpLog] flush failed for ${boardId}:`, e);
        }
    }
    async flushAll() {
        for (const boardId of Array.from(this.boards.keys())) {
            await this.flushBoard(boardId);
        }
    }
    async destroy() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flushAll();
    }
}
exports.OpLog = OpLog;
//# sourceMappingURL=OpLog.js.map