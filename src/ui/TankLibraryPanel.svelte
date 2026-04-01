<script>
	import TankLibrary from '../classes/class.TankLibrary.js'
	import FileSaver from 'file-saver';
	import PubSub from 'pubsub-js'
	
	let { api, camera, open=true } = $props();

	const lib = new TankLibrary();
	let rows = $state([]);
	let order_by = 'date';
	let ascending = false;
	let show_file_upload_controls = $state(false);
	let files = $state();
	let selected_row = $state(null);
	
	function LoadTank() {
		if ( !selected_row ) { return; }
		camera.dramatic_entrance = -1; // evaluates to "true" but resets to false on next action
		api.SendMessage('loadTank', { id: selected_row.id } );
	}
	
	function SaveTank() {
		// save over or have existing id?
		let id = selected_row ? selected_row.id : null;
		api.SendMessage('saveTank', {id});
	}
	
	function DeleteSelectedRow() {
		if ( !selected_row ) { return; }
		lib.Delete(selected_row.id);
		let i = rows.indexOf(selected_row);
		if ( 1 >= 0 ) { rows.splice(i,1); }
		selected_row = null;
	}
	
	function ToggleRowSelect( row ) {
		if ( selected_row == row ) { selected_row = null; }
		else { selected_row = row; }
	}
	
	function FormatTimestamp(ts) {
		const date = new Date(ts);
		return date.toLocaleString();	
	}
	
	function ExportSelectedRowToFile() {
		if ( !selected_row ) { return; }
		let str = JSON.stringify(selected_row);
		let filename = 'vectorcosm_' + selected_row.id + '_' + selected_row.label + '.tank';
		filename = filename.replace(/( |\s)+/ig,'_')	
		let blob = new Blob([str], {type: "text/plain;charset=utf-8"});
		saveAs(blob, filename);
	}
	
	function readFileContent(file) {
		const reader = new FileReader()
		return new Promise((resolve, reject) => {
			reader.onload = event => resolve(event.target.result)
			reader.onerror = error => reject(error)
			reader.readAsText(file)
		})
	}
	
	function ImportFile(event) {
		event.stopPropagation();
		event.preventDefault();
		for ( const file of files ) {
			readFileContent(file)
			.then( content => {
				let obj = JSON.parse(content);
				if ( obj ) {
					// strip out stuff we dont want.
					// TODO: once we get a file format better firmed up, just whitelist fields we allow.
					// don't let IDs in from the outside
					if ( obj.id ) { delete(obj.id); }
					lib.AddRow( obj ); // this will send pubsub signal `tank-library-addition`
					// clean up file picker
					files = null;
				}
				show_file_upload_controls = false;
				// pubsub handles library redraw
			} )
			.catch( error => console.error(error) )			
		}
	}
	
	function ToggleShowFileUploadControls() {
		show_file_upload_controls = !show_file_upload_controls;
	}
		
	async function QueryLibrary( order_by='date', ascending=false ) {
		rows.length = 0;
		let results = await lib.Get({ order_by, ascending });
		rows.push( ...results );
	}
	
	QueryLibrary( order_by, ascending );
	
	// listen for library additions from other components
	let libraryUpdateSubscription = PubSub.subscribe('tank-library-addition', (msg,data) => {
		QueryLibrary( order_by, ascending );
	});
	
</script>

<style>
	.button_rack {
		display:flex; 
		align-items:stretch;
		margin-bottom: 0.25rem;
		column-gap: 0.25rem;
	}
	.button_rack BUTTON {
		flex: 1 1 auto;
	}
	TD { background:none; }
	TR.selected TD {
		background-color: var(--pico-secondary-background);
	}
	TR {
		cursor: pointer;
	}
	B { font-weight:bold; }
	.ghost {
		pointer-events:none;
		opacity: 0.35;
	}
	.scrollbox {
		max-height: 20em;
		overflow-y: scroll;
	}
	.tank_id {
		color: var(--pico-primary-background);
	}
	TD:last-child { border-bottom: none; }
</style>

<section>
	<header onclick={()=>open=!open}>
		<h3>Tank Library
			<small class="dim"> | {rows.length}</small>
		</h3>
	</header>
	{#if open}
		<div class="button_rack">
			<button onclick={SaveTank}>Save</button>
			<button class={{ghost: !selected_row}} onclick={LoadTank}>Load</button>
			<button onclick={ToggleShowFileUploadControls}>Import</button>
			<button class={{ghost: !selected_row}} onclick={ExportSelectedRowToFile}>Export</button>
			<button class={{ghost: !selected_row}} onclick={DeleteSelectedRow}>Delete</button>
		</div>
		{#if show_file_upload_controls}
			<form onsubmit={ImportFile} onchange={ImportFile}>
				<input type="file" bind:files={files} accept=".tank" id="savefileloader" />
			</form>
		{/if}
		
		{#if !rows.length}
			<p style="text-align:center;">
				<b>No saved tanks.</b>
			</p>
		{/if}
		
		<div class="scrollbox">
			{#if rows.length}
				<table>
					<tbody>
						{#each rows as row}
							<tr class={{selected: row==selected_row}} onclick={()=>ToggleRowSelect(row)} >
								<td style="padding-left: 0;">
									<b class="tank_id">#{row.id}</b> {row.label || row.date}
									<br/>
									<small class="dim">{FormatTimestamp(row.date)}</small>
								</td>	
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

	{/if}
</section>	
