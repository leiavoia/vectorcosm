/* <AI>
 * Tank environment overlay rendering for Vectorcosm.
 * Extracted from App.svelte (Phase 2 decomposition).
 *
 * Each function creates and returns a new Two.js Group populated
 * with overlay geometry (arrows, heat diamonds, etc.).
 * The caller (App.svelte) is responsible for:
 *   - removing the previous overlay group before calling
 *   - adding the returned group to renderLayers['ui']
 *   - storing the returned group reference for later cleanup
 *
 * Exports: renderTankCurrent, renderTankLightMap, renderTankHeatMap, renderTankMatterMap
 * Called from: App.svelte onGetTankEnvDataResponse
 * </AI> */

// render current/flow vectors as arrows on a grid
export function renderTankCurrent( data, two ) {
	const group = two.makeGroup();
	// grid data
	if ( data.grid?.cells?.length ) {
		const max_line_length = 0.75 * data.grid.cellsize;
		for ( let x=0; x < data.grid.cells_x; x++ ) {
			for ( let y=0; y < data.grid.cells_y; y++ ) {
				const center_x = x * data.grid.cellsize + (data.grid.cellsize * 0.5);
				const center_y = y * data.grid.cellsize + (data.grid.cellsize * 0.5);
				const cell_index = x + ( y * data.grid.cells_x );
				const cell = data.grid.cells[cell_index];

				// center post
				const rect_w = data.grid.cellsize / 15;
				const rect = two.makeRectangle(center_x, center_y, rect_w, rect_w);
				rect.linewidth = 0;
				rect.rotation = Math.PI / 4; // diamonds are kool
				rect.stroke = "transparent";
				rect.fill = 'lime';
				group.add( rect );

				// magnitude line
				const target_x = center_x + -cell.current_x * max_line_length;
				const target_y = center_y + -cell.current_y * max_line_length;
				const line = two.makeLine(center_x, center_y, target_x, target_y);
				line.stroke = "lime";
				line.linewidth = '4';
				line.fill = 'transparent';
				group.add( line );
			}
		}
	}
	// whirls
	if ( data?.whirls?.length ) {
		for ( let w of data.whirls ) {
			const c = two.makeCircle( w.x, w.y, w.locality*1000 );
			c.stroke = "orange";
			c.linewidth = w.strength * 10;
			c.fill = 'transparent';
			group.add( c );
		}
	}
	return group;
}

// render light levels as a diamond grid
export function renderTankLightMap( data, two ) {
	const group = two.makeGroup();
	// grid data
	if ( data.grid?.cells?.length ) {
		for ( let x=0; x < data.grid.cells_x; x++ ) {
			for ( let y=0; y < data.grid.cells_y; y++ ) {
				const center_x = x * data.grid.cellsize + (data.grid.cellsize * 0.5);
				const center_y = y * data.grid.cellsize + (data.grid.cellsize * 0.5);
				const cell_index = x + ( y * data.grid.cells_x );
				const cell = data.grid.cells[cell_index];

				// box
				// const box_w = data.grid.cellsize;
				// const box = two.makeRectangle(center_x, center_y, box_w, box_w);
				// box.stroke = "lime";
				// box.linewidth = '2';
				// box.fill = 'transparent';
				// group.add( box );

				// geometry
				const rect_w = data.grid.cellsize / 4;
				const rect = two.makeRectangle(center_x, center_y, rect_w, rect_w);
				rect.linewidth = 2;
				rect.rotation = Math.PI / 4; // diamonds are kool
				rect.stroke = "#888";
				rect.fill = `hsl(0, 0%, ${cell.light*100}%)`;
				group.add( rect );
			}
		}
	}
	return group;
}

// render heat levels as a color-gradient diamond grid (blue → white → red)
export function renderTankHeatMap( data, two ) {
	const group = two.makeGroup();
	// grid data
	if ( data.grid?.cells?.length ) {
		for ( let x=0; x < data.grid.cells_x; x++ ) {
			for ( let y=0; y < data.grid.cells_y; y++ ) {
				const center_x = x * data.grid.cellsize + (data.grid.cellsize * 0.5);
				const center_y = y * data.grid.cellsize + (data.grid.cellsize * 0.5);
				const cell_index = x + ( y * data.grid.cells_x );
				const cell = data.grid.cells[cell_index];

				// heat (stroke) -> gradient: blue (0.0) -> white (0.5) -> red (1.0)
				let hue, sat;
				if (cell.heat <= 0.5) {
					const t = cell.heat / 0.5; // 0..1 from blue -> white
					hue = 240; // keep blue hue
					sat = (1 - t) * 100; // 100% -> 0%
				}
				else {
					const t = (cell.heat - 0.5) / 0.5; // 0..1 from white -> red
					hue = 0; // red hue
					sat = t * 100; // 0% -> 100%
				}
				const heat_color = `hsl(${Math.round(hue)}, ${Math.round(sat)}%, 60%)`;

				// geometry
				const rect_w = data.grid.cellsize / 4;
				const rect = two.makeRectangle(center_x, center_y, rect_w, rect_w);
				rect.linewidth = 0;
				rect.rotation = Math.PI / 4; // diamonds are kool
				rect.stroke = "transparent";
				rect.fill = heat_color;
				group.add( rect );
			}
		}
	}
	return group;
}

// render matter density as a logarithmically-scaled diamond grid with text values
export function renderTankMatterMap( data, two ) {
	const group = two.makeGroup();
	// grid data
	if ( data.grid?.cells?.length ) {
		// use logarithmic scaling - matter has no limit
		const maxlog = 12;
		const maxval = Math.exp(maxlog);
		const logshift = 5; // the extreme low end is a bit boring
		for ( let x=0; x < data.grid.cells_x; x++ ) {
			for ( let y=0; y < data.grid.cells_y; y++ ) {
				const center_x = x * data.grid.cellsize + (data.grid.cellsize * 0.5);
				const center_y = y * data.grid.cellsize + (data.grid.cellsize * 0.5);
				const cell_index = x + ( y * data.grid.cells_x );
				const cell = data.grid.cells[cell_index];

				const logval = Math.log( Math.min(cell.matter, maxval) );
				const ratio = Math.max( 0, logval - logshift ) / ( maxlog - logshift );
				const color = `hsl(300, 50%, ${ratio*80}%)`;

				// geometry
				const rect_w = data.grid.cellsize / 4;
				const rect = two.makeRectangle(center_x, center_y, rect_w, rect_w);
				rect.linewidth = 2;
				rect.rotation = Math.PI / 4; // diamonds are kool
				rect.stroke = "#AAA";
				rect.fill = color;
				group.add( rect );

				const txt = two.makeText( cell.matter.toFixed(), center_x, center_y );
				txt.linewidth = 0;
				txt.stroke = "transparent";
				txt.fill = '#FFF';
				txt.size = 24;
				group.add( txt );
			}
		}
	}
	return group;
}
