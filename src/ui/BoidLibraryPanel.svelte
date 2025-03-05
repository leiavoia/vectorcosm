<script>
	import BoidLibrary from '../classes/class.BoidLibrary.js'
	import FileSaver from 'file-saver';
	import PubSub from 'pubsub-js'
	
	let { api } = $props();
	
	const lib = new BoidLibrary();
	let rows = $state([]);
	let order_by = 'date';
	let ascending = false;
	let star = $state(null);
	let num_selected = $state(0);
	let show_file_upload_controls = $state(false);
	let files = $state();
	
	function DeleteSelectedRows( row ) {
		for ( let i=rows.length-1; i >= 0; i-- ) {
			if ( rows[i].selected ) {
				lib.Delete(rows[i].id);
				rows.splice(i,1);
				num_selected--;
			}
		}
	}
	
	function AddSelectedRowsToTank() {
		const ids = rows.filter( _ => _.selected ).map( row => row.id );
		api.SendMessage('addSavedBoidsToTank', {ids});
	}
	
	function ToggleQueryFavorites() {
		if ( star === null ) { star = 1; }
		else if ( star === 1 ) { star = 0; }
		else if ( star === 0 ) { star = null; }
		QueryLibrary( order_by, ascending, star );
	}
	
	function ToggleFavoriteSelectedRows() {
		rows.filter( _ => _.selected ).forEach( row => {
			row.star = !row.star;
			delete(row.selected);
			lib.Update( $state.snapshot(row) );
		});
	}
	
	function MarkRowAsFavorite(row, event) {
		event.stopPropagation();
		row.star = row.star ? 0 : 1;
		delete(row.selected);
		lib.Update($state.snapshot(row));
		return false;
	}
	
	function ToggleRowSelect( row ) {
		row.selected = !row.selected;
		num_selected += row.selected ? 1 : -1;
	}
	
	function DeselectAll() {
		for ( let r of rows ) {
			r.selected = false;
		}
		num_selected = 0;
	}
	
	function SelectAll() {
		for ( let r of rows ) {
			r.selected = true;
		}
		num_selected = rows.length;
	}
	
	function FormatTimestamp(ts) {
		const date = new Date(ts);
		return date.toLocaleString();	
	}
	
	function ExportSelectedRowsToFile() {
		for ( let i=rows.length-1; i >= 0; i-- ) {
			if ( rows[i].selected ) {
				rows[i].selected = false;
				num_selected--;
				let str = JSON.stringify(rows[i]);
				let filename = rows[i].species + '_' +
					+ rows[i].count + '_' +
					+ rows[i].date
					+ '.roe';
				filename = filename.replace(/( |\s)+/ig,'_')	
				let blob = new Blob([str], {type: "text/plain;charset=utf-8"});
				saveAs(blob, filename);
				break;
			}
		}	
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
				// strip out stuff we dont want.
				// TODO: once we get a file format better firmed up, just whitelist fields we allow.
				let obj = JSON.parse(content);
				if ( obj ) {
					if ( obj.id ) { delete(obj.id); }
					if ( obj.selected ) { delete(obj.selected); }
					lib.AddRow( obj );
					// clean up file picker
					files = null;
				}
				show_file_upload_controls = false;
			} )
			.catch( error => console.log(error) )			
		}
	}
	
	function ToggleShowFileUploadControls() {
		show_file_upload_controls = !show_file_upload_controls;
	}
		
	async function QueryLibrary( order_by='date', ascending=false, star=null ) {
		rows.length = 0;
		let results = await lib.Get({ order_by, ascending, star });
		rows.push( ...results );
		num_selected = 0;
	}
	
	QueryLibrary( order_by, ascending, star );
	
	// listen for library additions from other components
	let libraryUpdateSubscription = PubSub.subscribe('boid-library-addition', (msg,data) => {
		QueryLibrary( order_by, ascending, star );
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
</style>

<section>
	<header>
		<h3>Boid Library</h3>
	</header>
	<div class="button_rack">
		<button class={{ghost: !num_selected}} onclick={AddSelectedRowsToTank}>Add To Tank</button>
		<button class={{ghost: !num_selected}} onclick={ToggleFavoriteSelectedRows}>Favorite</button>
		<button class={{ghost: !num_selected}} onclick={DeleteSelectedRows}>Delete</button>
	</div>
	<div class="button_rack" style="margin-top:0;">
		<button class={{ghost: !num_selected}} onclick={DeselectAll}>None</button>
		<button onclick={SelectAll}>All</button>
		<button onclick={ToggleQueryFavorites}>Favorites {star===null ? '' : (star ? '★' : '☆')}</button>
	</div>
	
	<br/>
	
	{#if !rows.length}
		<p style="text-align:center;">
			<b>Library is empty.</b>
			<br/>
			Save specimens by clicking on them and pressing "Save".
		</p>
	{:else}
		<p>
			<b>{rows.length}</b> saved populations
		</p>
	{/if}
	
	<div class="scrollbox">
		{#if rows.length}
			<table>
				<tbody>
					{#each rows as row}
						<tr class={{selected: row.selected}} onclick={()=>ToggleRowSelect(row)} >
							<td style="padding-left: 0;">
								{row.species} ({row.count})
								<br/>
								<small class="dim">{FormatTimestamp(row.date)}</small>
							</td>	
							<td onclick={(event)=>MarkRowAsFavorite(row, event)} style="text-align:right;">{row.star ? '★' : '☆'}</td>	
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<br/>
	
	<div class="button_rack">
		<button class={{ghost: num_selected!==1}} onclick={ExportSelectedRowsToFile}>Export</button>
		<button onclick={ToggleShowFileUploadControls}>Import</button>
	</div>
	{#if show_file_upload_controls}
		<form onsubmit={ImportFile} onchange={ImportFile}>
			<input type="file" bind:files={files} accept=".roe" id="savefileloader" />
		</form>
	{/if}
</section>	
