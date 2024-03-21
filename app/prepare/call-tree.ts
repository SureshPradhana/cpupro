type Entry<T> = {
    nodeIndex: number;
    host: T;
    parent: Entry<T> | null;
    subtreeSize: number;
    children?: Entry<T>[];
};

type TreeMemory = {
    buffer: ArrayBuffer;
    sourceDictMap: Uint32Array;
    sourceNodesMap: Uint32Array;
    nodes: Uint32Array;
    parent: Uint32Array;
    subtreeSize: Uint32Array;
    nested: Uint32Array;
    compute1: Uint32Array;
    compute2: Uint32Array;
}

type NumericArray =
    // | number[]
    // | Uint8Array
    // | Uint16Array
    | Uint32Array;

const NULL_ARRAY = new Uint32Array();

export class CallTree<T> {
    dictionary: T[];              // entries
    sourceIdToNode: NumericArray; // sourceNodeId -> index of nodes
    sampleIdToNode: NumericArray; // sampleId  -> index of nodes
    nodes: NumericArray;          // nodeIndex -> index of dictionary
    parent: NumericArray;         // nodeIndex -> index of nodes
    subtreeSize: NumericArray;    // nodeIndex -> number of nodes in subtree, 0 when no children
    nested: NumericArray;         // nodeIndex -> index of nodes

    root: Entry<T>;
    entryRefMap: Map<number, WeakRef<Entry<T>>>;
    childrenRefMap: Map<number, WeakRef<Entry<T>[]>>;

    selfTimes: Uint32Array;
    nestedTimes: Uint32Array;

    constructor(
        dictionary: T[],
        sourceIdToNode: NumericArray,
        nodes?: NumericArray,
        parent?: NumericArray,
        subtreeSize?: NumericArray,
        nested?: NumericArray
    ) {
        this.dictionary = dictionary;
        this.sourceIdToNode = sourceIdToNode;
        this.sampleIdToNode = NULL_ARRAY; // setting up later

        this.nodes = nodes || new Uint32Array(dictionary.length);
        this.parent = parent || new Uint32Array(nodes.length);
        this.subtreeSize = subtreeSize || new Uint32Array(nodes.length);
        this.nested = nested || new Uint32Array(nodes.length);

        this.entryRefMap = new Map();
        this.childrenRefMap = new Map();

        // use Object.defineProperty() since jora iterates through own properties only
        Object.defineProperty(this, 'root', {
            enumerable: true,
            get: () => this.getEntry(0)
        });

        this.selfTimes = new Uint32Array();
        this.nestedTimes = new Uint32Array();
    }

    createEntry(nodeIndex: number): Entry<T> {
        const entry = {
            nodeIndex,
            host: this.dictionary[this.nodes[nodeIndex]],
            parent: null,
            subtreeSize: this.subtreeSize[nodeIndex],
            selfTime: this.selfTimes[nodeIndex],
            totalTime: this.selfTimes[nodeIndex] + this.nestedTimes[nodeIndex]
        };

        if (nodeIndex !== 0) {
            Object.defineProperty(entry, 'parent', {
                enumerable: true,
                get: () => this.getEntry(this.parent[nodeIndex])
            });
        }

        if (this.subtreeSize[nodeIndex]) {
            Object.defineProperty(entry, 'children', {
                enumerable: true,
                get: () => this.getChildren(nodeIndex)
            });
        }

        return entry;
    }
    getEntry(nodeIndex: number): Entry<T> {
        const entryRef = this.entryRefMap.get(nodeIndex);
        let entry: Entry<T>;

        if (entryRef === undefined || (entry = entryRef.deref()) === undefined) {
            this.entryRefMap.set(
                nodeIndex,
                new WeakRef(entry = this.createEntry(nodeIndex))
            );
        }

        return entry;
    }
    getChildren(nodeIndex: number): Entry<T>[] {
        const childrenRef = this.childrenRefMap.get(nodeIndex);
        let children: Entry<T>[];

        if (childrenRef === undefined || (children = childrenRef.deref()) === undefined) {
            this.childrenRefMap.set(
                nodeIndex,
                new WeakRef(children = [...this.map(this.children(nodeIndex))])
            );
        }

        return children;
    }

    *map(nodeIndexes: Iterable<number>) {
        for (const nodeIndex of nodeIndexes) {
            yield this.getEntry(nodeIndex);
        }
    }

    *selectNodes(value: number | T, includeNested = false) {
        if (typeof value !== 'number') {
            value = this.dictionary.indexOf(value);
        }

        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i] === value) {
                yield i;

                // skip subtree since nested nodes are not accepted
                if (!includeNested) {
                    i += this.subtreeSize[i];
                }
            }
        }
    }

    *ancestors(nodeIndex: number) {
        nodeIndex = this.parent[nodeIndex];

        while (nodeIndex !== 0) {
            yield nodeIndex;
            nodeIndex = this.parent[nodeIndex];
        }
    }
    *children(nodeIndex: number) {
        const end = nodeIndex + this.subtreeSize[nodeIndex];

        while (nodeIndex < end) {
            yield ++nodeIndex;
            nodeIndex += this.subtreeSize[nodeIndex];
        }
    }
    *subtree(nodeIndex: number) {
        const end = nodeIndex + this.subtreeSize[nodeIndex];

        while (nodeIndex < end) {
            yield ++nodeIndex;
        }
    }
}