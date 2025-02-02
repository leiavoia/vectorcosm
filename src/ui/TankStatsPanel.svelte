<script>

	// loaded later
	let stats = $state({
		
	});
	
	export function updateTankStats( data ) {
		for ( let k in data ) {
			stats[k] = data[k];
		}
	}
	
	function uppercaseFirstLetter ( str ) {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
	
	// let { 
	// 	values = [],
	// 	height = '10em',
	// 	width = '1em'
	// } = $props();
</script>

<style>
	
</style>

<section><!--  style="width:20rem;" -->
	<header>
		<h3>Tank Stats</h3>
	</header>
	<p>
		{#if !Object.keys(stats).length}
			<span style="width: 5em; background: #999; display:inline-block; height:0.7em;">&nbsp;</span><br/>
			<span style="width: 7em; background: #999; display:inline-block; height:0.7em;">&nbsp;</span><br/>
			<span style="width: 5em; background: #999; display:inline-block; height:0.7em;">&nbsp;</span><br/>
			<span style="width: 5.5em; background: #999; display:inline-block; height:0.7em;">&nbsp;</span><br/>
			<span style="width: 5em; background: #999; display:inline-block; height:0.7em;">&nbsp;</span><br/>
		{/if}
		
		{#each Object.entries(stats) as [k, v]}
			{uppercaseFirstLetter(k)}: <output>{v}</output><br/>
		{/each}
	</p>
</section>	

<!-- <div class="krell">
	{#each values as v}
		<div style="background-color:#DDD; display:flex; margin-right:2px;"
			style:height
			style:width
		>
			<div style="background-color:#1F60AC; width: 100%; align-self: flex-end;" 
				style:height={`${v*100}%`}
			></div>
		</div>
	{/each}
</div> -->
