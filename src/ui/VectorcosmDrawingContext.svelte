<script>
	import Two from "two.js";
	import { onMount, setContext } from 'svelte';
	import { fade } from 'svelte/transition';
	
	setContext('vc-canvas', {
		'test': str => console.log(str)
	});
	
	export function injestEvent( event ) {
		console.log(event);
	}
	
	onMount(() => {
		// set up Two.js
		let two = new Two({ fitted: true, type: 'SVGRenderer' }); 
		globalThis.two = two; // make available everywhere
		// mount Two.js drawing context
		let elem = globalThis.document.getElementById('vectorcosm_context');
		two.appendTo(elem);
		// two.update();
	})
	
	function ClickMap( event ) {
		console.log('click map');
	}
	
	function MouseMove( event ) {
		// console.log('mouse move');
	}
	
	function MouseDown( event ) {
		console.log('mouse down');
	}
	
	function MouseUp( event ) {
		console.log('mouse up');
	}
	
	function Keypress( event ) {
		console.log('keypress',event);
	}
	
</script>

<!-- <div :class="{'shape-container':true, 'hidecursor':is_idle}"  -->
<!-- svelte-ignore -->
<div id="vectorcosm_drawing_container" 
	role="none"
	onclick={() => ClickMap()}
	oncontextmenu={() => ClickMap()}
	onmousemove={() => MouseMove()}
	onmousedown={() => MouseDown()}
	onmouseup={() => MouseUp()}
	onkeypress={() => Keypress()}
>
	<div transition:fade={{duration:700}} id="vectorcosm_context" class="bg-theme-deepwater"></div>
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
</style>