/* <AI>
MemoryAdapter — StorageAdapter backed by in-memory Maps.

OVERVIEW
- Zero dependencies: no DB, no filesystem.
- Collection-parameterized: collections are created lazily on first access.
- Suitable for Node.js CLI runs where persistence is not needed, and for unit tests.
- Auto-increments IDs per collection.
- State is lost when the process exits (by design).

USAGE
  import MemoryAdapter from './class.MemoryAdapter.js';
  const adapter = new MemoryAdapter();
  BoidLibrary.default_adapter = adapter;
  TankLibrary.default_adapter = adapter;

ID HANDLING
  If a row already has an `id`, it is used as-is (upsert semantics).
  If id is absent or undefined, the next counter value is assigned.
</AI> */

import StorageAdapter from './class.StorageAdapter.js';

export default class MemoryAdapter extends StorageAdapter {

	constructor() {
		super();
		// keyed by collection name → { index: Map, data: Map, nextId: number }
		this._stores = {};
	}

	// lazily create per-collection storage
	_collection(collection) {
		let s = this._stores[collection];
		if ( !s ) {
			s = { index: new Map(), data: new Map(), nextId: 1 };
			this._stores[collection] = s;
		}
		return s;
	}

	async indexPut(collection, row) {
		const s = this._collection(collection);
		let id = row.id;
		if ( id === undefined || id === null ) {
			id = s.nextId++;
		}
		else if ( id >= s.nextId ) {
			s.nextId = id + 1;
		}
		const r = { ...row, id };
		s.index.set(id, r);
		return id;
	}

	async indexGet(collection, id)    { return this._collection(collection).index.get(id) ?? null; }
	async indexAll(collection)        { return [ ...this._collection(collection).index.values() ]; }
	async indexDelete(collection, id) { this._collection(collection).index.delete(id); }
	async dataPut(collection, id, record) { this._collection(collection).data.set(id, record); }
	async dataGet(collection, id)     { return this._collection(collection).data.get(id) ?? null; }
	async dataDelete(collection, id)  { this._collection(collection).data.delete(id); }

}
