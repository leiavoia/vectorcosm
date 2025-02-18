<script>

	let {stats} = $props();
	 
	function uppercaseFirstLetter ( str ) {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
	
</script>

<style>
	
</style>

<section>
	<header>
		<h3>Tank</h3>
	</header>
	<p>
		{#each Object.entries(stats) as [k, v]}
			{uppercaseFirstLetter(k)}: <output>{v}</output><br/>
		{/each}
	</p>
</section>	

