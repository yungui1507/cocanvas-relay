export type OpKind = 'stroke' | 'undo';
export interface LogOp {
    seq: number;
    boardId: string;
    userId: string;
    kind: OpKind;
    /** kind=stroke 时是完整笔画对象；kind=undo 时是被撤销的 strokeId */
    payload: any;
    createdAt: number;
    persisted: boolean;
}
export declare class OpLog {
    private boards;
    private flushTimer;
    constructor();
    private ensure;
    /**
     * 追加笔画操作
     */
    appendStroke(boardId: string, userId: string, stroke: any): LogOp;
    /**
     * 追加撤销操作
     * @param strokeId 被撤销的笔画
     */
    appendUndo(boardId: string, userId: string, strokeId: string): LogOp;
    /**
     * 推入并做窗口裁剪
     */
    private pushOp;
    /**
     * 拉取 since 之后的操作
     */
    since(boardId: string, sinceSeq: number): LogOp[];
    /**
     * 当前最大 seq
     */
    currentSeq(boardId: string): number;
    /**
     * 取最近 n 条
     */
    recent(boardId: string, n: number): LogOp[];
    /**
     * 判断 since 是否落在内存窗口之外
     */
    isOutOfWindow(boardId: string, sinceSeq: number): boolean;
    /**
     * 水位之后的累计操作数（达到阈值触发快照）
     */
    countSinceSnapshot(boardId: string): number;
    /**
     * 记录快照水位
     */
    setSnapshot(boardId: string, coveredSeq: number, coverUrl: string): void;
    getSnapshot(boardId: string): {
        watermark: number;
        url: string;
    };
    /**
     * flush 单个画板（撤销记录不进 DB，由快照覆盖）
     */
    flushBoard(boardId: string): Promise<void>;
    flushAll(): Promise<void>;
    destroy(): Promise<void>;
}
