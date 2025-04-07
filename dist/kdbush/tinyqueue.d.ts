export default class TinyQueue<T> {
    private data;
    length: number;
    private compare;
    constructor(data?: T[], compare?: (a: T, b: T) => number);
    push(item: T): void;
    pop(): T | undefined;
    peek(): T | undefined;
    private _up;
    private _down;
}
