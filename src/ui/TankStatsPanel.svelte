<script>

	let {stats, open=true} = $props();
	 
	function uppercaseFirstLetter ( str ) {
		let words = str.split(/[\s_]/);
		return words.map( w => w.charAt(0).toUpperCase() + w.slice(1) ).join(' ');
	}
	
	// let open = $state(true);
	
</script>

<style>
	
</style>

<section>
	<header onclick={()=>open=!open}>
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

