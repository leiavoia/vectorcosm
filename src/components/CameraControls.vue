<script setup>
	import * as utils from '../util/utils.js'
	import { ref, reactive, markRaw, shallowRef, nextTick, triggerRef, onMounted, watch } from 'vue'
	
	// let props = defineProps(['vc']);
	
	let vars = reactive({
		animate_boids: window.vc.animate_boids,
		animate_plants: window.vc.animate_plants,
		show_collision_detection: window.vc.show_collision_detection,
		responsive_tank_size: window.vc.responsive_tank_size,
		allow_hyperzoom: window.vc.allow_hyperzoom,
		transitions: window.vc.camera.transitions,
		parallax: window.vc.camera.parallax,
		show_boid_indicator_on_focus: window.vc.camera.show_boid_indicator_on_focus,
		show_boid_info_on_focus: window.vc.camera.show_boid_info_on_focus,
		show_boid_sensors_on_focus: window.vc.camera.show_boid_sensors_on_focus,
		show_boid_collision_on_focus: window.vc.camera.show_boid_collision_on_focus,
		transition_time: window.vc.camera.transition_time,
		focus_time: window.vc.camera.focus_time,
		// easing: TWEEN.Easing.Sinusoidal.InOut, // SEE: https://github.com/tweenjs/tween.js/blob/main/docs/user_guide.md
	});
	
	watch(vars, _vars => {
		window.vc.animate_boids = vars.animate_boids;
		window.vc.animate_plants = vars.animate_plants;
		window.vc.show_collision_detection = vars.show_collision_detection;
		window.vc.responsive_tank_size = vars.responsive_tank_size;
		window.vc.allow_hyperzoom = vars.allow_hyperzoom;
		window.vc.camera.cinema_mode = vars.cinema_mode;
		window.vc.camera.transitions = vars.transitions;
		window.vc.camera.parallax = vars.parallax;
		window.vc.camera.show_boid_indicator_on_focus = vars.show_boid_indicator_on_focus;
		window.vc.camera.show_boid_info_on_focus = vars.show_boid_info_on_focus;
		window.vc.camera.show_boid_sensors_on_focus = vars.show_boid_sensors_on_focus;
		window.vc.camera.show_boid_collision_on_focus = vars.show_boid_collision_on_focus;
		window.vc.camera.transition_time = vars.transition_time;
		window.vc.camera.focus_time = vars.focus_time;
		// window.vc.SaveSettings();
	});
			
	function MoveCameraOut() {
		const diff = Math.abs( window.vc.scale - (window.vc.scale * (1/(1 + 0.25))) );
		window.vc.MoveCamera( 0, 0, -diff );
	}
	function MoveCameraIn() {
		const diff = Math.abs( window.vc.scale - (window.vc.scale * ((1 + 0.25)/1)) );
		window.vc.MoveCamera( 0, 0, diff );
	}
	function ResetCamera() {
		window.vc.ResetCameraZoom();
	}
	function MoveCameraLeft() {
		window.vc.MoveCamera( -100, 0 );
	}
	function MoveCameraRight() {
		window.vc.MoveCamera( 100, 0 );
	}
	function MoveCameraUp() {
		window.vc.MoveCamera( 0, -100 );
	}
	function MoveCameraDown() {
		window.vc.MoveCamera( 0, 100 );
	}
	function CinemaMode() {
		vars.cinema_mode = !vars.cinema_mode;
		window.vc.CinemaMode( vars.cinema_mode );
	}
						
</script>

<template>
	<div>
		<button @click="$emit('close')" style="width:100%;">Close</button>
		<br/>
		<br/>
		
		<div class="button_rack">
			<button @click="MoveCameraLeft()">⏴&#xFE0E;</button>
			<button @click="MoveCameraRight()">⏵&#xFE0E;</button>
			<button @click="MoveCameraUp()">⏶&#xFE0E;</button>
			<button @click="MoveCameraDown()">⏷&#xFE0E;</button>
			<button @click="MoveCameraIn()">+</button>
			<button @click="MoveCameraOut()">-</button>
			<button @click="ResetCamera()">▢&#xFE0E;</button>
			<button @click="CinemaMode()">⏩&#xFE0E;</button>
		</div>
		
		<br/>
		<br/>
		
		<button @click="vars.animate_boids = !vars.animate_boids" style="width:100%;" :class="{on:vars.animate_boids}">animate_boids</button>
		<button @click="vars.animate_plants = !vars.animate_plants" style="width:100%;" :class="{on:vars.animate_plants}">animate_plants</button>
		<button @click="vars.show_collision_detection = !vars.show_collision_detection" style="width:100%;" :class="{on:vars.show_collision_detection}">show_collision_detection</button>
		<button @click="vars.responsive_tank_size = !vars.responsive_tank_size" style="width:100%;" :class="{on:vars.responsive_tank_size}">responsive_tank_size</button>
		<button @click="vars.allow_hyperzoom = !vars.allow_hyperzoom" style="width:100%;" :class="{on:vars.allow_hyperzoom}">allow_hyperzoom</button>
		<button @click="vars.transitions = !vars.transitions" style="width:100%;" :class="{on:vars.transitions}">transitions</button>
		<button @click="vars.parallax = !vars.parallax" style="width:100%;" :class="{on:vars.parallax}">parallax</button>
		<button @click="vars.show_boid_indicator_on_focus = !vars.show_boid_indicator_on_focus" style="width:100%;" :class="{on:vars.show_boid_indicator_on_focus}">show_boid_indicator_on_focus</button>
		<button @click="vars.show_boid_info_on_focus = !vars.show_boid_info_on_focus" style="width:100%;" :class="{on:vars.show_boid_info_on_focus}">show_boid_info_on_focus</button>
		<button @click="vars.show_boid_sensors_on_focus = !vars.show_boid_sensors_on_focus" style="width:100%;" :class="{on:vars.show_boid_sensors_on_focus}">show_boid_sensors_on_focus</button>
		<button @click="vars.show_boid_collision_on_focus = !vars.show_boid_collision_on_focus" style="width:100%;" :class="{on:vars.show_boid_collision_on_focus}">show_boid_collision_on_focus</button>
	
		<br/>

		<label for="transition_time">Transition</label>
		<input v-model.number="vars.transition_time" type="range" min="0" max="36000" step="100" style="margin-bottom:-0.25em;" id="transition_time" />
		<output for="transition_time">{{vars.transition_time}}ms</output>

		<br/>

		<label for="focus_time">Focus</label>
		<input v-model.number="vars.focus_time" type="range" min="0" max="36000" step="100" style="margin-bottom:-0.25em;" id="focus_time" />
		<output for="focus_time">{{vars.focus_time}}ms</output>

		<br/>
	</div>
	  
			  
</template>

<style>
	BUTTON.on {
		background-color: #80D4FF;
	}
	.button_rack {
		display:flex; 
		align-items:stretch;
	}
	.button_rack BUTTON {
		flex: 1 1 auto;
	}
</style>