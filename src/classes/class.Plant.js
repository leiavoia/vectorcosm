

	// class Plant {
	// 	constructor(x=0,y=0,scale=1) {
	// 		scale = utils.clamp(scale,0.1,10);
	// 		this.x = x;
	// 		this.y = y;
	// 		let leaves = Math.trunc( Math.random() * 2 ) + 2;
	// 		this.geo = two.makeGroup();
	// 		for ( let i=0; i < leaves; i++ ) {
	// 			let h = Math.random()*400*scale + 200;
	// 			let w = Math.random()*300*scale + 200;
	// 			let tip_x = x + ((w * Math.random() * 0.6) - (w * Math.random() * 0.3));
	// 			let points = [
	// 				(x + (Math.random() * 60 * scale)) - (30*scale), // root
	// 				y+50,
	// 				Math.max(x,tip_x) + Math.random() * w / 2,
	// 				y - (Math.random() * h/2 + h/2),
	// 				tip_x,
	// 				y-h,
	// 				Math.min(x,tip_x) - Math.random() * w / 2,
	// 				y - (Math.random() * h/2 + h/2)
	// 			];
	// 			let path = two.makePath(...points);
	// 			path.linewidth = 2;
	// 			path.stroke = utils.adjustColor('#AEA1',0.1);
	// 			path.fill = utils.adjustColor('#AEA2',0.1);
	// 			this.geo.add( path );
	// 		}
	// 	}
	// }

	// let num_plants = 1 + (Math.random()*8);
	// for ( let i=0; i < num_plants; i++ ) {
	// 	let plant = new Plant(
	// 		(Math.random()*world.width + Math.random()*world.width) / 2,
	// 		world.height,
	// 		(Math.random() * 2 + 0.5)
	// 		);
	// }