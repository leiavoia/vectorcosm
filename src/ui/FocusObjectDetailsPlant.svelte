<script>
	/* <AI>
	FocusObjectDetailsPlant — minimal proof-of-concept focus panel for plants.
	Consumes the `DescribePlant()` payload from the worker's pick_object command (type:'plant').
	No records/chart yet (plants have no per-instance CompoundStatTracker like boids do) and no
	action buttons yet (save/smite are boid-library-specific). Expand tabs/traits/actions here
	following the pattern in FocusObjectDetailsBoid.svelte as the plant sim stabilizes.
	</AI> */
	import { fade } from 'svelte/transition';

	let { plant = null } = $props();
</script>

<style>
	SECTION {
		font-size: 90%;
		height: fit-content;
		min-width: 22em;
	}
	P { margin-bottom:0; }
	output { line-height: var(--pico-line-height); }

	.meter {
		display: inline-block;
		overflow:hidden;
		border:#3DAEE9 solid 1px;
		border-radius:0.25em;
		margin-right:1.8%;
		width:31%;
		height:1.5em;
		position:relative;
	}
	.meter:last-child { margin-right:0; }
	.meter OUTPUT {
		position:absolute;
		top:0;
		left:0;
		right:0;
		bottom:0;
		text-align:center;
		line-height:1.25em;
		color: #FFF;
	}
</style>

{#if plant !== null}

<section in:fade={{duration:200}}>
	<header>
		<!-- you might also like:  🌱  ✿  -->
		<h3 style="text-align:center;">🌿 PLANT #{plant.oid}</h3>
	</header>

	<p style="text-align:center;">
		<!-- GEN: <output>{plant.generation}</output>&nbsp;&nbsp; -->
		MASS: <output>{plant.mass.toFixed(0)}</output>&nbsp;&nbsp;
		AGE: <output>{plant.age.toFixed(0)}</output>&nbsp;&nbsp;
		RADIUS: <output>{plant.r.toFixed(0)}</output>
	</p>

	<div style="width:100%; margin-top:0.5em;">
		<div class="meter">
			{const lifecycle = (1-((plant.life_credits / plant.traits.life_credits)||0))*100}
			<output>Life</output>
			<div style="background-color:#1F60AC; height:100%; width:{lifecycle}%"></div>
		</div>
		<div class="meter">
			<output>Health</output>
			<div style="background-color:#1F60AC; height:100%; width:{((plant.health)||0)*100}%"></div>
		</div>
		<div class="meter">
			{const fruit_pct = (plant.metrics.fruit_threshold > 0 ? Math.min(1,(plant.fruit_credits / plant.metrics.fruit_threshold)||0) : 0)*100}
			<output>Fruit</output>
			<div style="background-color:#1F60AC; height:100%; width:{fruit_pct}%"></div>
		</div>
	</div>

	<div style="width:100%; margin-top:0.5em;">
		<div class="meter">
			<output>Core</output>
			<div style="background-color:#7A5230; height:100%; width:{((plant.core / (plant.mass||1))||0)*100}%"></div>
		</div>
		<div class="meter">
			<output>Foliage</output>
			<div style="background-color:#3A8A3A; height:100%; width:{((plant.foliage / (plant.mass||1))||0)*100}%"></div>
		</div>
		<div class="meter">
			<output>Reserve</output>
			<div style="background-color:#B08A2A; height:100%; width:{(Math.min(1, plant.reserve / (plant.core||1)))*100}%"></div>
		</div>
	</div>

	<details open>
		<summary><h4 style="display:inline;">Vitals</h4></summary>
		<div>
			<p>Mass: <output>{plant.mass.toFixed(1)}</output></p>
			<p>Core: <output>{plant.core.toFixed(1)}</output></p>
			<p>Foliage: <output>{plant.foliage.toFixed(1)}</output></p>
			<p>Reserve: <output>{plant.reserve.toFixed(1)}</output></p>
			<p>Fruit Credits: <output>{plant.fruit_credits.toFixed(1)}</output></p>
			<p>Density: <output>{plant.density.toFixed(2)}</output></p>
			<p>Radius: <output>{plant.r.toFixed(0)}</output></p><!-- WARNING: non standard - may break -->
		</div>
	</details>

	<details>
		<summary><h4 style="display:inline;">Traits</h4></summary>
		<div>
			<p>Food Complexity <output>{plant.traits.food_complexity}</output></p>
			<p>Fruit <output>{plant.traits.fruit_num}</output> x <output>{plant.traits.fruit_size}</output></p>
			<p>Risk Tolerance <output>{(plant.traits.risk_tolerance||0).toFixed(2)}</output></p>
			<p>
				Light: 
				<output>{(plant.traits.light_tolr||0).toFixed(2)}</output> @
				<output>{(plant.traits.light_pref||0).toFixed(2)}</output>
				<i> - 
					{plant.traits.light_pref > 0.67 ? 'Bright' : ( plant.traits.light_pref < 0.33 ? 'Shade' : 'Neutral' )}
					{plant.traits.light_tolr > 0.67 ? 'Generalist' : ( plant.traits.light_tolr < 0.33 ? 'Specialist' : 'Average' )}
				</i>
			</p>
			<p>
				Heat:
				<output>{(plant.traits.heat_tolr||0).toFixed(2)}</output> @
				<output>{(plant.traits.heat_pref||0).toFixed(2)}</output>
				<i> - 
					{plant.traits.heat_pref > 0.67 ? 'Hot' : ( plant.traits.heat_pref < 0.33 ? 'Cold' : 'Neutral' )}
					{plant.traits.heat_tolr > 0.67 ? 'Generalist' : ( plant.traits.heat_tolr < 0.33 ? 'Specialist' : 'Average' )}
				</i>
			</p>
		</div>
	</details>

	<details>
		<summary><h4 style="display:inline;">Metrics</h4></summary>
		<div>
			{#each Object.keys(plant.metrics) as key}
				<p>{key}: <output>{plant.metrics[key].toFixed(2)}</output></p>
			{/each}
		</div>
	</details>

</section>

{/if}
