"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisBridge = void 0;
const crypto_1 = require("crypto");
const BOARD_CHANNEL = (boardId) => `cocanvas:board:${boardId}`;
const PRESENCE_KEY = (boardId) => `cocanvas:presence:${boardId}`;
const PRESENCE_TTL_SEC = 60; // 在线状态 TTL，略大于心跳间隔
class RedisBridge {
    constructor(handlers) {
        this.pub = null;
        this.sub = null;
        this.enabled = false;
        /** 本实例唯一 ID，用于识别并过滤自己 publish 的消息 */
        this.instanceId = (0, crypto_1.randomUUID)();
        /** 本实例连接过的画板 */
        this.subscribedBoards = new Set();
        this.handlers = handlers;
    }
    /**
     * 连接 Redis；未配置则降级为单实例模式
     */
    async init() {
        const url = process.env.REDIS_URL;
        if (!url) {
            console.log('[Redis] REDIS_URL not set, running in single-instance mode');
            return false;
        }
        try {
            // 动态加载可选依赖 redis；未安装且配置了 REDIS_URL 时给出明确报错
            let createClient;
            try {
                createClient = require('redis').createClient;
            }
            catch (e) {
                console.error('[Redis] REDIS_URL is set but the optional "redis" package is not installed');
                return false;
            }
            this.pub = createClient({ url });
            this.sub = this.pub.duplicate();
            this.pub.on('error', (e) => console.error('[Redis] pub error:', e.message));
            this.sub.on('error', (e) => console.error('[Redis] sub error:', e.message));
            await this.pub.connect();
            await this.sub.connect();
            this.enabled = true;
            console.log('[Redis] connected');
            return true;
        }
        catch (e) {
            console.error('[Redis] connect failed, falling back to single instance:', e);
            this.enabled = false;
            return false;
        }
    }
    isEnabled() {
        return this.enabled;
    }
    /**
     * 加入画板频道（连接建立时调用）
     */
    async subscribeBoard(boardId) {
        if (!this.enabled || !this.sub)
            return;
        const channel = BOARD_CHANNEL(boardId);
        if (this.subscribedBoards.has(boardId))
            return;
        await this.sub.subscribe(channel, (message) => {
            // 过滤自己 publish 的消息——本地已单独广播过，否则本地成员会收到两次
            let envelope;
            try {
                envelope = JSON.parse(message);
            }
            catch (e) {
                console.warn('[Redis] malformed envelope, ignoring');
                return;
            }
            if (envelope.origin === this.instanceId) {
                return;
            }
            this.handlers.onRemoteMessage(boardId, envelope.payload);
        });
        this.subscribedBoards.add(boardId);
        console.log(`[Redis] subscribed to ${channel}`);
    }
    /**
     * 离开画板频道
     */
    async unsubscribeBoard(boardId) {
        if (!this.enabled || !this.sub)
            return;
        if (!this.subscribedBoards.has(boardId))
            return;
        try {
            await this.sub.unsubscribe(BOARD_CHANNEL(boardId));
        }
        catch (e) {
            // ignore
        }
        this.subscribedBoards.delete(boardId);
    }
    /**
     * 跨实例广播
     *
     * 消息包一层信封带 instanceId，订阅端据此过滤自身回声。
     * 注意：本地成员需由调用方单独广播（rooms.broadcast），
     * 因为本实例的订阅回调会跳过自己发的消息。
     */
    async publish(boardId, payload) {
        if (!this.enabled || !this.pub)
            return;
        try {
            const envelope = JSON.stringify({
                origin: this.instanceId,
                ts: Date.now(),
                payload
            });
            await this.pub.publish(BOARD_CHANNEL(boardId), envelope);
        }
        catch (e) {
            console.error('[Redis] publish failed:', e);
        }
    }
    /**
     * 标记在线（TTL 自动清理，进程崩溃不留幽灵）
     */
    async markOnline(boardId, userId) {
        if (!this.enabled || !this.pub)
            return;
        try {
            const key = PRESENCE_KEY(boardId);
            await this.pub.hSet(key, userId, Date.now().toString());
            await this.pub.expire(key, PRESENCE_TTL_SEC);
        }
        catch (e) {
            console.error('[Redis] markOnline failed:', e);
        }
    }
    /**
     * 标记离线
     */
    async markOffline(boardId, userId) {
        if (!this.enabled || !this.pub)
            return;
        try {
            await this.pub.hDel(PRESENCE_KEY(boardId), userId);
        }
        catch (e) {
            // ignore
        }
    }
    /**
     * 读取在线成员（跨实例汇总）
     */
    async getOnlineUsers(boardId) {
        if (!this.enabled || !this.pub)
            return [];
        try {
            return await this.pub.hKeys(PRESENCE_KEY(boardId));
        }
        catch (e) {
            console.error('[Redis] getOnlineUsers failed:', e);
            return [];
        }
    }
    /**
     * 清理（进程退出时调用）
     */
    async destroy() {
        try {
            if (this.sub)
                await this.sub.quit();
            if (this.pub)
                await this.pub.quit();
        }
        catch (e) {
            // ignore
        }
        this.enabled = false;
    }
}
exports.RedisBridge = RedisBridge;
//# sourceMappingURL=RedisBridge.js.map