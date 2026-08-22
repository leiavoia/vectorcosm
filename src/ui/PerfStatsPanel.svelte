<script>

	import { onMount, onDestroy } from 'svelte';
	import { LoadUIState, SaveUIState } from '../util/ui-state.js';
	
	// expect a compound stat tracker as a property of the element
	let {tracker, open=true} = $props();
	// LoadUIState is synchronous, so seed isOpen directly (open is only used as a fallback default, snapshotted once).
	// svelte-ignore state_referenced_locally
	let isOpen = $state(LoadUIState('panel.perf_stats.open', open, value => typeof value == 'boolean' ? value : open));
	
	// pick up stats from the tracker and plug them into a dedicated list of display data
	let stats = $state({});
	
	// this widget needs to be updated manually in order to sync with the frame updates
	function Update(data, layer) {
		stats = tracker.LastOfEachLayer();
	}
	
	// we can hotwire the tracker to tell us when to update data.
	// the main gameloop will be inserting data. we can listen for the insertions here.
	onMount(() => {
		tracker.onInsert = (data, layer) => Update(data, layer);
	})	
	onDestroy(() => {
		tracker.onInsert = null;
	})	

	$effect(() => {
		SaveUIState('panel.perf_stats.open', isOpen);
	});
	 
	function uppercaseFirstLetter ( str ) {
		let words = str.split(/[\s_]/);
		return words.map( w => w.charAt(0).toUpperCase() + w.slice(1) ).join(' ');
	}
	
</script>

<style>
	
</style>

<section>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<header 
		onclick={()=>isOpen=!isOpen}
		onkeydown={(event) => {
			if ( event.key == 'Enter' || event.key == ' ' ) {
				event.preventDefault();
				isOpen = !isOpen;
			}
		}}
		tabindex="0"
	>
		<h3>Performance
			{#if !isOpen && Object.entries(stats).length} 
				<small class="dim"> 
					 | FPS:{stats.fps[1].toFixed()},
					S:{(stats.simtime[1] * 1000).toFixed()},
					D:{(stats.drawtime[1] * 1000).toFixed()}
					
				</small>
			{/if}
		</h3>
	</header>
	{#if isOpen && Object.entries(stats).length}
		<p>
			FPS: <output>{stats.fps[1].toFixed()}</output><br/>
			Delta: <output>{(stats.delta[1] * 1000).toFixed()}</output><br/>
			Draw: <output>{(stats.drawtime[1] * 1000).toFixed()}</output><br/>
			Sim: <output>{(stats.simtime[1] * 1000).toFixed()}</output><br/>
			Wait: <output>{(stats.waittime[1] * 1000).toFixed()}</output><br/>
		</p>
	{/if}
</section>	

