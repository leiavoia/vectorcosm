
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
	
	// get cell from array coords
	CellFromXY( x, y ) {
		x = x.clamp( 0, this.cells_x-1 );
		y = y.clamp( 0, this.cells_y-1 );
		const i = x + ( y * this.cells_x );
		return ( typeof this.cells[i] === undefined ) ? null : this.cells[i];
	}
	
}