<script>
	import { blur, fade } from 'svelte/transition';
	import { getContext } from 'svelte';

	let api = getContext('api');
	
	let boid = $state(null);
	
	export function updateStats(data) {
		boid = data;
	}

	function SaveBoid() {
		api.SendMessage('exportBoids', { db:true, ids: [boid.oid] });
	}
	
	function SaveSpecies() {
		api.SendMessage('exportBoids', { db:true, species: [boid.species] });
	}
	
	function SaveTankPopulation() {
		api.SendMessage('exportBoids', { db:true });
	}
	
	function SmiteBoid() {
		api.SendMessage('smite', { ids: [boid.oid] });
	}
	
</script>

<style>
	SECTION {
		font-size: 90%;
		height: fit-content;
		min-width: 22em;
	}
	P { margin-bottom:0; }
	output { line-height: var(--pico-line-height); }
	.brain SPAN {
		display:inline-block;
		height:1.5rem;
		width: 1.5rem;
		border: 1px outset #AAA;
		margin: 0;
		padding: 0.1rem 0.25rem;
		background-color: #000;
		font-family: monospace;
		text-align:center;
		font-weight:bold;
		margin-right: 2px;
		margin-bottom: 2px;
	}
	.brain SPAN.hidden {
		border-radius:50%;	
	}
	.brain SPAN.input {
		border-top-right-radius:50%;	
		border-bottom-right-radius:50%;	
	}
	.brain.micro SPAN {
		font-size: 70%;
		color: transparent;
	}

	.hidecursor {
		cursor: none;
	}
	
	.sensor_block {  }
	.sensor_block.compact { width: 50%; display:inline-block; line-height:1.1em;}
	.sensor_block.compact PROGRESS { width: 4rem; margin-bottom: calc(var(--pico-spacing) * .10); margin-left: 0.25rem; line-height:1.1em;  }
	.sensor_block.compact SPAN {
		display:inline-block; 
		overflow-x:hidden;
		overflow-y:visible;
		line-height:1.1em; 
		width:5.5rem;
		text-align:right;
		}
		
	.good { background-color: #171 !important; } 
	.verygood { font-weight:bold; background-color: #3A3 !important; }
	.bad { background-color: #611 !important; }
	.verybad { font-weight:bold; background-color: #911 !important; }
	
	#nutrition_table TD {
		text-align:center;
		vertical-align:middle;
		padding:0;
		background-color: transparent;
		border:none;
	}
	
	details[open] summary .krell { visibility:hidden; }
	details summary h4 { margin-top: 0.01em; }
	details:not([open]) summary h4 { margin-bottom:0.01em; margin-top: 0.01em; }
	.krell { max-width: 12rem;}
	
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
	summary {
		list-style: none; 
		margin:0;
	}
	summary:after { display:none; }
	summary > div.krell {
		 width:auto; 
		 text-align:right; 
		 display:flex; 
		 float:right; 
		 margin-top:0.5em;
	}
	.krell .box {
		background-color:#0004; 
		display:flex; 
		margin-right:2px; 
		width:10px; 
		height:1.25em;
	}
	.box > div {
		/* min-height:1px; */ /* enable this if you want some visual indicator that it exists */
		width: 100%; 
		align-self: flex-end;
	}
	details > *:last-child { padding-bottom: 0.2em; }	
</style>

{#if boid !== null}

<section in:fade={{duration:200}} out:fade={{duration:350}}>
	<header>
		<h3 style="text-align:center;">{boid.species.toUpperCase()}</h3>
	</header>

	<p style="text-align:center;">
		GEN: <output>{boid.generation}</output>&nbsp;&nbsp;
		SIZE: <output>{boid.length.toFixed(0)}</output>x<output>{boid.width.toFixed(0)}</output>&nbsp;&nbsp;
		DIET: <output>
			{#if (boid.traits.food_mask||0) & 1}▲{/if}
			{#if (boid.traits.food_mask||0) & 2}■{/if}
			{#if (boid.traits.food_mask||0) & 4}⬟{/if}
			{#if (boid.traits.food_mask||0) & 8}⬢{/if}
			{#if (boid.traits.food_mask||0) & 16}⯃{/if}
			{#if (boid.traits.food_mask||0) & 32}●{/if}
			🡒
			{#if boid.traits.poop_complexity==1}▲{/if}
			{#if boid.traits.poop_complexity==2}■{/if}
			{#if boid.traits.poop_complexity==3}⬟{/if}
			{#if boid.traits.poop_complexity==4}⬢{/if}
			{#if boid.traits.poop_complexity==5}⯃{/if}
			{#if boid.traits.poop_complexity==6}●{/if}
		</output>
	</p>

	<details>
		<summary>	
			<div style="width:100%; margin-top:0.5em;">
				<div class="meter" >
					<output>
						Age
					</output>
					<div style="background-color:#1F60AC; height: 100%; width:{((boid.age / boid.lifespan)||0)*100}%"></div>
				</div>
				<div class="meter" >
					<output>
						Scale
					</output>
					<div style="background-color:#1F60AC; height: 100%; width:{(boid.scale||0)*100}%"></div>
				</div>
				<div class="meter" >
					<output>
						Energy
					</output>
					<div style="background-color:#1F60AC; height: 100%; width:{((boid.metab.energy / boid.metab.max_energy)||0)*100}%"></div>
				</div>
			</div>
			<div style="width:100%; margin-top:0.5em;">
				<div class="meter" >
					<output>
						Bite
					</output>
					<div style="background-color:#1F60AC; height: 100%; width:{((boid.metab.bite_time / boid.traits.bite_speed)||0)*100}%"></div>
				</div>
				<div class="meter" >
					<output>
						Stomach
					</output>
					<div style="background-color:#1F60AC; height: 100%; width:{((boid.metab.stomach_total / boid.metab.stomach_size)||0)*100}%"></div>
				</div>
				<div class="meter" >
					<output>
						Bowel
					</output>
					<div style="background-color:#1F60AC; height: 100%; width:{((boid.metab.bowel_total / boid.metab.bowel_size)||0)*100}%"></div>
				</div>
			</div>
		</summary>
		<div>
			<h4>Vitals</h4>

			Age <output>{boid.age.toFixed(0)} / {boid.lifespan.toFixed(0)}</output>
			<progress value={boid.age / boid.lifespan}></progress> 
			
			Energy <output>{(boid.metab.energy||0).toFixed(0)} / {(boid.metab.max_energy||0).toFixed(0)}</output>
			<progress value={(boid.metab.energy / boid.metab.max_energy )||0}></progress> 
			
			Stomach
				<output>{(boid.metab.stomach_total||0).toFixed()}</output> / 
				<output>{(boid.metab.stomach_size||0).toFixed()}</output>
			<progress value={((boid.metab.stomach_total / boid.metab.stomach_size)||0)}></progress>
				
			Bowel
				<output>{(boid.metab.bowel_total||0).toFixed()}</output> / 
				<output>{(boid.metab.bowel_size||0).toFixed()}</output>
			<progress value={((boid.metab.bowel_total / boid.metab.bowel_size)||0)}></progress>
			
			Bite <output>{(boid.metab.bite_size||0).toFixed(1)}</output>
				@ <output>{(boid.traits.bite_speed||0).toFixed(1)}s</output>
			<progress value={((boid.metab.bite_time / boid.traits.bite_speed)||0)}></progress>
		</div>
						
	</details>

	<details>
		<summary>
			<div class="krell">
				{#each boid.sensors as i}
					<div class="box" style="width:{Math.min(10,(100/boid.sensors.length)).toFixed()}px">
						<div style="background-color:#80D4FF; height:{(i.val||0)*100}%"></div>
					</div>
				{/each}
			</div>
			<h4 style="clear:none; width:auto;">Sensors</h4>
		</summary>
		<div style="line-height:1.1em;">	
			{#each boid.sensors as i}
				<div class={{sensor_block:true, compact:boid.sensors.length>=10}}>
					<span>{i.name}</span><progress value={i.val||0}></progress>
				</div>
			{/each}
		</div>
	</details>
						
	<details>
		<summary>
			<div class="krell">
				{#each boid.brain as n}
					{#if n.symbol !== 'I'}
						<div class="box">
							<div style="height:{(n.value||0)*100}%; background-color:{n.value>=0?'#AAEEAA':'#B70808'};"></div>
						</div>
					{/if}
				{/each}
			</div>			
			<h4>Brain</h4>
		</summary>
		<div style="margin:0;">
			<p class="brain">
				{#each boid.brain as n}
					<span class="{n.type}" style="background-color:{n.color}">{n.symbol}</span>
				{/each}
			</p>
		</div>
	</details>
	
	<details>
		<summary>
			<div class="krell">
				{#each boid.motors as m}
					<div class="box" >
						<div style="background-color:#e37f1f; height:{((m.this_stoke_time ? m.last_amount : 0)||0)*100}%;"></div>
					</div>
				{/each}
			</div>
			<h4 style="clear:none; width:auto;">Motors</h4>
		</summary>
		<div style="margin:0; line-height:1.1em;">
			{#each boid.motors as m}
				<div style="line-height:1.1em;">			
					<progress style="width:50%; margin-bottom:0.05rem; margin-right:0.25em;" value={(m.this_stoke_time ? m.last_amount : 0)||0}></progress>
					<span style="margin-right:0.35em;">{m.name}</span>
					{#if m.linear}
						<span style="margin-right:0.35em; color:cyan;">{Math.abs(m.linear.toFixed())}</span>
					{/if}
					{#if m.angular}
						<span style="margin-right:0.35em; color:pink;">{Math.abs(m.angular.toFixed())}</span>
					{/if}
					<span style="color:#DDD; font-style:italic;">{m.stroketime.toFixed(1)}s</span>
				</div>
			{/each}
		</div>
	</details>
			
	<details style="margin-bottom: 0.5em">
		<summary style="text-align:center; list-style-type: none;">•••</summary>
		<div>
			<div class="button_rack">
				<button class="" onclick={SaveBoid}>Save</button>
				<button class="" onclick={SaveSpecies}>Save Species</button>
				<button class="" onclick={SaveTankPopulation}>Save All</button>
				<button class="" onclick={SmiteBoid}>Smite</button>
			</div>
			<p>ID: <output>{boid.id}</output></p>
			<p>LIFESPAN: <output>{boid.lifespan}</output></p>
			<p>MATURITY AGE: <output>{boid.maturity_age}</output></p>
			<p>BITE: <output>{(boid.metab.bite_size||0).toFixed(1)}</output>
				@ <output>{(boid.traits.bite_speed||0).toFixed(1)}s</output></p>
			<p>METAB: <output>{(boid.metab.metabolic_rate||0).toFixed(1)}</output></p>
			<p>DIGEST: <output>{(boid.metab.digest_rate||0).toFixed(1)}</output></p>
			<p>FOOD MASK: <output>{boid.traits.food_mask||0}</output></p>
			<table style="width:100%" id="nutrition_table">
				<tbody>
					<tr>
						<td>Nutrition</td>
						{#each boid.traits.nutrition as v}
							<td class={{ verybad:(v<=-2), verygood:(v>=2), good:(v>0&&v<2) }}>
								{v.toFixed(1)}
							</td>
						{/each}
					</tr>	
					<tr>
						<td>Stomach</td>
						{#each boid.metab.stomach as v}
							<td class={{ good:(v>0), bad:(v<0) }}>
								{v.toFixed(1)}
							</td>
						{/each}
					</tr>	
					<tr>
						<td>Bowel</td>
						{#each boid.metab.bowel as v}
							<td>
								{v.toFixed(1)}
							</td>
						{/each}
					</tr>	
					
			</table>
			
			<h4 class="topless">Stats</h4>
			<p>
				<span style="width:32%; display:inline-block;">bites:&nbsp;<output>{(boid.stats.food.bites||0).toFixed()}</output></span>
				<span style="width:32%; display:inline-block;">edible:&nbsp;<output>{(boid.stats.food.edible||0).toFixed()}</output></span>
				<span style="width:32%; display:inline-block;">toxins:&nbsp;<output>{(boid.stats.food.toxins||0).toFixed()}</output></span>
				<span style="width:32%; display:inline-block;">total:&nbsp;<output>{(boid.stats.food.total||0).toFixed()}</output></span>
				<span style="width:32%; display:inline-block;">inedible:&nbsp;<output>{(boid.stats.food.inedible||0).toFixed()}</output></span>
				<span style="width:32%; display:inline-block;">tox_dmg:&nbsp;<output>{(boid.stats.food.toxin_dmg||0).toFixed()}</output></span>
				<span style="width:32%; display:inline-block;">energy:&nbsp;<output>{(boid.stats.food.energy||0).toFixed()}</output></span>
				<span style="width:32%; display:inline-block;">required:&nbsp;<output>{(boid.stats.food.required||0).toFixed()}</output></span>
				<span style="width:32%; display:inline-block;">def_dmg:&nbsp;<output>{(boid.stats.food.deficit_dmg||0).toFixed()}</output></span>
			</p>
			<br/>
		</div>
	</details>
											
</section>	

{/if}