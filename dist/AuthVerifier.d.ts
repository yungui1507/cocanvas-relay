export interface AuthUser {
    userId: string;
    nickname: string;
    avatarUrl: string;
}
export interface BoardMemberInfo {
    userId: string;
    nickname: string;
    color: string;
    role: 'owner' | 'editor';
}
export declare function isGuestMode(): boolean;
/**
 * 验证 token，返回用户信息。无效返回 null。
 */
export declare function verifyToken(token: string): Promise<AuthUser | null>;
/**
 * 确认用户是画板成员，返回成员信息。非成员返回 null。
 */
export declare function checkBoardMember(userId: string, boardId: string): Promise<BoardMemberInfo | null>;
/**
 * 成员变更时手动清缓存（移除成员/权限变更接口调用）
 */
export declare function invalidateMember(boardId: string, userId?: string): void;
