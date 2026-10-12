"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
/**
 * 配置
 * 所有敏感值走环境变量，不硬编码
 */
exports.Config = {
    PORT: parseInt(process.env.PORT || '3000', 10),
    /** WorkBuddy 云服务配置（来自 publicConfig） */
    WORKBUDDY: {
        endpoint: process.env.WB_ENDPOINT || '',
        publishableKey: process.env.WB_PUBLISHABLE_KEY || ''
    },
    /** token 校验缓存 */
    AUTH_CACHE: {
        /** 缓存 TTL，避免每次连接都打 Auth 接口 */
        TTL_MS: 5 * 60 * 1000,
        MAX_SIZE: 10000
    },
    /** 操作日志 */
    OPLOG: {
        /** 每个画板内存缓冲条数 */
        WINDOW_SIZE: 500,
        /** 落盘阈值，达到即批量写入 WorkBuddy DB */
        FLUSH_THRESHOLD: 50,
        /** flush 间隔 */
        FLUSH_INTERVAL_MS: 3000
    },
    /** 快照压缩 */
    SNAPSHOT: {
        /** 水位之后累计多少操作触发一次快照 */
        TRIGGER_COUNT: 1000,
        /** 等待客户端上传快照的超时（毫秒） */
        UPLOAD_TIMEOUT_MS: 30000
    },
    /** 心跳 */
    HEARTBEAT: {
        /** 服务端每多少秒 ping 一次客户端 */
        INTERVAL_MS: 30000,
        /** 未收到 pong 则断开 */
        TIMEOUT_MS: 10000
    },
    /** 关闭码 */
    CLOSE_CODE: {
        AUTH_FAILED: 4001,
        NOT_MEMBER: 4003,
        RATE_LIMITED: 4029,
        SERVER_ERROR: 4005
    },
    /** 单连接发送频率限制 */
    RATE_LIMIT: {
        /** 窗口 */
        WINDOW_MS: 1000,
        /** 窗口内最大消息数 */
        MAX_MSGS: 200
    },
    /** 最大画板成员数 */
    MAX_MEMBERS_PER_BOARD: 8
};
//# sourceMappingURL=config.js.map