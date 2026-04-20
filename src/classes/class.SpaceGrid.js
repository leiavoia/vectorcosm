/* <AI>
SpaceGrid — uniform spatial hash grid for fast proximity queries.

OVERVIEW
- Divides world space into fixed-size cells. Objects inserted into all cells they overlap.
- `Add(o)` — reads `collision.aabb`, `collision.radius`, or `width/height/length` to find the bounding box.
- `GetObjectsNear(x, y, radius)` — returns all objects from cells overlapping the radius bounding box.
- `GetCellsByBox(x1, y1, x2, y2)` — returns all cells overlapping the box.
- `Remove(o)` — removes object from its center cell only (use when an object is destroyed).
- `Clear()` — resets all cell arrays in place (no re-allocation).

USAGE
- `tank.grid` is the main SpaceGrid, built at Tank construction.
- Sensor sweep code calls `GetObjectsNear()` instead of scanning all tank arrays.
- Must `Clear()` at the start of each frame and re-`Add()` all moving objects.
- `static qid` — incremented per-query; assigned to objects during insertion to deduplicate batch results.
</AI> */


export default class SpaceGrid {
	
	static qid = 0;
	
	constructor( width, height, cellsize = 300 ) {
		this.cellsize = Math.floor(cellsize) // prevents weird float rounding errors;
		this._inv_cellsize = 1 / this.cellsize;
		this.cells_x = Math.ceil( (width+1) / this.cellsize );
		this.cells_y = Math.ceil( (height+1) / this.cellsize );
		this.cells = [];
		for ( let i=0; i < this.cells_x * this.cells_y; i++ ) {
			this.cells.push([]);
		}
	}
	
	Clear() {
		for ( let i=0; i < this.cells.length; i++ ) {
			this.cells[i].length = 0;
		}
	}
	
	Add( o ) {
		// figure out a box
		let x1, y1, x2, y2;
		// dedicated collision geometry data
		if ( 'collision' in o ) {
			if ( 'aabb' in o.collision ) {
				x1 = o.x + o.collision.aabb.x1;
				x2 = o.x + o.collision.aabb.x2;
				y1 = o.y + o.collision.aabb.y1;
				y2 = o.y + o.collision.aabb.y2;
			}
			else if ( 'radius' in o.collision ) {
				x1 = o.x - o.collision.radius;
				x2 = o.x + o.collision.radius;
				y1 = o.y - o.collision.radius;
				y2 = o.y + o.collision.radius;
			}
		}
		// sniff for height/width/length values
		else {
			if ( 'height' in o ) {
				y1 = o.y - o.height*0.5;
				y2 = o.y + o.height*0.5;
			} 
			if ( 'width' in o ) {
				x1 = o.x - o.width*0.5;
				x2 = o.x + o.width*0.5;
			} 
			else if ( 'length' in o ) {
				x1 = o.x - o.length*0.5;
				x2 = o.x + o.length*0.5;
			}
			// look for explicit x1/x2 data
			if ( 'x1' in o ) { x1 = o.x + o.x1; } 
			if ( 'y1' in o ) { y1 = o.y + o.y1; } 
			if ( 'x2' in o ) { x2 = o.x + o.x2; } 
			if ( 'y2' in o ) { y2 = o.y + o.y2; } 
		}
		// now do the actual insertion
		let cells = this.GetCellsByBox( x1, y1, x2, y2 );
		for ( let cell of cells ) { cell.push(o); }
		return cells;
	}
	
	Remove( o ) {
		let cell = this.GetCellFromCoords( o.x, o.y );
		let i = this.cells[cell].indexOf(o);
		if ( i >= 0 ) { this.cells[cell].splice( i, 1 ); }
	}
	
	GetCellFromCoords( x, y ) {
		let cell_x = Math.trunc( x / this.cellsize ).clamp( 0, this.cells_x-1 );
		let cell_y = Math.trunc( y / this.cellsize ).clamp( 0, this.cells_y-1 );
		return cell_x + ( cell_y * this.cells_x );
	}
	
	GetObjectsFromCell( index ) {
		return this.cells[index];
	}
	
	GetObjectsByCoords( x, y ) {
		let cell = this.GetCellFromCoords( x, y );
		return this.cells[cell];
	}
	
	GetObjectsByBox( x1, y1, x2, y2, test_func=null ) {
		SpaceGrid.qid++; // trick to filter unique objects
		const qid = SpaceGrid.qid;
		const cells = this.cells;
		const cells_x = this.cells_x;
		const inv_cs = this._inv_cellsize;
		// inline GetCellFromCoords with clamped trunc — avoids intermediate array allocation
		const max_cx = cells_x - 1;
		const max_cy = this.cells_y - 1;
		let c1x = (x1 * inv_cs) | 0; // fast trunc for positive values
		if ( c1x < 0 ) { c1x = 0; } else if ( c1x > max_cx ) { c1x = max_cx; }
		let c1y = (y1 * inv_cs) | 0;
		if ( c1y < 0 ) { c1y = 0; } else if ( c1y > max_cy ) { c1y = max_cy; }
		let c2x = (x2 * inv_cs) | 0;
		if ( c2x < 0 ) { c2x = 0; } else if ( c2x > max_cx ) { c2x = max_cx; }
		let c2y = (y2 * inv_cs) | 0;
		if ( c2y < 0 ) { c2y = 0; } else if ( c2y > max_cy ) { c2y = max_cy; }
		// iterate cells directly — no GetCellsByBox intermediate array
		const objs = [];
		if ( test_func ) {
			for ( let j = c1y; j <= c2y; j++ ) {
				const row = j * cells_x;
				for ( let i = c1x; i <= c2x; i++ ) {
					const cell = cells[row + i];
					for ( let k = 0, len = cell.length; k < len; k++ ) {
						const o = cell[k];
						if ( o.collision.qid < qid ) {
							o.collision.qid = qid;
							if ( test_func(o) ) { objs.push(o); }
						}
					}
				}
			}
		}
		else {
			for ( let j = c1y; j <= c2y; j++ ) {
				const row = j * cells_x;
				for ( let i = c1x; i <= c2x; i++ ) {
					const cell = cells[row + i];
					for ( let k = 0, len = cell.length; k < len; k++ ) {
						const o = cell[k];
						if ( o.collision.qid < qid ) {
							o.collision.qid = qid;
							objs.push(o);
						}
					}
				}
			}
		}
		return objs;
	}
	
	// retained for external callers — sensors no longer use this
	GetCellsByBox( x1, y1, x2, y2 ) {
		let tl = this.GetCellFromCoords( x1, y1 );
		let br = this.GetCellFromCoords( x2, y2 );
		if ( tl === br ) { return [ this.cells[tl] ]; } // fast exit if only one cell
		let row_start = Math.floor( tl / this.cells_x );
		let row_end = Math.floor( br / this.cells_x );
		let offset_start = tl % this.cells_x;
		let offset_end = br % this.cells_x;
		let objs = [];
		for ( let j=row_start; j <= row_end; j++ ) {
			for ( let i=offset_start; i <= offset_end; i++ ) {
				let index = j * this.cells_x + i;
				if ( index < this.cells.length ) { 
					objs.push( this.cells[index] ); 
				}
			}
		}
		return objs;
	}
}