/* <AI>
StorageAdapter — Abstract base class for pluggable persistence backends.

PURPOSE
- Defines the generic CRUD interface between library classes and their persistence layer.
- All methods are parameterized by `collection` (string, e.g. 'boids', 'tanks').
- Concrete implementations: DexieAdapter (browser/IndexedDB), FileAdapter (Node.js/CLI),
  MemoryAdapter (in-memory, for tests / Node.js when no persistence needed).
- Adding a new object type requires ZERO changes to adapters — just use a new collection name.

INTERFACE (7 methods, collection-parameterized):
  indexPut(collection, row)            → Promise<id>      — upsert index row; auto-assigns id if missing
  indexGet(collection, id)             → Promise<row|null>
  indexAll(collection)                 → Promise<row[]>
  indexDelete(collection, id)          → Promise<void>
  dataPut(collection, id, record)      → Promise<void>    — record is an opaque object stored as-is
  dataGet(collection, id)              → Promise<record|null>
  dataDelete(collection, id)           → Promise<void>

USAGE
  BoidLibrary and TankLibrary have a static `default_adapter` property.
  Set it once at worker startup before any library instance is created:

    import DexieAdapter from './class.DexieAdapter.js';
    BoidLibrary.default_adapter = new DexieAdapter();
    TankLibrary.default_adapter = new DexieAdapter();

  Or pass per-instance:
    const lib = new BoidLibrary(myAdapter);

  Library classes pass their collection name into every adapter call:
    await this.adapter.indexPut('boids', row);
    await this.adapter.dataPut('tanks', id, { id, scene });

ADDING ADAPTERS
  Subclass StorageAdapter, implement all 7 methods. No registration needed.
</AI> */

export default class StorageAdapter {

	async indexPut(collection, row)           { throw new Error('StorageAdapter: indexPut not implemented'); }
	async indexGet(collection, id)            { throw new Error('StorageAdapter: indexGet not implemented'); }
	async indexAll(collection)                { throw new Error('StorageAdapter: indexAll not implemented'); }
	async indexDelete(collection, id)         { throw new Error('StorageAdapter: indexDelete not implemented'); }
	async dataPut(collection, id, record)     { throw new Error('StorageAdapter: dataPut not implemented'); }
	async dataGet(collection, id)             { throw new Error('StorageAdapter: dataGet not implemented'); }
	async dataDelete(collection, id)          { throw new Error('StorageAdapter: dataDelete not implemented'); }

}
