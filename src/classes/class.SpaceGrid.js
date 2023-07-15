
export default class SpaceGrid {

	constructor( width, height, cellsize = 300 ) {
		this.cellsize = cellsize;
		this.cells_x = Math.ceil( (width+1) / cellsize );
		this.cells_y = Math.ceil( (height+1) / cellsize );
		this.cells = [];
		for ( let i=0; i < this.cells_x * this.cells_y; i++ ) {
			this.cells.push([]);
		}
	}
	
	Clear() {
		this.cells.forEach( a => a.length = 0 );
	}
	
	Add( o ) {
		let cell = this.GetCellFromCoords( o.x, o.y );
		this.cells[cell].push(o);
		return cell;
	}
	
	Remove( o ) {
		let cell = this.GetCellFromCoords( o.x, o.y );
		let i = this.cells[cell].indexOf(o);
		if ( i >= 0 ) { this.cells[cell].splice( i, 1 ); }
	}
	
	GetCellFromCoords( x, y ) {
		let cell_x = Math.trunc( x / this.cellsize ).clamp( 0, this.cells_x );
		let cell_y = Math.trunc( y / this.cellsize ).clamp( 0, this.cells_y );
		return cell_x + ( cell_y * this.cells_x );
	}
	
	GetObjectsFromCell( index ) {
		return this.cells[index];
	}
	
	GetObjectsByCoords( x, y ) {
		let cell = this.GetCellFromCoords( x, y );
		return this.cells[cell];
	}
	
	GetObjectsByBox( x1, y1, x2, y2 ) {
		let tl = this.GetCellFromCoords( x1, y1 );
		let br = this.GetCellFromCoords( x2, y2 );
		let row_start = Math.floor( tl / this.cells_x );
		let row_end = Math.floor( br / this.cells_x );
		let offset_start = tl % this.cells_x;
		let offset_end = br % this.cells_x;
		let objs = [];
		for ( let j=row_start; j <= row_end; j++ ) {
			for ( let i=offset_start; i <= offset_end; i++ ) {
				objs.push( ... this.cells[ j * this.cells_x + i ]  ); 
			}
		}
		return objs;
	}
}