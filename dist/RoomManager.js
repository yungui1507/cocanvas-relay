"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = exports.Room = void 0;
const config_1 = require("./config");
class Room {
    constructor(boardId) {
        this.members = new Map();
        this.boardId = boardId;
        this.createdAt = Date.now();
    }
    get size() {
        return this.members.size;
    }
    add(member) {
        // 同用户多端登录：保留最后一个连接
        const existing = this.members.get(member.userId);
        if (existing && existing.ws !== member.ws) {
            try {
                existing.ws.close(config_1.Config.CLOSE_CODE.SERVER_ERROR, 'replaced by new connection');
            }
            catch (e) {
                // ignore
            }
        }
        this.members.set(member.userId, member);
    }
    remove(userId) {
        this.members.delete(userId);
    }
    get(userId) {
        return this.members.get(userId);
    }
    onlineUserIds() {
        return Array.from(this.members.keys());
    }
    /**
     * 限流检查：窗口内消息数超限则拒绝
     */
    checkRateLimit(userId) {
        const m = this.members.get(userId);
        if (!m)
            return false;
        const now = Date.now();
        if (now - m.rateWindowStart > config_1.Config.RATE_LIMIT.WINDOW_MS) {
            m.rateWindowStart = now;
            m.rateCount = 0;
        }
        m.rateCount++;
        return m.rateCount <= config_1.Config.RATE_LIMIT.MAX_MSGS;
    }
}
exports.Room = Room;
class RoomManager {
    constructor() {
        this.rooms = new Map();
    }
    /**
     * 加入房间（房间不存在则创建）
     */
    join(boardId, member) {
        let room = this.rooms.get(boardId);
        if (!room) {
            room = new Room(boardId);
            this.rooms.set(boardId, room);
        }
        room.add(member);
        return room;
    }
    /**
     * 离开房间（房间空则销毁）
     */
    leave(boardId, userId) {
        const room = this.rooms.get(boardId);
        if (!room)
            return null;
        room.remove(userId);
        if (room.size === 0) {
            this.rooms.delete(boardId);
            return null;
        }
        return room;
    }
    get(boardId) {
        return this.rooms.get(boardId);
    }
    /**
     * 广播到房间内所有连接（可排除某个连接）
     */
    broadcast(boardId, payload, excludeUserId) {
        const room = this.rooms.get(boardId);
        if (!room)
            return 0;
        let sent = 0;
        for (const [userId, member] of room.members) {
            if (userId === excludeUserId)
                continue;
            if (member.ws.readyState !== 1)
                continue; // 1 = OPEN
            try {
                member.ws.send(payload);
                sent++;
            }
            catch (e) {
                // 发送失败说明连接已死，交给心跳清理
            }
        }
        return sent;
    }
    /**
     * 广播在线状态
     */
    broadcastPresence(boardId) {
        const room = this.rooms.get(boardId);
        if (!room)
            return;
        const msg = JSON.stringify({
            type: 'presence',
            boardId,
            data: { boardId, onlineUserIds: room.onlineUserIds() }
        });
        this.broadcast(boardId, msg);
    }
    /**
     * 获取房间统计
     */
    stats() {
        let totalMembers = 0;
        for (const room of this.rooms.values()) {
            totalMembers += room.size;
        }
        return { totalRooms: this.rooms.size, totalMembers };
    }
    /**
     * 清理空房间
     */
    cleanup() {
        for (const [boardId, room] of Array.from(this.rooms.entries())) {
            if (room.size === 0) {
                this.rooms.delete(boardId);
            }
        }
    }
}
exports.RoomManager = RoomManager;
//# sourceMappingURL=RoomManager.js.map