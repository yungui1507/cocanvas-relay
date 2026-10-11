/**
 * 批量写入笔画操作
 */
export declare function persistStrokes(ops: any[]): Promise<void>;
/**
 * 写入快照元信息
 *
 * 存到 board_snapshots 表：记录某画板的快照覆盖到哪个 seq，
 * 新成员加入时可直接从该 seq 起步，不必拉全量操作日志。
 */
export declare function saveSnapshotMeta(boardId: string, coveredSeq: number, coverUrl: string): Promise<void>;
/**
 * 读取画板最新快照元信息
 */
export declare function loadSnapshotMeta(boardId: string): Promise<any | null>;
/**
 * 更新画板最后活跃时间 + 缩略图
 */
export declare function touchBoard(boardId: string, coverUrl?: string): Promise<void>;
