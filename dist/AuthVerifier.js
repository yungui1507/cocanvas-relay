"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGuestMode = isGuestMode;
exports.verifyToken = verifyToken;
exports.checkBoardMember = checkBoardMember;
exports.invalidateMember = invalidateMember;
/**
 * 鉴权与画板成员校验
 *
 * 流程：
 *  1. 用客户端带来的 token 调 WorkBuddy Auth 验证
 *  2. 查 board_members 确认该用户是画板成员
 *  3. 都通过才允许入房
 *
 * 两次查询都走缓存，避免每条连接都打后端。
 */
const node_fetch_1 = __importDefault(require("node-fetch"));
const config_1 = require("./config");
const AUTH_PATH = '/.cloud/auth/v1';
const DB_PATH = '/.cloud/database/rest';
/** 服务端访问数据库用的 token，真实部署应由服务端持有，不下发给客户端 */
const SERVICE_TOKEN = process.env.WB_SERVICE_TOKEN || '';
const authCache = new Map();
const memberCache = new Map();
function cacheSet(map, key, value) {
    if (map.size >= config_1.Config.AUTH_CACHE.MAX_SIZE) {
        const firstKey = map.keys().next().value;
        if (firstKey !== undefined) {
            map.delete(firstKey);
        }
    }
    map.set(key, { value, expireAt: Date.now() + config_1.Config.AUTH_CACHE.TTL_MS });
}
function cacheGet(map, key) {
    const hit = map.get(key);
    if (!hit || hit.expireAt <= Date.now()) {
        return null;
    }
    return hit.value;
}
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
// ===== 免登录模式 =====
// 未配置 WorkBuddy 云服务时，中继进入免登录模式：
// token 由客户端自定，格式 "userId:nickname"，直接信任，房间号即准入凭证。
function isGuestMode() {
    return !config_1.Config.WORKBUDDY.endpoint;
}
// ===== Auth 校验 =====
/**
 * 验证 token，返回用户信息。无效返回 null。
 */
async function verifyToken(token) {
    if (!token)
        return null;
    if (isGuestMode()) {
        const idx = token.indexOf(':');
        const userId = idx > 0 ? token.substring(0, idx) : token;
        const nickname = idx > 0 ? token.substring(idx + 1) : '';
        return { userId: userId, nickname: nickname || '画友', avatarUrl: '' };
    }
    const cached = cacheGet(authCache, token);
    if (cached) {
        return cached;
    }
    try {
        const res = await (0, node_fetch_1.default)(`${config_1.Config.WORKBUDDY.endpoint}${AUTH_PATH}/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Publishable-Key': config_1.Config.WORKBUDDY.publishableKey,
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) {
            console.warn(`[Auth] token rejected, status=${res.status}`);
            return null;
        }
        const body = await res.json();
        const user = {
            userId: body.userId || body.user_id || body.id,
            nickname: body.nickname || body.name || '用户',
            avatarUrl: body.avatarUrl || body.avatar_url || ''
        };
        if (!user.userId) {
            return null;
        }
        cacheSet(authCache, token, user);
        return user;
    }
    catch (e) {
        console.error('[Auth] verifyToken failed:', e);
        return null;
    }
}
// ===== 画板成员校验 =====
/**
 * 确认用户是画板成员，返回成员信息。非成员返回 null。
 */
async function checkBoardMember(userId, boardId) {
    if (isGuestMode()) {
        // 免登录模式：房间号即画板，任何持码者均可入房协作
        return { userId: userId, nickname: '画友', color: '#378ADD', role: 'editor' };
    }
    const key = `${boardId}:${userId}`;
    const cached = cacheGet(memberCache, key);
    if (cached) {
        return cached;
    }
    try {
        const url = `${config_1.Config.WORKBUDDY.endpoint}${DB_PATH}/board_members` +
            `?boardId=eq.${encodeURIComponent(boardId)}&userId=eq.${encodeURIComponent(userId)}`;
        const res = await (0, node_fetch_1.default)(url, {
            method: 'GET',
            headers: dbHeaders()
        });
        if (!res.ok) {
            console.error(`[Auth] member query failed, status=${res.status}`);
            return null;
        }
        const rows = await res.json();
        if (!rows || rows.length === 0) {
            return null;
        }
        const row = rows[0];
        const member = {
            userId: row.userId,
            nickname: row.nickname || '成员',
            color: row.color || '#378ADD',
            role: row.role || 'editor'
        };
        cacheSet(memberCache, key, member);
        return member;
    }
    catch (e) {
        console.error('[Auth] checkBoardMember failed:', e);
        return null;
    }
}
/**
 * 成员变更时手动清缓存（移除成员/权限变更接口调用）
 */
function invalidateMember(boardId, userId) {
    if (userId) {
        memberCache.delete(`${boardId}:${userId}`);
        return;
    }
    const prefix = `${boardId}:`;
    for (const key of Array.from(memberCache.keys())) {
        if (key.startsWith(prefix)) {
            memberCache.delete(key);
        }
    }
}
//# sourceMappingURL=AuthVerifier.js.map