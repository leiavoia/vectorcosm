<script>
	import { LoadUIState, SaveUIState } from '../util/ui-state.js';

	let {stats, open=true} = $props();
	open = LoadUIState('panel.tank_stats.open', open, value => typeof value == 'boolean' ? value : open);

	$effect(() => {
		SaveUIState('panel.tank_stats.open', open);
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
		onclick={()=>open=!open}
		onkeydown={(event) => {
			if ( event.key == 'Enter' || event.key == ' ' ) {
				event.preventDefault();
				open = !open;
			}
		}}
		tabindex="0"
	>
		<h3>Tank
			{#if !open} 
				<small class="dim"> | B:{stats.boids}, Sp:{stats.species}, Fd:{stats.foods}</small>
			{/if}
		</h3>
	</header>
	{#if open}
		<p>
			{#each Object.entries(stats) as [k, v]}
				{uppercaseFirstLetter(k)}: <output>{v.toLocaleString()}</output><br/>
			{/each}
		</p>
	{/if}
</section>	

