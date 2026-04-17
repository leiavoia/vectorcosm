import {defineConfig} from 'vite'
import {svelte} from '@sveltejs/vite-plugin-svelte'
import {resolve} from 'path'

// https://vite.dev/config/
export default defineConfig({
	plugins: [ svelte() ],
	base: "./",
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, 'index.html'),
				lab:  resolve(__dirname, 'lab.html'),
			}
		}
	}
})
