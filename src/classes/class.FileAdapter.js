/* <AI>
FileAdapter — StorageAdapter backed by the filesystem (Node.js / CLI only).

OVERVIEW
- Zero browser dependencies. Uses Node.js `fs/promises` and `path`.
- Collection-parameterized: each collection maps to a subdirectory under saves/.
  e.g. 'boids' → saves/boids/, 'tanks' → saves/tanks/.
- Each record is ONE self-contained JSON file: `saves/<collection>/<id>.json`.
- Compatible with the browser fetch path: `saves/tanks/<name>.json` URL params in lab.js
  fetch the same files that FileAdapter writes.

FILE FORMAT (opaque — whatever the library class writes)
  saves/boids/<id>.json:  { id, label, date, count, ..., specimens: [...] }
  saves/tanks/<id>.json:  { id, label, date, width, ..., scene: {...} }

INDEX vs DATA
  FileAdapter stores everything in one file. `indexPut` merges the row into the file
  without clobbering data already written. `indexGet` returns the file contents minus
  any key listed in `data_keys` (configured per-collection, or empty by default).
  `dataPut`/`dataGet` read/write the same file. The split is a logical convenience
  matching the adapter interface — physically it's one file.

ID ASSIGNMENT
- FileAdapter only manages integer-named files (e.g. `1.json`, `42.json`).
- Human-named files (`my_tank.json`, etc.) coexist in the same directory untouched.
- indexAll() scans only integer-named files.
- New IDs assigned as max(existing integer IDs) + 1 (floor 1 if empty).

DATA KEY STRIPPING
  `data_keys` config per collection tells indexGet/indexAll which keys to strip
  so the index row stays lightweight. Defaults to empty (return everything).
  Example: FileAdapter.data_keys.boids = ['specimens'];
           FileAdapter.data_keys.tanks = ['scene'];
  This is set by the library class or at startup — the adapter itself is agnostic.

USAGE
  import FileAdapter from './class.FileAdapter.js';
  const adapter = new FileAdapter('/absolute/path/to/saves');
  adapter.data_keys.boids = ['specimens'];
  adapter.data_keys.tanks = ['scene'];
  BoidLibrary.default_adapter = adapter;

  // Default path: <project-root>/saves — resolved relative to this file's location.
  const adapter = new FileAdapter();

DO NOT import this in browser-bound code. Dexie / browser workers use DexieAdapter.
</AI> */

import StorageAdapter from './class.StorageAdapter.js';
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// project root / saves default (src/classes → ../../saves)
const _file_dir = path.dirname( fileURLToPath(import.meta.url) );
const DEFAULT_SAVES = path.resolve( _file_dir, '../../saves' );

export default class FileAdapter extends StorageAdapter {

	constructor( saves_path = DEFAULT_SAVES ) {
		super();
		this.saves_path = saves_path;
		// per-collection keys to strip from index reads (keeps index lightweight)
		// e.g. { boids: ['specimens'], tanks: ['scene'] }
		this.data_keys = {};
	}

	// ── Generic CRUD ──────────────────────────────────────────────────────────

	async indexPut( collection, row ) {
		let id = row.id;
		if ( !id ) { id = await this._nextId(collection); }
		const fp = this._filePath(collection, id);
		// merge into existing file so we never clobber data already written
		const existing = await this._readJson(fp) ?? {};
		await this._writeJson( fp, { ...existing, ...row, id } );
		return id;
	}

	async indexGet( collection, id ) {
		const rec = await this._readJson( this._filePath(collection, id) );
		if ( !rec ) { return null; }
		return this._stripDataKeys( collection, rec );
	}

	async indexAll( collection ) {
		const ids = await this._scanIds(collection);
		const result = [];
		for ( const id of ids ) {
			const rec = await this._readJson( this._filePath(collection, id) );
			if ( rec ) { result.push( this._stripDataKeys(collection, rec) ); }
		}
		return result;
	}

	async indexDelete( collection, id ) {
		try { await unlink( this._filePath(collection, id) ); } catch { }
	}

	async dataPut( collection, id, record ) {
		const fp = this._filePath(collection, id);
		const existing = await this._readJson(fp) ?? { id };
		await this._writeJson( fp, { ...existing, ...record } );
	}

	async dataGet( collection, id ) {
		return await this._readJson( this._filePath(collection, id) ) ?? null;
	}

	async dataDelete( collection, id ) {
		// file may already be deleted by indexDelete; safe no-op
		try { await unlink( this._filePath(collection, id) ); } catch { }
	}

	// ── Filesystem helpers ────────────────────────────────────────────────────

	_dir(collection) { return path.join( this.saves_path, collection ); }

	_filePath(collection, id) { return path.join( this._dir(collection), `${id}.json` ); }

	async _ensureDir( dir ) {
		if ( !existsSync(dir) ) {
			await mkdir( dir, { recursive: true } );
		}
	}

	async _readJson( filepath ) {
		try {
			const text = await readFile( filepath, 'utf8' );
			return JSON.parse(text);
		}
		catch { return null; }
	}

	async _writeJson( filepath, data ) {
		await this._ensureDir( path.dirname(filepath) );
		await writeFile( filepath, JSON.stringify(data, null, 2), 'utf8' );
	}

	async _scanIds( collection ) {
		const dir = this._dir(collection);
		await this._ensureDir(dir);
		const entries = await readdir(dir);
		const ids = [];
		for ( const name of entries ) {
			if ( !name.endsWith('.json') ) { continue; }
			const stem = name.slice(0, -5);
			const n = Number(stem);
			if ( Number.isInteger(n) && n > 0 && String(n) === stem ) {
				ids.push(n);
			}
		}
		ids.sort( (a, b) => a - b );
		return ids;
	}

	async _nextId( collection ) {
		const ids = await this._scanIds(collection);
		return ids.length ? ids[ids.length - 1] + 1 : 1;
	}

	// strip heavy data keys for index-only reads
	_stripDataKeys( collection, rec ) {
		const keys = this.data_keys[collection];
		if ( !keys || !keys.length ) { return rec; }
		const out = { ...rec };
		for ( const k of keys ) { delete out[k]; }
		return out;
	}

}
