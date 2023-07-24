
export function DecToHex( n ) { 
	n = n.toString(16);
	if ( n.length % 2 ) { n = '0' + n; }
	return n;
	}
	
export function HexToDec( n ) { 
	return parseInt(n, 16);
	}


// converts "#000000" -> "rgb(x,y,z)"
export function HexColorToRGB( hex ) {
	hex = hex.replace('#','').trim();
	let str = 'rgb(';
	str += HexToDec(hex.substr(0,2)) + ',';
	str += HexToDec(hex.substr(2,2)) + ',';
	str += HexToDec(hex.substr(4,2)) + ')';
	return str;
	}
	
// converts "#000000" -> [x,y,z]
export function HexColorToRGBArray( hex ) {
	hex = hex.replace('#','').trim();
	// convert shorthand to longhand
	if ( hex.length <= 4 ) {
		hex = hex.split('').map( p => p+p ).join('');
	}			
	let arr = [
		HexToDec(hex.substr(0,2)),
		HexToDec(hex.substr(2,2)),
		HexToDec(hex.substr(4,2)),
		]
	return arr;
	}
	
// converts [x,y,z] -> "#000000"
export function RGBArrayToHexColor( arr ) {
	let str = '#' +
		DecToHex(arr[0]) +
		DecToHex(arr[1]) +
		DecToHex(arr[2]) ;
	if ( typeof arr[3] !== 'undefined' ) { str += DecToHex(arr[3]); }
	return str;
	}
	
// converts "rgb(x,y,z)" -> "#000000"
export function RGBToHexColor( rgb ) {
	let matches = rgb.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
	let str = '#';
	str += DecToHex( matches[1] || 1 );
	str += DecToHex( matches[2] || 1 );
	str += DecToHex( matches[3] || 1 );
	return str;
	}
	
	
export function angleToPoint(x1, y1, x2, y2){
	d = distance(x1, y1, x2, y2);
	dx = (x2-x1) / d;
	dy = (y2-y1) / d;
	a = Math.acos(dx);
	a = dy < 0 ? 2 * Math.PI - a : a;
	return a;
}

export function clamp( x, min=null, max=null ) {
	if ( min !== null ) { x = Math.max(x,min); }
	if ( max !== null ) { x = Math.min(Math.max(x,min),max); }
	return x;
	}
			
export function mod (n, m) { return (n % m + m) % m; }
		

String.prototype.uppercaseFirst = function() {
	return this.charAt(0).toUpperCase() + this.slice(1);
	};
	
Number.prototype.clamp = function(min, max) {
	return Math.min(Math.max(this, min), max);
	};

Array.prototype.unique = function() {
	let arr=[];
	for ( var i = 0; i < this.length; i++ ) {
		if ( arr.indexOf(this[i]) == -1 ) {
			arr.push(this[i]); 
			}
		}
	return arr;
	}
Array.prototype.shuffle = function() {
	for (let i = this.length - 1; i > 0; i--) {
		let j = Math.floor(Math.random() * (i + 1));
		let temp = this[i];
		this[i] = this[j];
		this[j] = temp;
		}
	return this;
	}
	
Array.prototype.pickRandom = function() {
	if ( this.length === 0 ) { return false; }
	const i = Math.floor( Math.random() * this.length );
	return this[i];
	}
	
Array.prototype.contains = function( obj ) {
	return this.indexOf( obj ) > -1;
	}
	
Array.prototype.sum = function() {
	let total = 0;
	for ( let i of this ) { total += i; }
	return total;
	}
	
Array.prototype.avg = function() {
	return this.length ? ( this.sum() / this.length ) : 0;
	}

export function Clamp( n, min, max ) { 
	return Math.min(Math.max(n, min), max);
	}
	
export function RandomFloat( min, max ) { 
	min = Number.parseFloat(min);
	max = Number.parseFloat(max);
	return (Math.random() * ((max+1)-min) ) + min;
	}
export function RandomInt( min, max ) { 
	min = Number.parseInt(min);
	max = Number.parseInt(max);
	return Math.floor( (Math.random() * ((max+1)-min) ) + min );
	}
	
// http://stackoverflow.com/questions/29325069/how-to-generate-random-numbers-biased-towards-one-value-in-a-range
export function BiasedRand(min, max, bias, influence /* 0.0..1.0 more influence = less range */) {
	let rnd = Math.random() * (max - min) + min;   // random in range
	let mix = 1 - ( Math.random() * influence );   // random mixer - higher influence number means more spread
	return rnd * (1 - mix) + bias * mix;           // mix full range and bias
	}
export function BiasedRandInt(min, max, bias, influence) {
	return Math.floor( BiasedRand(min, max+0.99999, bias, influence) );
	}

export function standardRandom() {
// 	return (1.0 + (((Math.random() + Math.random() + Math.random() + Math.random() + Math.random() + Math.random()) - 3.0) / 3.0)) * 0.5;
// 	return (1.0 + (((Math.random() + Math.random() + Math.random() + Math.random()) - 2) / 2)) * 0.5;
	return (1.0 + (((Math.random() + Math.random() + Math.random() ) - 1.5) / 1.5)) * 0.5;
	}
	
export function adjustColor(color, percent) {
	if ( !color.match(/#*[A-E0-9]{3,8}/i) ) { return color; }
	color = color.replace('#','').trim();
	// convert shorthand to longhand
	if ( color.length <= 4 ) {
		color = color.split('').map( p => p+p ).join('');
	}
			
	// Parse the color string into its individual RGB components
	const red = parseInt(color.slice(0, 2), 16);
	const green = parseInt(color.slice(2, 4), 16);
	const blue = parseInt(color.slice(4, 6), 16);
	const alpha = color.slice(6, 8);

	// Calculate the new RGB values
	const newRed = Math.trunc(red + (red*percent));
	const newGreen = Math.trunc(green + (green*percent));
	const newBlue = Math.trunc(blue + (blue*percent));

	// Clamp the RGB values to ensure they are within the valid range of 0-255
	const clampedRed = Math.max(0, Math.min(255, newRed));
	const clampedGreen = Math.max(0, Math.min(255, newGreen));
	const clampedBlue = Math.max(0, Math.min(255, newBlue));

	// Convert the new RGB values back to a color string
	const adjustedColor = "#" +
		clampedRed.toString(16).padStart(2, '0') +
		clampedGreen.toString(16).padStart(2, '0') +
		clampedBlue.toString(16).padStart(2, '0') + 
		alpha
		;

	return adjustedColor;
}	

export class RandomPicker {
	// arr = weights, e.g.:
	// [ ['foo',5], ['bar',9], ['joo',20] ]
	constructor(arr) {
		let sum = 0;
		let i = 0;
		// find sum of all weights and accumulate the new values
		for (i = 0; i < arr.length; i++) {
			sum += arr[ i ][ 1 ];
			arr[ i ][ 1 ] = sum;
		}
		// find the normalized values for each weight
		for (i = 0; i < arr.length; i++) {
			arr[ i ][ 1 ] /= sum;
		}
		// save array
		this.items = arr;
	}
	Pick() {
		if ( !this.items.length ) { return null; }
		if ( this.items.length===1 ) { return this.items[0][0]; }
		let n = Math.random();
		for ( let i of this.items ) {
			if ( n <= i[1] ) { return i[0]; }
		}
		return this.items[this.items.length-1][0];
	}

}


// Civ.colors = [
// 	[128, 0, 0], 		// maroon
// 	[45, 130, 220], 	// blue
// 	[219, 210, 72], 	// yellow
// 	[10, 128, 30], 		// forest green
// 	[15, 120, 155],		// teal
// 	[192, 192, 192], 	// silver
// 	[255, 0, 0], 		// red
// 	[0, 220, 0], 		// green
// 	[100, 100, 100], 	// grey
// 	[128, 128, 0], 		// olive
// 	[20, 66, 170], 		// navy
// 	[255, 0, 255],		// fuschia
// 	[128, 0, 128],		// purple
// 	[0, 255, 255],		// aqua
// 	[140,205,140],		// spring green
// 	[195,144,212],		// lavender
// 	[212,161,144],		// mid brown
// 	[120,80,24],		// dark brown
// 	[222,195,144],		// tan
// 	[190,102,40],		// dull orange
// 	[255,149,0],		// orange 
// 	[162,255,31],		// chartreuse
// 	[230,119,119],		// salmon
// 	[255,186,206]		// pink
// 	];
// Civ.colors.shuffle();

export function RandomColor( as_hex=true, inc_transp=false, bright=false ) {
	let c = [ 
		RandomInt(0,255),
		RandomInt(0,255),
		RandomInt(0,255),
	];
	if ( bright ) {
		while ( c[0] + c[1] + c[2] < 600 ) {
			const i = RandomInt(0,2);
			c[i] += Math.min( 20, 255 - c[i] );
		}
	}
	if ( inc_transp ) { c.push( RandomInt(0,255) ); }
	return as_hex ? RGBArrayToHexColor(c) : c;
}

export function RandomName(maxlength = 10) {
	let ok = false;
	let str = '';
	while (!ok) {
		str = '';
		// split into vowels and consenants.
		// extra letters pad the probabilities a little bit.
		let parts = [
			[ 'd', 'k', 'l', 'n', 'p', 'r', 's', 't', 'b', 'c', 'd', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'sh', 'th', 'zh', 'n' ],
			[ 'a', 'e', 'i', 'o', 'u', 'a', 'e', 'i', 'o', 'a' ]
		];
		// this uses a simple markov-chain 2-state machine.
		// a beautiful solution to random name generation.
		// see: http://setosa.io/ev/markov-chains/
		let state = 0;
		// pick a random maximum number of letter-parts for this name
		let num_parts = Math.floor(Math.random() * (maxlength - 1)) + 1;
		// foreach part
		for (let i = 0; i <= num_parts; i++) {
			// prefer to start words with a consenent more often than not
			if (!i && Math.random() >= 0.20) {state = 0;}
			// switch the state machine. The magic numbers here give 
			// decent names for stars
			else if (state == 0 && Math.random() >= 0.20) {state = 1;}
			else if (state == 1 && Math.random() >= 0.28) {state = 0;}
			str = str + parts[ state ][ Math.floor(Math.random() * parts[ state ].length) ];
		}
		// remove idiotic repeating letters
		str = str.replace(/(.)\1+/gi, "$1", str);
		// check for nutsy combos
		if (
			str.length >= 4
			&& !str.match(/[aeiou]{3}/) // 3 vowels in a row = bad
			&& !str.match(/[bcdfghjklmnpqrstvwxz]{3}/) // 3 consenants = bad
			// a few specific names we would really prefer to avoid
			&& !/fuck|fuq|fuk|shit|crap|cunt|dung|dick|butt|barf|poop|pee|piss|dang|fart|puke|loser|boob/g.test(str)
		) {ok = true;}
	}
	return str;
}
	