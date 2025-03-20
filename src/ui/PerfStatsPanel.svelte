<script>

	import { onMount, onDestroy } from 'svelte';
	
	// expect a compound stat tracker as a property of the element
	let {tracker, open=true} = $props();
	
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
	 
	function uppercaseFirstLetter ( str ) {
		let words = str.split(/[\s_]/);
		return words.map( w => w.charAt(0).toUpperCase() + w.slice(1) ).join(' ');
	}
	
</script>

<style>
	
</style>

<section>
	<header onclick={()=>open=!open}>
		<h3>Performance
			{#if !open && Object.entries(stats).length} 
				<small class="dim"> 
					 | FPS:{stats.fps[1].toFixed()},
					S:{(stats.simtime[1] * 1000).toFixed()},
					D:{(stats.drawtime[1] * 1000).toFixed()}
					
				</small>
			{/if}
		</h3>
	</header>
	{#if open && Object.entries(stats).length}
		<p>
			FPS: <output>{stats.fps[1].toFixed()}</output><br/>
			Delta: <output>{(stats.delta[1] * 1000).toFixed()}</output><br/>
			Draw: <output>{(stats.drawtime[1] * 1000).toFixed()}</output><br/>
			Sim: <output>{(stats.simtime[1] * 1000).toFixed()}</output><br/>
			Wait: <output>{(stats.waittime[1] * 1000).toFixed()}</output><br/>
		</p>
	{/if}
</section>	

