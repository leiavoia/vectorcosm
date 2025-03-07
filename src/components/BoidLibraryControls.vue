<script setup>
	// import * as utils from '../util/utils.js'
	import BoidLibrary from '../classes/class.BoidLibrary.js'
	import {Boid} from '../classes/class.Boids.js'
	import FileSaver from 'file-saver';
	import PubSub from 'pubsub-js'
	import { ref, reactive, toRaw, markRaw, shallowRef, nextTick, triggerRef, onMounted, watch } from 'vue'
	
	const lib = new BoidLibrary();
	let rows = reactive([]);
				
	let order_by = 'date';
	let ascending = false;
	let star = null;
	let num_selected = 0;
	let show_file_upload_controls = ref(false);
			
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
		rows.filter( _ => _.selected ).forEach( row => {
			for ( let json of row.specimens ) {
				let b = new Boid( 0, 0, globalThis.vc.tank, JSON.parse(json) );
				b.angle = Math.random() * Math.PI * 2;	
				b.x = globalThis.vc.tank.width*Math.random(), 
				b.y = globalThis.vc.tank.height*Math.random();	
				b.ScaleBoidByMass();
				globalThis.vc.tank.boids.push(b);							
			}
		});
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
			let obj = toRaw(row);
			delete(obj.selected);
			lib.Update(obj);
		});
	}
	
	function MarkRowAsFavorite(row) {
		row.star = row.star ? 0 : 1;
		let obj = toRaw(row);
		delete(obj.selected);
		lib.Update(obj);
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
	
	function ImportFile() {
		let input = document.getElementById('savefileloader');
		if ( input && 'files' in input && input.files.length > 0 ) {
			readFileContent(input.files[0])
			.then( content => {
				// strip out stuff we dont want.
				// TODO: once we get a file format better firmed up, just whitelist fields we allow.
				let obj = JSON.parse(content);
				if ( obj ) {
					if ( obj.id ) { delete(obj.id); }
					if ( obj.selected ) { delete(obj.selected); }
					lib.AddRow( obj );
					// clean up file picker
					document.getElementById('savefileloader').value = null;
				}
				ToggleShowFileUploadControls();
			} )
			.catch(error => console.log(error))
		}
	}
	
	function ToggleShowFileUploadControls() {
		show_file_upload_controls.value = !show_file_upload_controls.value;
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

<template>
	<div>
		<h2>Boid Library</h2>
		
		<button @click="$emit('close')" style="width:100%;">Close</button>
		<br/>
		<br/>
		
		<div class="button_rack">
			<button :class="{ghost: !num_selected}" @click="AddSelectedRowsToTank()">Add To Tank</button>
			<button :class="{ghost: !num_selected}" @click="ToggleFavoriteSelectedRows()">Favorite</button>
			<button :class="{ghost: !num_selected}" @click="DeleteSelectedRows()">Delete</button>
		</div>
		<div class="button_rack">
			<button :class="{ghost: !num_selected}" @click="DeselectAll()">None</button>
			<button @click="SelectAll()">All</button>
			<button @click="ToggleQueryFavorites()">Favorites {{star===null ? '' : (star ? '★' : '☆')}}</button>
		</div>
		
		<br/>
		
		<p v-show="!rows.length" style="text-align:center;">
			<b>Library is empty.</b>
			<br/>
			Save specimens by clicking on them and pressing "Save".
		</p>
		
		<p v-if="rows.length">
			<b>{{rows.length}}</b> saved populations
		</p>
		
		<div class="scrollbox">
			<table v-show="rows.length">
				<tr>
					<th></th>
					<th>Species</th>
					<th>Count</th>
					<th>Date</th>
				</tr>
				<tr v-for="row of rows" 
					:class="{ selected: row.selected }"
					@click="ToggleRowSelect(row)"
					>
					<td @click.prevent.stop="MarkRowAsFavorite(row)">{{row.star ? '★' : '☆'}}</td>	
					<td>{{row.species}}</td>	
					<td>{{row.count}}</td>	
					<td>{{FormatTimestamp(row.date)}}</td>	
				</tr>
			</table>
		</div>

		<br/>
		
		<div class="button_rack">
			<button :class="{ghost: num_selected!==1}" @click="ExportSelectedRowsToFile()">Export</button>
			<button @click="ToggleShowFileUploadControls()">Import</button>
		</div>
		<form @submit.prevent.stop="ImportFile()" @change.prevent.stop="ImportFile()" v-show="show_file_upload_controls">
			<input type="file" accept=".roe" id="savefileloader" />
		</form>
		
		<br/>
	</div>
	  
			  
</template>

<style>
	BUTTON.on {
		background-color: #80D4FF;
	}
	.button_rack {
		display:flex; 
		align-items:stretch;
	}
	.button_rack BUTTON {
		flex: 1 1 auto;
	}
	TR.selected {
		background-color: #26A;
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