export interface BridgeHandlers {
    /** 收到其他实例转发的消息（已过滤掉本实例自己发的） */
    onRemoteMessage: (boardId: string, payload: string) => void;
    /** 在线成员变化 */
    onPresenceChange: (boardId: string, onlineUserIds: string[]) => void;
}
export declare class RedisBridge {
    private pub;
    private sub;
    private handlers;
    private enabled;
    /** 本实例唯一 ID，用于识别并过滤自己 publish 的消息 */
    private instanceId;
    /** 本实例连接过的画板 */
    private subscribedBoards;
    constructor(handlers: BridgeHandlers);
    /**
     * 连接 Redis；未配置则降级为单实例模式
     */
    init(): Promise<boolean>;
    isEnabled(): boolean;
    /**
     * 加入画板频道（连接建立时调用）
     */
    subscribeBoard(boardId: string): Promise<void>;
    /**
     * 离开画板频道
     */
    unsubscribeBoard(boardId: string): Promise<void>;
    /**
     * 跨实例广播
     *
     * 消息包一层信封带 instanceId，订阅端据此过滤自身回声。
     * 注意：本地成员需由调用方单独广播（rooms.broadcast），
     * 因为本实例的订阅回调会跳过自己发的消息。
     */
    publish(boardId: string, payload: string): Promise<void>;
    /**
     * 标记在线（TTL 自动清理，进程崩溃不留幽灵）
     */
    markOnline(boardId: string, userId: string): Promise<void>;
    /**
     * 标记离线
     */
    markOffline(boardId: string, userId: string): Promise<void>;
    /**
     * 读取在线成员（跨实例汇总）
     */
    getOnlineUsers(boardId: string): Promise<string[]>;
    /**
     * 清理（进程退出时调用）
     */
    destroy(): Promise<void>;
}
