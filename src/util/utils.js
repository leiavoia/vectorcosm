
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
export function BiasedRand(min, max, bias, influence /* 0.0..1.0 */) {
	let rnd = Math.random() * (max - min) + min;   // random in range
	let mix = Math.random() * influence;           // random mixer - higher influence number means more spread
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