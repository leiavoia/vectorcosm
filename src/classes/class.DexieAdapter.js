/* <AI>
DexieAdapter — StorageAdapter implementation backed by Dexie (IndexedDB).

OVERVIEW
- Collection-parameterized: maps collection names to Dexie table pairs via COLLECTIONS config.
- Used in the browser Web Worker (default for all library instances).
- Adding a new collection: add an entry to COLLECTIONS and create the Dexie tables in db.js.

COLLECTIONS MAP
  'boids' → { index: 'population_index', data: 'population_data' }
  'tanks' → { index: 'tank_index', data: 'tank_data' }

USAGE
  import DexieAdapter from './class.DexieAdapter.js';
  BoidLibrary.default_adapter = new DexieAdapter();
  TankLibrary.default_adapter = new DexieAdapter();

NOTE
- Multiple instances share the same Dexie DB — that's intentional.
- Do NOT import this in Node.js / CLI contexts. Dexie requires IndexedDB.
</AI> */

import StorageAdapter from './class.StorageAdapter.js';
import { db } from './db.js';

// maps collection name → Dexie table names
const COLLECTIONS = {
	boids: { index: 'population_index', data: 'population_data' },
	tanks: { index: 'tank_index', data: 'tank_data' },
};

export default class DexieAdapter extends StorageAdapter {

	_tables(collection) {
		const c = COLLECTIONS[collection];
		if ( !c ) { throw new Error(`DexieAdapter: unknown collection '${collection}'`); }
		return { index: db[c.index], data: db[c.data] };
	}

	async indexPut(collection, row)           { return this._tables(collection).index.put(row); }
	async indexGet(collection, id)            { return ( await this._tables(collection).index.get(id) ) ?? null; }
	async indexAll(collection)                { return this._tables(collection).index.toArray(); }
	async indexDelete(collection, id)         { return this._tables(collection).index.delete(id); }
	async dataPut(collection, id, record)     { return this._tables(collection).data.put(record); }
	async dataGet(collection, id)             { return ( await this._tables(collection).data.get(id) ) ?? null; }
	async dataDelete(collection, id)          { return this._tables(collection).data.delete(id); }

}
