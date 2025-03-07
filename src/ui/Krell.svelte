<script>
	let { 
		values = [],
		height = '10em',
		width = '1em'
	} = $props();
</script>

<div class="krell">
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
</div>

<style>
	.krell { background-color: #EEE; display:flex; }
</style>