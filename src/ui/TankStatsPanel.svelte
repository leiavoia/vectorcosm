<script>

	let {stats} = $props();
	 
	function uppercaseFirstLetter ( str ) {
		let words = str.split(/[\s_]/);
		return words.map( w => w.charAt(0).toUpperCase() + w.slice(1) ).join(' ');
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
			{uppercaseFirstLetter(k)}: <output>{v.toLocaleString()}</output><br/>
		{/each}
	</p>
</section>	

