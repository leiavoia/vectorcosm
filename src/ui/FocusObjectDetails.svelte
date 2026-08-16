<script>
	/* <AI>
	FocusObjectDetails — shell dispatcher for the focus/inspection side panel.
	Renders a subtype-specific widget keyed off `focusObject.type` (worker's DescribeBoid/DescribePlant
	'type' field). This stays a thin router; put per-type layout/logic in its own
	FocusObjectDetails<Type>.svelte (see FocusObjectDetailsBoid.svelte, FocusObjectDetailsPlant.svelte).
	To add a new pickable type (rocks, food, etc.): add its otype to PICKABLE_OTYPES + a Describe*
	function in the worker's pick_object handler, then add a branch + component here.
	</AI> */
	import FocusObjectDetailsBoid from './FocusObjectDetailsBoid.svelte';
	import FocusObjectDetailsPlant from './FocusObjectDetailsPlant.svelte';

	let {
		focusObject = null,
		records = null,
		forceShowBrainGraph = null,
		onBoidLibraryChanged = null,
	} = $props();
</script>

{#if focusObject?.type === 'plant'}
	<FocusObjectDetailsPlant plant={focusObject} />
{:else if focusObject}
	<FocusObjectDetailsBoid
		boid={focusObject}
		{records}
		{forceShowBrainGraph}
		{onBoidLibraryChanged}
	/>
{/if}

