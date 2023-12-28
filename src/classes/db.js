import Dexie from 'dexie';

export const db = new Dexie('vc-populations');
db.version(1).stores({
  populations: '++id, species, star, date', // Primary key and indexed props
});

