
export default class DataGrid {

	constructor( width, height, cellsize = 300 ) {
		this.cellsize = cellsize;
		this.cells_x = Math.ceil( width / cellsize );
		this.cells_y = Math.ceil( height / cellsize );
		this.cells = [];
		for ( let i=0; i < this.cells_x * this.cells_y; i++ ) {
			this.cells.push({});
		}
	}
	
	Clear() {
		this.cells.length = 0;
	}
	
	CellAt( x, y ) {
		let cell_x = Math.trunc( x / this.cellsize ).clamp( 0, this.cells_x-1 );
		let cell_y = Math.trunc( y / this.cellsize ).clamp( 0, this.cells_y-1 );
		const i = cell_x + ( cell_y * this.cells_x );
		return ( typeof this.cells[i] === undefined ) ? null : this.cells[i];
	}
	
}