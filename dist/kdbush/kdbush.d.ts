export declare class KDBush {
    private data;
    ids: Uint16Array | Uint32Array;
    coords: InstanceType<TypedArrayConstructor>;
    private _pos;
    private _finished;
    private numItems;
    nodeSize: number;
    private ArrayType;
    private IndexArrayType;
    constructor(numItems: number, nodeSize?: number, ArrayType?: TypedArrayConstructor, data?: ArrayBuffer);
    add(x: number, y: number): number;
    finish(): this;
}
type TypedArrayConstructor = Int8ArrayConstructor | Uint8ArrayConstructor | Uint8ClampedArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor | Float32ArrayConstructor | Float64ArrayConstructor;
export {};
