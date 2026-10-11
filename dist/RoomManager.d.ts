/**
 * 房间管理器
 * 一个画板 = 一个房间 = 一组连接
 */
import { WebSocket } from 'ws';
export interface RoomMember {
    userId: string;
    nickname: string;
    color: string;
    ws: WebSocket;
    /** 限流窗口起点 */
    rateWindowStart: number;
    /** 窗口内消息数 */
    rateCount: number;
    /** 是否等待 pong */
    awaitingPong: boolean;
}
export declare class Room {
    boardId: string;
    members: Map<string, RoomMember>;
    createdAt: number;
    constructor(boardId: string);
    get size(): number;
    add(member: RoomMember): void;
    remove(userId: string): void;
    get(userId: string): RoomMember | undefined;
    onlineUserIds(): string[];
    /**
     * 限流检查：窗口内消息数超限则拒绝
     */
    checkRateLimit(userId: string): boolean;
}
export declare class RoomManager {
    private rooms;
    /**
     * 加入房间（房间不存在则创建）
     */
    join(boardId: string, member: RoomMember): Room;
    /**
     * 离开房间（房间空则销毁）
     */
    leave(boardId: string, userId: string): Room | null;
    get(boardId: string): Room | undefined;
    /**
     * 广播到房间内所有连接（可排除某个连接）
     */
    broadcast(boardId: string, payload: string, excludeUserId?: string): number;
    /**
     * 广播在线状态
     */
    broadcastPresence(boardId: string): void;
    /**
     * 获取房间统计
     */
    stats(): {
        totalRooms: number;
        totalMembers: number;
    };
    /**
     * 清理空房间
     */
    cleanup(): void;
}
