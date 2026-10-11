/**
 * 配置
 * 所有敏感值走环境变量，不硬编码
 */
export declare const Config: {
    PORT: number;
    /** WorkBuddy 云服务配置（来自 publicConfig） */
    WORKBUDDY: {
        endpoint: string;
        publishableKey: string;
    };
    /** token 校验缓存 */
    AUTH_CACHE: {
        /** 缓存 TTL，避免每次连接都打 Auth 接口 */
        TTL_MS: number;
        MAX_SIZE: number;
    };
    /** 操作日志 */
    OPLOG: {
        /** 每个画板内存缓冲条数 */
        WINDOW_SIZE: number;
        /** 落盘阈值，达到即批量写入 WorkBuddy DB */
        FLUSH_THRESHOLD: number;
        /** flush 间隔 */
        FLUSH_INTERVAL_MS: number;
    };
    /** 快照压缩 */
    SNAPSHOT: {
        /** 水位之后累计多少操作触发一次快照 */
        TRIGGER_COUNT: number;
        /** 等待客户端上传快照的超时（毫秒） */
        UPLOAD_TIMEOUT_MS: number;
    };
    /** 心跳 */
    HEARTBEAT: {
        /** 服务端每多少秒 ping 一次客户端 */
        INTERVAL_MS: number;
        /** 未收到 pong 则断开 */
        TIMEOUT_MS: number;
    };
    /** 关闭码 */
    CLOSE_CODE: {
        AUTH_FAILED: number;
        NOT_MEMBER: number;
        RATE_LIMITED: number;
        SERVER_ERROR: number;
    };
    /** 单连接发送频率限制 */
    RATE_LIMIT: {
        /** 窗口 */
        WINDOW_MS: number;
        /** 窗口内最大消息数 */
        MAX_MSGS: number;
    };
    /** 最大画板成员数 */
    MAX_MEMBERS_PER_BOARD: number;
};
