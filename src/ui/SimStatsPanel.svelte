<script>

	let {stats} = $props();
		
</script>

<style>
	
</style>

<section>
	<header>
		<h3>Simulation</h3>
	</header>
	<p><output>{stats.name}</output></p>
	
	Time: <output id="sim_time_output">{stats.round_time.toFixed(1)}</output>
	{#if stats.settings.time} / <output>{stats.settings.time}</output>{/if}
	
	{#if stats.settings.time}
		<br/>
		{#if stats.segments > 1}
			<br/>
			Segments: <output id="segments_output">{stats.segments}</output>
		{/if}
		Round: <output id="round_output">{stats.round_num}</output> / <output id="round_output">{stats.settings.rounds||'∞'}</output><br/>
		Best: <output id="best_score_output">{stats.round_best_score.toFixed()}</output> | 
		Avg: <output id="avg_score_output">{stats.round_avg_score.toFixed()}</output>
	{/if}

	{#if stats.settings.time}
		<br/>
		Sim Best: <output id="total_score_output">{stats.best_score.toFixed()}</output> | 
		Best Avg: <output id="best_avg_score_output">{stats.best_avg_score.toFixed()}</output>
	{/if}

	{#if stats.sims_in_queue}
		<br/>
		Next: <output id="total_score_output">{stats.sims_in_queue}</output>
	{/if}
	
	<br/>
	Frame: <output id="framenum_output">{stats.framenum}</output> | 
	FPS: <output id="framenum_output">{stats.fps}</output>
	
</section>	
