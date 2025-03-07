<script>
	import Two from "two.js";
	import { onMount, setContext, createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	
	const dispatcher = createEventDispatcher();

	let theme_classname = $state('bg-theme-black');
	
	export function SetTheme( name ) {
		theme_classname = 'bg-theme-' + name.replace('bg-theme-','');
	}
	
	onMount(() => {
		// set up Two.js
		let two = new Two({ fitted: true, type: 'SVGRenderer' });  // 'WebGLRenderer', 'SVGRenderer', 'CanvasRenderer'
		globalThis.two = two; // make available everywhere
		// mount Two.js drawing context
		let elem = globalThis.document.getElementById('vectorcosm_context');
		two.appendTo(elem);
		// let parent components know we are ready to rock
		dispatcher('drawingReady');
	})
	
</script>

<div id="vectorcosm_drawing_container" style="pointer-events: auto;" class={theme_classname}>
	<div transition:fade={{duration:700}} id="vectorcosm_context" style="pointer-events: none;"></div>
</div>

<style>
	#vectorcosm_context {
		width: 100vw;
		height: 100vh;
	}
	#vectorcosm_drawing_container {
		width: 100vw;
		height: 100vh;
		position: fixed; 
		left:0em; 
		top:0em; 
		right:0em;
		bottom:0em;
		z-index: -1; 		
	}
	
	/* abysmal / ultra dark blue */
	#vectorcosm_drawing_container.bg-theme-abysmal {
		background:#000411;
	}
		
	/* solid black */
	#vectorcosm_drawing_container.bg-theme-black {
		background:#000;
	}
		
	/* solid white */
	#vectorcosm_drawing_container.bg-theme-white {
		background:#FFF;
	}
		
	/* solid grey */
	#vectorcosm_drawing_container.bg-theme-grey {
		background:#444;
	}
		
	/* deepwater */
	#vectorcosm_drawing_container.bg-theme-deepwater {
		background-image: linear-gradient( to top, #000 0%, #000 50%, #048 80%, #06A 100% );
	}
		
	/* aquamarine */
	#vectorcosm_drawing_container.bg-theme-aquamarine {
		background-image: linear-gradient( to top, #001B1E 0%, #053A3E 50%, #147A86 80%, #3DA3AF 100% );
	}
		
	/* nightmare */
	#vectorcosm_drawing_container.bg-theme-nightmare {
		background-image: linear-gradient( to top, #1B1330 0%, #29214A 50%, #363C6F 80%, #3D365E 100% );
	}
		
	/* tropical */
	#vectorcosm_drawing_container.bg-theme-tropical {
		background-image: radial-gradient( ellipse 100% 100% at 100% 0%, #471F10, #391F2A, #0F3938, #0a242a); 
	}
		
	/* hope */
	#vectorcosm_drawing_container.bg-theme-hope {
		background-image: linear-gradient( 315deg, #000000 0%, #5e5368 74% );
	}
		
	/* leather */
	#vectorcosm_drawing_container.bg-theme-leather {
		background-image: linear-gradient(315deg, #1A0804 0%, #322007 74%);
	}
		
	/* algae bloom */
	#vectorcosm_drawing_container.bg-theme-algae {
		background-image: linear-gradient( to top, #000 0%, #000000 30%, #1B312B 70%, #2A463A 100% ) ;
	}
		
	/* bleak */
	#vectorcosm_drawing_container.bg-theme-bleak {
		background-image: linear-gradient( to bottom, #1F313F 0%, #000 75%, #000 100% );
	}
	
	/* rain storm */
	#vectorcosm_drawing_container.bg-theme-rainstorm {
		background-image:
			linear-gradient( to bottom, 
				#0B162299 0%, 
				#000 75%, 
				#000 100% 
			),
			repeating-linear-gradient(to right, 
				rgba(31,49,63,1) 0%, 
				rgba(66,97,121,1) 21%, 
				rgba(66,97,121,1) 24%, 
				rgba(22,41,55,1) 47%, 
				rgba(22,41,55,1) 53%, 
				rgba(66,97,121,1) 81%, 
				rgba(66,97,121,1) 84%, 
				rgba(31,49,63,1) 100%
			)
		;
	}	
		
	/* reactor */
	#vectorcosm_drawing_container.bg-theme-reactor {
		background-image:
			radial-gradient( ellipse 100% 70% at 50% 100% , 
				#081D68 0%, 
				#000 90%, 
				#000 100% 
			)
		;
	}
			
	/* hades */
	#vectorcosm_drawing_container.bg-theme-hades {
		background-image:
			radial-gradient( ellipse 100% 70% at 50% 100% , 
				#300101 0%, 
				#000 90%, 
				#000 100% 
			)
		;
	}
			
	/* thermal vent */
	#vectorcosm_drawing_container.bg-theme-thermal-vent {
		background-image:
			radial-gradient( ellipse 100% 100% at 50% 100% , 
				#251E0D 0%, 
				#000 90%, 
				#000 100% 
			)
		;
	}	
		
	/* moonlit asteroid - https://uigradients.com/#MoonlitAsteroid */
	#vectorcosm_drawing_container.bg-theme-asteroid {
		background-image: radial-gradient( ellipse 100% 100% at 100% 0%, #2c5364, #203a43, #0f2027); 
	}
	
	/* blue eye */
	#vectorcosm_drawing_container.bg-theme-blue-eye {
		background: #254975 radial-gradient(at center, #254975, #0D0320);
	}
				
</style>