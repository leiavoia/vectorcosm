<script>
	import { getContext } from "svelte";
	import { LoadUIState, SaveUIState } from "../util/ui-state.js";

	const api = getContext("api");

	// themeClass: current drawingThemeClass from App.svelte (e.g. 'bg-theme-deepwater')
	// onThemeChanged: callback to update drawingThemeClass live in App.svelte
	let { themeClass = "bg-theme-black", onThemeChanged = null } = $props();

	// ── Constants (backdrop + rock scheme names mirrored from Tank / Rock) ─────

	const BG_THEMES = [
		{ name: "Abysmal", cls: "bg-theme-abysmal" },
		{ name: "Deepwater", cls: "bg-theme-deepwater" },
		{ name: "Algae", cls: "bg-theme-algae" },
		{ name: "Bleak", cls: "bg-theme-bleak" },
		{ name: "Rainstorm", cls: "bg-theme-rainstorm" },
		{ name: "Reactor", cls: "bg-theme-reactor" },
		{ name: "Hades", cls: "bg-theme-hades" },
		{ name: "Thermal Vent", cls: "bg-theme-thermal-vent" },
		{ name: "Asteroid", cls: "bg-theme-asteroid" },
		{ name: "Blue Eye", cls: "bg-theme-blue-eye" },
		{ name: "Aquamarine", cls: "bg-theme-aquamarine" },
		{ name: "Nightmare", cls: "bg-theme-nightmare" },
		{ name: "Tropical", cls: "bg-theme-tropical" },
		{ name: "Hope", cls: "bg-theme-hope" },
		{ name: "Black", cls: "bg-theme-black" },
		// { name: 'White',				cls: 'bg-theme-white' },
		// { name: 'Grey',				 cls: 'bg-theme-grey' },
	];

	const ROCK_SCHEMES = [
		"Grey Marble",
		"Old Marble",
		"Light Copper Oxide",
		"Sandstone",
		"Slate",
		"Wavebreak",
		"Mossyrock",
		"Pink Quartz",
		"Obsidian",
		"Granite",
		"Limestone",
		"Basalt",
		"Jade",
		"Flint",
		"Bluestone",
		"Tiger Eye",
		"Pyrite",
		"Serpentine",
		"Hematite",
	];

	const MASK_STRATS = [
		"lines",
		"interference",
		"radial",
		"zone",
		"xzone",
		"random",
		"hole",
		"burg",
		"sine",
		"depth",
		"cave",
		"trench",
	];
	const POINT_STRATS = ["blotch", "random", "square", "hex"];
	const SHRINK_PATTERNS = ["lines", "random"];

	// Slider bounds — non-reactive consts, easy to tweak
	const C_MIN = 0,
		C_MAX = 5;
	const VP_MIN = 10,
		VP_MAX = 300;
	const SF_MIN = 0.5,
		SF_MAX = 20;
	const SA_MIN = 0.05,
		SA_MAX = 0.4;
	const SV_MIN = 0,
		SV_MAX = 0.45;
	const SH_MIN = 0,
		SH_MAX = 1;
	const RC_MIN = 1,
		RC_MAX = 7;
	const JT_MIN = 0,
		JT_MAX = 0.7;
	const SC_MIN = 0,
		SC_MAX = 1;
	const SE_MIN = 0.4,
		SE_MAX = 2.0;
	const SX_MIN = 0.5,
		SX_MAX = 5;
	const SK_MIN = 0,
		SK_MAX = 2;
	const MR_MIN = 0,
		MR_MAX = 0.5;
	const CC_MIN = 0,
		CC_MAX = 1;
	const MC_MIN = 0,
		MC_MAX = 1;
	const MS_MIN = 0,
		MS_MAX = 1;
	const SPC_MIN = 0,
		SPC_MAX = 1;
	const SL_MIN = 0,
		SL_MAX = 3;
	const MRC_MIN = 0,
		MRC_MAX = 1;

	// ── Helpers ────────────────────────────────────────────────────────────────

	function randomInt(min, max) {
		return Math.floor(min + Math.random() * (max - min + 1));
	}
	function randomFloat(min, max) {
		return min + Math.random() * (max - min);
	}
	function pick(arr) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	// volume: display with K suffix; < 5 → one decimal, else integer
	function formatVolume(v) {
		return (v < 5000000 ? (v/1000000).toFixed(1) : (+v/1000000).toFixed(0)) + 'K';
	}
	// tank X/Y: display with comma separator
	function formatDim(v) {
		return Math.round(+v).toLocaleString('en-US');
	}

	function classToName(cls) {
		return BG_THEMES.find(t => t.cls === cls)?.name ?? "Deepwater";
	}
	function nameToClass(name) {
		return BG_THEMES.find(t => t.name === name)?.cls ?? "bg-theme-deepwater";
	}

	// Load persisted UI state; bg_theme is not persisted (derived from current active theme)
	const saved = LoadUIState("panel.tank_maker", {}, v =>
		v && typeof v === "object" && !Array.isArray(v) ? v : {},
	);
	function savedValue(key, fallback) {
		return key in saved ? saved[key] : fallback;
	}

	// ── Reactive State ─────────────────────────────────────────────────────────

	// bg_theme initialized from current active theme, not saved state
	let bg_theme = $state("Deepwater");
	
	// Sync bg_theme when themeClass prop changes
	$effect(() => {
		bg_theme = classToName(themeClass);
	});
	let bg_theme_rnd = $state(savedValue("bg_theme_rnd", false));

	let fit_screen = $state(savedValue("fit_screen", true));
	let volume = $state(savedValue("volume", 4000000));
	let tank_x = $state(savedValue("tank_x", 3000));
	let tank_y = $state(savedValue("tank_y", 2000));

	let rock_schemes = $state(savedValue("rock_schemes", []));
	let rock_schemes_rnd = $state(savedValue("rock_schemes_rnd", true));

	let complexity = $state(savedValue("complexity", 2));
	let complexity_rnd = $state(savedValue("complexity_rnd", false));

	let mask_strat = $state(savedValue("mask_strat", "lines"));
	let mask_strat_rnd = $state(savedValue("mask_strat_rnd", false));

	let sine_freq = $state(savedValue("sine_freq", 5));
	let sine_freq_rnd = $state(savedValue("sine_freq_rnd", true));
	let sine_amp = $state(savedValue("sine_amp", 0.2));
	let sine_amp_rnd = $state(savedValue("sine_amp_rnd", true));
	let sine_vshift = $state(savedValue("sine_vshift", 0.2));
	let sine_vshift_rnd = $state(savedValue("sine_vshift_rnd", true));
	let sine_hshift = $state(savedValue("sine_hshift", 0.5));
	let sine_hshift_rnd = $state(savedValue("sine_hshift_rnd", true));

	let rad_cycles = $state(savedValue("rad_cycles", 3));
	let rad_cycles_rnd = $state(savedValue("rad_cycles_rnd", true));
	let rad_spin = $state(savedValue("rad_spin", 0.5));
	let rad_spin_rnd = $state(savedValue("rad_spin_rnd", true));
	let rad_cx = $state(savedValue("rad_cx", 0.5));
	let rad_cx_rnd = $state(savedValue("rad_cx_rnd", true));
	let rad_cy = $state(savedValue("rad_cy", 0.5));
	let rad_cy_rnd = $state(savedValue("rad_cy_rnd", true));

	let mask_chance = $state(savedValue("mask_chance", 0.26));
	let mask_chance_rnd = $state(savedValue("mask_chance_rnd", false));

	let vpts = $state(savedValue("vpts", 80));
	let vpts_rnd = $state(savedValue("vpts_rnd", false));
	let pt_strat = $state(savedValue("pt_strat", "random"));
	let pt_strat_rnd = $state(savedValue("pt_strat_rnd", true));
	let jitter = $state(savedValue("jitter", 0.3));
	let jitter_rnd = $state(savedValue("jitter_rnd", true));

	let slur_xc = $state(savedValue("slur_xc", 0.5));
	let slur_xc_rnd = $state(savedValue("slur_xc_rnd", true));
	let slur_yc = $state(savedValue("slur_yc", 0.5));
	let slur_yc_rnd = $state(savedValue("slur_yc_rnd", true));
	let slur_xe = $state(savedValue("slur_xe", 1.0));
	let slur_xe_rnd = $state(savedValue("slur_xe_rnd", true));
	let slur_ye = $state(savedValue("slur_ye", 1.0));
	let slur_ye_rnd = $state(savedValue("slur_ye_rnd", true));

	let scale_x = $state(savedValue("scale_x", 2));
	let scale_x_rnd = $state(savedValue("scale_x_rnd", true));
	let scale_y = $state(savedValue("scale_y", 2));
	let scale_y_rnd = $state(savedValue("scale_y_rnd", true));
	let skew_x = $state(savedValue("skew_x", 0));
	let skew_x_rnd = $state(savedValue("skew_x_rnd", true));
	let max_rot = $state(savedValue("max_rot", 0.2));
	let max_rot_rnd = $state(savedValue("max_rot_rnd", false));

	let crazy_chance = $state(savedValue("crazy_chance", 0.3));
	let crazy_chance_rnd = $state(savedValue("crazy_chance_rnd", false));
	let crazy_max = $state(savedValue("crazy_max", 0.4));
	let crazy_max_rnd = $state(savedValue("crazy_max_rnd", false));
	let shrink_pat = $state(savedValue("shrink_pat", "lines"));
	let shrink_pat_rnd = $state(savedValue("shrink_pat_rnd", false));
	let max_shrink = $state(savedValue("max_shrink", 0.73));
	let max_shrink_rnd = $state(savedValue("max_shrink_rnd", false));
	let shrink_lines = $state(savedValue("shrink_lines", 1));
	let shrink_lines_rnd = $state(savedValue("shrink_lines_rnd", true));
	let shrink_chance = $state(savedValue("shrink_chance", 0.34));
	let shrink_chance_rnd = $state(savedValue("shrink_chance_rnd", false));

	// ── Background Theme live preview ─────────────────────────────────────────
	// Read event.target.value directly to avoid bind:value race on <select> change.

	function onBgThemeChange(event) {
		const name = event.target.value;
		if (typeof onThemeChanged === "function") {
			onThemeChanged(nameToClass(name));
		}
		// update worker tank.bg_theme for persistence without a full rebuild
		api.send("set_bg_theme", { name });
	}

	// ── Persist all UI state on any change ────────────────────────────────────

	$effect(() => {
		SaveUIState("panel.tank_maker", {
			bg_theme_rnd,
			rock_schemes: rock_schemes.slice(),
			rock_schemes_rnd,
			complexity,
			complexity_rnd,
			mask_strat,
			mask_strat_rnd,
			sine_freq,
			sine_freq_rnd,
			sine_amp,
			sine_amp_rnd,
			sine_vshift,
			sine_vshift_rnd,
			sine_hshift,
			sine_hshift_rnd,
			rad_cycles,
			rad_cycles_rnd,
			rad_spin,
			rad_spin_rnd,
			rad_cx,
			rad_cx_rnd,
			rad_cy,
			rad_cy_rnd,
			mask_chance,
			mask_chance_rnd,
			vpts,
			vpts_rnd,
			pt_strat,
			pt_strat_rnd,
			jitter,
			jitter_rnd,
			slur_xc,
			slur_xc_rnd,
			slur_yc,
			slur_yc_rnd,
			slur_xe,
			slur_xe_rnd,
			slur_ye,
			slur_ye_rnd,
			scale_x,
			scale_x_rnd,
			scale_y,
			scale_y_rnd,
			skew_x,
			skew_x_rnd,
			max_rot,
			max_rot_rnd,
			crazy_chance,
			crazy_chance_rnd,
			crazy_max,
			crazy_max_rnd,
			shrink_pat,
			shrink_pat_rnd,
			max_shrink,
			max_shrink_rnd,
			shrink_lines,
			shrink_lines_rnd,
			shrink_chance,
			shrink_chance_rnd,
			fit_screen,
			volume,
			tank_x,
			tank_y,
		});
	});

	// ── Create ─────────────────────────────────────────────────────────────────

	function Create() {
		const res_bg = bg_theme_rnd ? pick(BG_THEMES).name : bg_theme;
		const res_mask = mask_strat_rnd ? pick(MASK_STRATS) : mask_strat;
		const res_shrink = shrink_pat_rnd ? pick(SHRINK_PATTERNS) : shrink_pat;

		if (typeof onThemeChanged === "function") {
			onThemeChanged(nameToClass(res_bg));
		}

		// compute tank dimensions from size settings
		let tank_width, tank_height;
		if (fit_screen) {
			const aspect = window.innerWidth / window.innerHeight;
			const area_px = volume;
			tank_width = Math.round(Math.sqrt(area_px * aspect));
			tank_height = Math.round(Math.sqrt(area_px / aspect));
		}
		else {
			tank_width = Number(tank_x);
			tank_height = Number(tank_y);
		}

		const settings = {
			rock_strat: "voronoi",
			rock_color_schemes: rock_schemes_rnd ? [] : [...rock_schemes].shuffle(),
			//	 max_cosmetic_complexity: complexity_rnd
			//		 ? randomInt(C_MIN, C_MAX)
			//		 : +complexity,
			max_cosmetic_complexity: 2,
			voronoi_mask_strat: res_mask,
			voronoi_points: vpts_rnd ? randomInt(VP_MIN, VP_MAX) : Number(vpts),
			voronoi_point_strategy: pt_strat_rnd ? pick(POINT_STRATS) : pt_strat,
			voronoi_point_jitter: jitter_rnd ? randomFloat(JT_MIN, JT_MAX) : +jitter,
			voronoi_point_slur_x_center: slur_xc_rnd
				? randomFloat(SC_MIN, SC_MAX)
				: +slur_xc,
			voronoi_point_slur_y_center: slur_yc_rnd
				? randomFloat(SC_MIN, SC_MAX)
				: +slur_yc,
			voronoi_point_slur_x_expo: slur_xe_rnd
				? randomFloat(SE_MIN, SE_MAX)
				: +slur_xe,
			voronoi_point_slur_y_expo: slur_ye_rnd
				? randomFloat(SE_MIN, SE_MAX)
				: +slur_ye,
			scale_x: scale_x_rnd ? randomFloat(SX_MIN, SX_MAX) : +scale_x,
			scale_y: scale_y_rnd ? randomFloat(SX_MIN, SX_MAX) : +scale_y,
			skew_x: skew_x_rnd ? randomFloat(SK_MIN, SK_MAX) : +skew_x,
			max_rotation: max_rot_rnd ? randomFloat(MR_MIN, MR_MAX) : +max_rot,
			crazytown_chance: crazy_chance_rnd
				? randomFloat(CC_MIN, CC_MAX)
				: +crazy_chance,
			max_crazyness: crazy_max_rnd ? randomFloat(MC_MIN, MC_MAX) : +crazy_max,
			rock_shrinkage_pattern: res_shrink,
			max_rock_shrinkage: max_shrink_rnd
				? randomFloat(MS_MIN, MS_MAX)
				: +max_shrink,
		};

		if (res_mask === "sine") {
			settings.voronoi_sine_freq = sine_freq_rnd
				? randomFloat(SF_MIN, SF_MAX)
				: +sine_freq;
			settings.voronoi_sine_amplitude = sine_amp_rnd
				? randomFloat(SA_MIN, SA_MAX)
				: +sine_amp;
			settings.voronoi_sine_vshift = sine_vshift_rnd
				? randomFloat(SV_MIN, SV_MAX)
				: +sine_vshift;
			settings.voronoi_sine_hshift = sine_hshift_rnd
				? randomFloat(SH_MIN, SH_MAX)
				: +sine_hshift;
		}

		if (res_mask === "radial") {
			settings.voronoi_radial_cycles = rad_cycles_rnd
				? randomInt(RC_MIN, RC_MAX)
				: +rad_cycles;
			settings.voronoi_radial_spin = rad_spin_rnd ? Math.random() : +rad_spin;
			settings.voronoi_radial_center_x = rad_cx_rnd ? Math.random() : +rad_cx;
			settings.voronoi_radial_center_y = rad_cy_rnd ? Math.random() : +rad_cy;
		}

		if (res_mask === "random") {
			settings.voronoi_mask_random_chance = mask_chance_rnd
				? randomFloat(MRC_MIN, MRC_MAX)
				: +mask_chance;
		}

		if (res_shrink === "lines") {
			settings.rock_shrinkage_lines = shrink_lines_rnd
				? randomInt(SL_MIN, SL_MAX)
				: +shrink_lines;
		} else if (res_shrink === "random") {
			settings.rock_shrinkage_chance = shrink_chance_rnd
				? randomFloat(SPC_MIN, SPC_MAX)
				: +shrink_chance;
		}

		api.send("make_tank", { bg_theme: res_bg, tank_maker_settings: settings, width: tank_width, height: tank_height });
	}
</script>

<section>
	<header>
		<h3>Tank Maker</h3>
	</header>

	<!-- Create button at very top -->
	<button onclick={Create} class="create_btn">Create Tank</button>

	<!-- Tank Size: fit-screen with volume control, or explicit X/Y dimensions -->
	<details open>
		<summary>Tank Size</summary>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" role="switch" bind:checked={fit_screen} />
				Fit Screen Dimensions
			</label>
		</div>
		{#if fit_screen}
			<div class="ctrl_row">
				<label for="volume_range"><span title="Total tank area in thousands of square pixels.">Volume:</span></label>
				<input id="volume_range" type="range" min="1000000" max="100000000" step="100000" bind:value={volume} />
				<output>{formatVolume(volume)}</output>
			</div>
		{:else}
			<div class="ctrl_row">
				<label for="tank_x_range"><span title="Tank width in pixels.">Width:</span></label>
				<input id="tank_x_range" type="range" min="1000" max="10000" step="1" bind:value={tank_x} />
				<output>{formatDim(tank_x)}</output>
			</div>
			<div class="ctrl_row">
				<label for="tank_y_range"><span title="Tank height in pixels.">Height:</span></label>
				<input id="tank_y_range" type="range" min="1000" max="10000" step="1" bind:value={tank_y} />
				<output>{formatDim(tank_y)}</output>
			</div>
		{/if}
	</details>

	<!-- Theme Settings: background, rock colors, complexity -->
	<details open>
		<summary>Theme</summary>

		<!-- Background Theme: live-previews on change, also updates worker tank.bg_theme -->
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={bg_theme_rnd} />
				<span title="Background wallpaper color theme">Background:</span>
			</label>
			<select
				bind:value={bg_theme}
				disabled={bg_theme_rnd}
				onchange={onBgThemeChange}
			>
				{#each BG_THEMES as t}
					<option value={t.name}>{t.name}</option>
				{/each}
			</select>
		</div>

		<!-- Rock Color Schemes: empty array = TankMaker auto-picks randomly -->
		<div class="ctrl_row multi" style="align-items: flex-start;">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={rock_schemes_rnd} />
				<span title="Rock color schemes. Select multiple with Ctrl/Cmd.">Rock Colors:</span>
			</label>
			<select
				multiple
				bind:value={rock_schemes}
				disabled={rock_schemes_rnd}
				size="4"
			>
				{#each ROCK_SCHEMES as s}
					<option value={s}>{s}</option>
				{/each}
			</select>
		</div>

		<!-- Rock Complexity -->
		<!-- <div class="ctrl_row">
		<label>
		<input type="checkbox" title="Randomize" bind:checked={complexity_rnd} />
		Complexity:
		</label>
		<input
		type="range"
		min={C_MIN}
		max={C_MAX}
		step="1"
		bind:value={complexity}
		disabled={complexity_rnd}
		/>
		<output>{complexity}</output>
	</div> -->
	</details>

	<!-- Point Distribution -->
	<details open>
		<summary>Rock Generation</summary>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={vpts_rnd} /> 
				<span title="Number of Voronoi points to seed rock generation.">Voronoi Points:</span>
			</label>
			<input
				type="range"
				min={VP_MIN}
				max={VP_MAX}
				step="1"
				bind:value={vpts}
				disabled={vpts_rnd}
			/>
			<output>{vpts}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={pt_strat_rnd} /> 
				<span title="Point distribution strategy for rock generation.">Point Strategy:</span>
			</label>
			<select bind:value={pt_strat} disabled={pt_strat_rnd}>
				{#each POINT_STRATS as s}
					<option value={s}>{s}</option>
				{/each}
			</select>
		</div>

		<!-- Mask Strategy — sub-panels for sine / radial / random appear conditionally -->
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={mask_strat_rnd} />
				<span title="Mask strategy that determines which cells become rocks.">Mask Strategy:</span>
			</label>
			<select bind:value={mask_strat} disabled={mask_strat_rnd}>
				{#each MASK_STRATS as s}
					<option value={s}>{s}</option>
				{/each}
			</select>
		</div>

		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={jitter_rnd} /> 
				<span title="Random jitter applied to points.">Point Jitter:</span>
			</label>
			<input
				type="range"
				min={JT_MIN}
				max={JT_MAX}
				step="0.01"
				bind:value={jitter}
				disabled={jitter_rnd}
			/>
			<output>{(+jitter).toFixed(2)}</output>
		</div>
	</details>

	<!-- Point Slur: bias point distribution across the field -->
	<details>
		<summary>Point Bias</summary>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={slur_xc_rnd} />
				<span title="X position to bias from">Bias X Center:</span>
			</label>
			<input
				type="range"
				min={SC_MIN}
				max={SC_MAX}
				step="0.01"
				bind:value={slur_xc}
				disabled={slur_xc_rnd}
			/>
			<output>{(+slur_xc).toFixed(2)}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={slur_yc_rnd} />
				<span title="Y position to bias from">Bias Y Center:</span>
			</label>
			<input
				type="range"
				min={SC_MIN}
				max={SC_MAX}
				step="0.01"
				bind:value={slur_yc}
				disabled={slur_yc_rnd}
			/>
			<output>{(+slur_yc).toFixed(2)}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={slur_xe_rnd} />
				<span title="X exponent for slur. Determines attraction or repulsion along the X axis.">Bias X Expo:</span>
			</label>
			<input
				type="range"
				min={SE_MIN}
				max={SE_MAX}
				step="0.05"
				bind:value={slur_xe}
				disabled={slur_xe_rnd}
			/>
			<output>{(+slur_xe).toFixed(2)}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={slur_ye_rnd} />
				<span title="Y exponent for slur. Determines attraction or repulsion along the Y axis.">Bias Y Expo:</span>
			</label>
			<input
				type="range"
				min={SE_MIN}
				max={SE_MAX}
				step="0.05"
				bind:value={slur_ye}
				disabled={slur_ye_rnd}
			/>
			<output>{(+slur_ye).toFixed(2)}</output>
		</div>
	</details>

	<!-- SINE custom settings -->
	{#if mask_strat === "sine" && !mask_strat_rnd}
		<details open>
			<summary>Sine Parameters</summary>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={sine_freq_rnd} /> 
					<span title="Frequency of the sine wave.">Frequency:</span>
				</label>
				<input
					type="range"
					min={SF_MIN}
					max={SF_MAX}
					step="0.1"
					bind:value={sine_freq}
					disabled={sine_freq_rnd}
				/>
				<output>{(+sine_freq).toFixed(1)}</output>
			</div>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={sine_amp_rnd} /> 
					<span title="Amplitude of the sine wave.">Amplitude:</span>
				</label>
				<input
					type="range"
					min={SA_MIN}
					max={SA_MAX}
					step="0.01"
					bind:value={sine_amp}
					disabled={sine_amp_rnd}
				/>
				<output>{(+sine_amp).toFixed(2)}</output>
			</div>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={sine_vshift_rnd} /> 
					<span title="Vertical shift of the sine wave.">V-Shift:</span>
				</label>
				<input
					type="range"
					min={SV_MIN}
					max={SV_MAX}
					step="0.01"
					bind:value={sine_vshift}
					disabled={sine_vshift_rnd}
				/>
				<output>{(+sine_vshift).toFixed(2)}</output>
			</div>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={sine_hshift_rnd} /> 
					<span title="Horizontal shift of the sine wave.">H-Shift:</span>
				</label>
				<input
					type="range"
					min={SH_MIN}
					max={SH_MAX}
					step="0.01"
					bind:value={sine_hshift}
					disabled={sine_hshift_rnd}
				/>
				<output>{(+sine_hshift).toFixed(2)}</output>
			</div>
		</details>
	{/if}

	<!-- RADIAL custom settings -->
	{#if mask_strat === "radial" && !mask_strat_rnd}
		<details open>
			<summary>Radial Parameters</summary>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={rad_cycles_rnd} />
					<span title="Number of spokes in the radial pattern.">Spokes:</span>
				</label>
				<input
					type="range"
					min={RC_MIN}
					max={RC_MAX}
					step="1"
					bind:value={rad_cycles}
					disabled={rad_cycles_rnd}
				/>
				<output>{rad_cycles}</output>
			</div>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={rad_spin_rnd} /> 
					<span title="Rotation of the radial pattern. Provides a bit of homogeneity.">Rotation:</span>
				</label>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					bind:value={rad_spin}
					disabled={rad_spin_rnd}
				/>
				<output>{(+rad_spin).toFixed(2)}</output>
			</div>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={rad_cx_rnd} /> 
					<span title="X coordinate of the center of the radial pattern.">Center X:</span>
				</label>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					bind:value={rad_cx}
					disabled={rad_cx_rnd}
				/>
				<output>{(+rad_cx).toFixed(2)}</output>
			</div>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={rad_cy_rnd} /> 
					<span title="Y coordinate of the center of the radial pattern.">Center Y:</span>
				</label>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					bind:value={rad_cy}
					disabled={rad_cy_rnd}
				/>
				<output>{(+rad_cy).toFixed(2)}</output>
			</div>
		</details>
	{/if}

	<!-- RANDOM POINTS custom settings -->
	{#if mask_strat === "random" && !mask_strat_rnd}
		<details>
			<summary>Mask Randomization Options</summary>
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={mask_chance_rnd} /> 
					<span title="Random chance of a cell becoming a rock.">Rock Chance:</span>
				</label>
				<input
					type="range"
					min={MRC_MIN}
					max={MRC_MAX}
					step="0.01"
					bind:value={mask_chance}
					disabled={mask_chance_rnd}
				/>
				<output>{(+mask_chance).toFixed(2)}</output>
			</div>	
		</details>
	{/if}

	<!-- Distortion: scale, skew, rotation of voronoi point space -->
	<details>
		<summary>Distortion</summary>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={scale_x_rnd} /> 
				<span title="Scale factor to stretch all rock points in the X direction.">Scale X:</span>
			</label>
			<input
				type="range"
				min={SX_MIN}
				max={SX_MAX}
				step="0.1"
				bind:value={scale_x}
				disabled={scale_x_rnd}
			/>
			<output>{(+scale_x).toFixed(1)}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={scale_y_rnd} /> 
				<span title="Scale factor to stretch all rock points in the Y direction.">Scale Y:</span>
			</label>
			<input
				type="range"
				min={SX_MIN}
				max={SX_MAX}
				step="0.1"
				bind:value={scale_y}
				disabled={scale_y_rnd}
			/>
			<output>{(+scale_y).toFixed(1)}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={skew_x_rnd} /> 
				<span title="Rock point skew in the X direction.">Skew X:</span>
			</label>
			<input
				type="range"
				min={SK_MIN}
				max={SK_MAX}
				step="0.05"
				bind:value={skew_x}
				disabled={skew_x_rnd}
			/>
			<output>{(+skew_x).toFixed(2)}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={max_rot_rnd} /> 
				<span title="Maximum rotation of all rocks.">Max Rotation:</span>
			</label>
			<input
				type="range"
				min={MR_MIN}
				max={MR_MAX}
				step="0.01"
				bind:value={max_rot}
				disabled={max_rot_rnd}
			/>
			<output>{(+max_rot).toFixed(2)}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={crazy_chance_rnd} /> 
				<span title="Who even knows what this does? Here be dragons!">Crazytown:</span>
			</label>
			<input
				type="range"
				min={CC_MIN}
				max={CC_MAX}
				step="0.01"
				bind:value={crazy_chance}
				disabled={crazy_chance_rnd}
			/>
			<output>{(+crazy_chance).toFixed(2)}</output>
		</div>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={crazy_max_rnd} /> 
				<span title="Maximum crazyness of crazytown mode. Stay safe!">Max Crazyness:</span>
			</label>
			<input
				type="range"
				min={MC_MIN}
				max={MC_MAX}
				step="0.01"
				bind:value={crazy_max}
				disabled={crazy_max_rnd}
			/>
			<output>{(+crazy_max).toFixed(2)}</output>
		</div>		
	</details>

	<!-- Fracturing -->
	<details>
		<summary>Fracturing</summary>
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={shrink_pat_rnd} /> 
				<span title="Strategy to determine how to fracture rocks.">Fracture Strategy:</span>
			</label>
			<select bind:value={shrink_pat} disabled={shrink_pat_rnd}>
				{#each SHRINK_PATTERNS as p}
					<option value={p}>{p}</option>
				{/each}
			</select>
		</div>
		{#if shrink_pat === "lines" && !shrink_pat_rnd}
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={shrink_lines_rnd} /> 
					<span title="Number of random lines for the 'lines' fracture strategy.">Fracture Lines:</span>
				</label>
				<input
					type="range"
					min={SL_MIN}
					max={SL_MAX}
					step="1"
					bind:value={shrink_lines}
					disabled={shrink_lines_rnd}
				/>
				<output>{shrink_lines}</output>
			</div>
		{/if}
		{#if shrink_pat === "random" && !shrink_pat_rnd}
			<div class="ctrl_row">
				<label>
					<input type="checkbox" title="Randomize" bind:checked={shrink_chance_rnd} /> 
					<span title="Chance of a rock shrinking in the 'random' fracture strategy.">Fracture Chance:</span>
				</label>
				<input
					type="range"
					min={SPC_MIN}
					max={SPC_MAX}
					step="0.01"
					bind:value={shrink_chance}
					disabled={shrink_chance_rnd}
				/>
				<output>{(+shrink_chance).toFixed(2)}</output>
			</div>
		{/if}
		<div class="ctrl_row">
			<label>
				<input type="checkbox" title="Randomize" bind:checked={max_shrink_rnd} /> 
				<span title="Maximum amount a rock can shrink.">Max Shrinkage:</span>
			</label>
			<input
				type="range"
				min={MS_MIN}
				max={MS_MAX}
				step="0.01"
				bind:value={max_shrink}
				disabled={max_shrink_rnd}
			/>
			<output>{(+max_shrink).toFixed(2)}</output>
		</div>
	</details>
</section>

<style>
	.ctrl_row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.2rem 0;
	}
	.ctrl_row LABEL {
		min-width: 10.5rem;
		margin-bottom: 0;
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: #fff;
	}
	.ctrl_row INPUT[type="range"] {
		flex: 1 1 auto;
		margin-bottom: 0;
	}
	.ctrl_row SELECT {
		flex: 1 1 auto;
		margin-bottom: 0;
		padding: 0.15rem 0.3rem;
	}
	.ctrl_row OUTPUT {
		min-width: 3.2rem;
		text-align: right;
		flex: 0 0 auto;
	}
	.ctrl_row.multi SELECT {
		align-self: flex-start;
	}

	button.create_btn {
		width: 100%;
		margin-bottom: 1rem;
	}
	
	/* ignore normal color changes */ 
	details summary {
		color: var(--pico-color) !important;
	}

	/* checkboxes indicate randomization state, not boolean on/off, so use custom dice icon */
	[type="checkbox"]:checked {
		background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 0 512 512"><path fill="%23fff" d="M422.19 109.95L256.21 9.07c-19.91-12.1-44.52-12.1-64.43 0L25.81 109.95c-5.32 3.23-5.29 11.27.06 14.46L224 242.55l198.14-118.14c5.35-3.19 5.38-11.22.05-14.46zm13.84 44.63L240 271.46v223.82c0 12.88 13.39 20.91 24.05 14.43l152.16-92.48c19.68-11.96 31.79-33.94 31.79-57.7v-197.7c0-6.41-6.64-10.43-11.97-7.25zM0 161.83v197.7c0 23.77 12.11 45.74 31.79 57.7l152.16 92.47c10.67 6.48 24.05-1.54 24.05-14.43V271.46L11.97 154.58C6.64 151.4 0 155.42 0 161.83z"/></svg>');
		background-size: contain;
		background-repeat: no-repeat;
		background-position: center;
	}

	/* tank size switch: let Pico render its native toggle style */
	[type="checkbox"][role="switch"]:checked {
		background-image: none;
	}
</style>
