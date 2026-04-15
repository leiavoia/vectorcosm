/* <AI>
db — Dexie (IndexedDB) database definition and migrations.

SCHEMA (current v3)
- `population_index`: ++id, label, star, date — metadata for saved boid populations.
- `population_data`: id — actual specimen JSON arrays (not indexed; loaded on demand).
- `tank_index`: ++id, label, date — metadata for saved tank scenes.
- `tank_data`: id — full scene JSON (not indexed; loaded on demand).

MIGRATION v2 → v3
- Old monolithic `populations` table split into `population_index` + `population_data`.
- Old monolithic `tanks` table split into `tank_index` + `tank_data`.
- Upgrade function iterates old rows and inserts into the new split tables.

EXPORT
- Single named `db` export. Used by BoidLibrary and TankLibrary.
- Never import Dexie directly elsewhere — always use this `db` singleton.
</AI> */

import Dexie from 'dexie';

export const db = new Dexie('vectorcosm');

db.version(2).stores({
	// table		Primary Key		Indexed Properties		Not Indexed
	populations:	'++id, 			species, star, date',	// 
	tanks:			'++id, 			date',					// scene
});

db.version(3).stores({
	// lightweight index tables for UI display
	population_index:	'++id, label, star, date',
	population_data:	'id',
	tank_index:			'++id, label, date',
	tank_data:			'id',
	// old tables removed
	populations:		null,
	tanks:				null,
})
.upgrade(async tx => {
	// migrate old populations → split into index + data
	const oldPops = await tx.table('populations').toArray();
	for ( const row of oldPops ) {
		const indexId = await tx.table('population_index').put({
			label: row.species || 'unknown',
			date: row.date || Date.now(),
			star: row.star || 0,
			count: row.count || 0,
			num_species: 0,
			num_genus: 0,
		});
		await tx.table('population_data').put({
			id: indexId,
			specimens: row.specimens || [],
		});
	}
	// migrate old tanks → split into index + data
	const oldTanks = await tx.table('tanks').toArray();
	for ( const row of oldTanks ) {
		const scene = row.scene || {};
		const indexId = await tx.table('tank_index').put({
			label: row.label || '',
			date: row.date || Date.now(),
			width: scene.tank?.width || 0,
			height: scene.tank?.height || 0,
			num_boids: scene.boids?.length || 0,
			num_plants: scene.plants?.length || 0,
			num_rocks: scene.obstacles?.length || 0,
			num_foods: scene.foods?.length || 0,
			age: scene.sim_settings?.time || 0,
		});
		await tx.table('tank_data').put({
			id: indexId,
			scene: scene,
		});
	}
});

