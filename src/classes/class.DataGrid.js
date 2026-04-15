/* <AI>
DataGrid — cell-based environmental data grid for the tank world.

OVERVIEW
- Fixed-size cells (default 300px). Each cell: `{ current_x, current_y, light, heat, matter }`.
- `CellAt(x, y)` — get cell by world coordinates (clamped to grid bounds).
- `CellFromXY(cx, cy)` — get cell by grid-array indices.
- `CellIndexAt / CellIndexFromXY` — return the flat array index instead of the cell object.
- `InterpolatedGridValue(x, y, attr)` — inverse-distance weighted value from the 3×3 neighborhood.
  Use this for smooth sensor readings; avoids discontinuities at cell edges.

ENVIRONMENT CHANNELS
- `current_x / current_y` — fluid flow vector; applied to boid physics each frame.
- `light` (0..1) — drives plant photosynthesis rate.
- `heat` (0..1) — affects plant/boid metabolism.
- `matter` — organic matter available for plant growth; depleted by `RequestResources()`.

USAGE
- `tank.datagrid` is the single instance per session.
- Sensors of type 'current' and 'datagrid' query this directly.
- Tank.Update() propagates/diffuses currents, light, and matter each frame.
</AI> */


export default class DataGrid {

	constructor( width, height, cellsize = 300 ) {
		this.cellsize = Math.floor(cellsize); // prevents weird float rounding errors
		this.cells_x = Math.ceil( width / this.cellsize );
		this.cells_y = Math.ceil( height / this.cellsize );
		this.cells = [];
		for ( let i=0; i < this.cells_x * this.cells_y; i++ ) {
			this.cells.push({
				current_x: 0,
				current_y: 0,
				light: 0.5,
				heat: 0.5,
				matter: 0
			});
		}
	}
	
	Clear() {
		this.cells.length = 0;
	}
	
	// get cell from world coords
	CellAt( x, y ) {
		let cell_x = Math.trunc( x / this.cellsize ).clamp( 0, this.cells_x-1 );
		let cell_y = Math.trunc( y / this.cellsize ).clamp( 0, this.cells_y-1 );
		const i = cell_x + ( cell_y * this.cells_x );
		return ( typeof this.cells[i] === undefined ) ? null : this.cells[i];
	}
	
	// get cell from world coords
	CellIndexAt( x, y ) {
		let cell_x = Math.trunc( x / this.cellsize ).clamp( 0, this.cells_x-1 );
		let cell_y = Math.trunc( y / this.cellsize ).clamp( 0, this.cells_y-1 );
		const i = cell_x + ( cell_y * this.cells_x );
		return ( typeof this.cells[i] === undefined ) ? null : i;
	}
	
	// get cell from array coords
	CellFromXY( x, y ) {
		x = x.clamp( 0, this.cells_x-1 );
		y = y.clamp( 0, this.cells_y-1 );
		const i = x + ( y * this.cells_x );
		return ( typeof this.cells[i] === undefined ) ? null : this.cells[i];
	}
	
	// get cell from array coords
	CellIndexFromXY( x, y ) {
		x = x.clamp( 0, this.cells_x-1 );
		y = y.clamp( 0, this.cells_y-1 );
		const i = x + ( y * this.cells_x );
		return ( typeof this.cells[i] === undefined ) ? null : i;
	}

	InterpolatedGridValue( x, y, attribute ) {
		const grid = globalThis.vc.tank.datagrid;

		// Get cell indices
		const cellsize = grid.cellsize;
		const cell_x = Math.trunc(x / cellsize);
		const cell_y = Math.trunc(y / cellsize);

		// Gather neighboring cells (3x3 grid)
		let values = [];
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const nx = cell_x + dx;
				const ny = cell_y + dy;
				// Clamp to grid bounds
				if (nx < 0 || nx >= grid.cells_x || ny < 0 || ny >= grid.cells_y) continue;
				const cell = grid.CellFromXY(nx, ny);
				if (!cell) continue;
				// Center of neighbor cell
				const cx = (nx + 0.5) * cellsize;
				const cy = (ny + 0.5) * cellsize;
				// Distance from sensor to cell center
				const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) || 0.0001;
				values.push({ value: cell[attribute], dist });
			}
		}

		// IDW interpolation
		const power = 2;
		let numerator = 0;
		let denominator = 0;
		for (const v of values) {
			const weight = 1 / Math.pow(v.dist, power);
			numerator += v.value * weight;
			denominator += weight;
		}
		return denominator ? numerator / denominator : 0.5;
	}		
	
}