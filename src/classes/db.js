import Dexie from 'dexie';

export const db = new Dexie('vectorcosm');

db.version(2).stores({
	// table		Primary Key		Indexed Properties		Not Indexed
	populations:	'++id, 			species, star, date',	// 
	tanks:			'++id, 			date',					// scene
});

