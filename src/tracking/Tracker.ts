import * as THREE from "three/webgpu";
import {
    Landmark,
    NormalizedLandmark,
	DrawingUtils, 
} from "@mediapipe/tasks-vision"; 
import { lookAt, LookAtPoleAxis } from "./util/lookAt";

 

const v = new THREE.Vector3();
const A = new THREE.Vector3();
const B = new THREE.Vector3();
const C = new THREE.Vector3();

export class Tracker<T extends Record<string, number|number[]> > {
	private objectGhost : Map<THREE.Object3D, Ghost> ;
	readonly root:THREE.Object3D;

	/**
	 * per landmark index, it points to it's object3D equivalent.
	 */
	protected marks: { [name in keyof T]: Mark } = {} as { [name in keyof T]: Mark };

	constructor( protected readonly points:T, private readonly debugConnections?:{start:number,end:number}[] ){
		this.root = new THREE.Object3D();
		this.objectGhost = new Map();

		// por each key in points
		for( let key in this.points ){
			this.marks[key] = new Mark();
 
			this.root.add(this.marks[key]);
		}
	}

	protected updateLandmarks( landmarks:Landmark[], debugLandmarks?:NormalizedLandmark[], debugDrawer?:DrawingUtils ) {
		for( let key in this.points ){
			const point = this.points[key];
			const mark = this.marks[key];
			if( mark ){
				if( point instanceof Array )
				{
					
					v.copy( landmarks[ point[0] ] ) 
					mark.position.copy( landmarks[ point[1] ] ).sub( v ).divideScalar(2).add(landmarks[ point[0] ]);
					
					if( point.length==4 )
					{
						v.subVectors(
							landmarks[ point[3] ],
							landmarks[ point[2] ]
						).divideScalar(2).add(landmarks[ point[2] ]) 

						.sub( mark.position )
						.divideScalar(2) 

						mark.position.add( v );
					}
					
				}
				else 
				{
					mark.position.copy( landmarks[ point as number ] )
				}
 
			}
		}

		if( debugDrawer && debugLandmarks )
		{ 
			// debugDrawer.drawLandmarks(debugLandmarks, {
			// 	radius: (data) =>
			// 		DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
			// 	lineWidth:1
			// });
			debugDrawer.drawConnectors(
				debugLandmarks,
				this.debugConnections,
				{
					lineWidth:1
				}
			); 
		}
	}

	protected getGhost( object:THREE.Object3D ){
		if( !this.objectGhost.has(object)) 
		{
			const o = new Ghost()

			o.position.copy(object.position)
			o.quaternion.copy(object.quaternion)
			object.parent?.add(o);

			this.objectGhost.set(object, o)
		} 
		return this.objectGhost.get(object)!;
	}

	predict( source:TexImageSource, drawingUtils:DrawingUtils ){
		throw new Error("Method 'predict' must be implemented.");
	}

	sync ( delta:number, objects: [THREE.Object3D, keyof T, keyof T, LookAtPoleAxis][] ) {
		throw new Error("Method 'sync' must be implemented."); 
	}

	test( key:keyof T ){
		this.marks[key]!.position.set(1,2,3)
	}

	protected syncObjects(objects: [THREE.Object3D, keyof T, keyof T,LookAtPoleAxis][], delta:number, normal:THREE.Vector3 ){
		for( const [object, root, target, poleAxis] of objects ){

			//
			// position A and B where the landmarks are
			//
			this.marks[target].getWorldPosition(B)
			this.marks[root].getWorldPosition(A)

			//
			// calcuate the offset
			//
			const offset = B.sub(A); // offset from root to taget in world units

			//
			// now position A in object position
			//
			object.getWorldPosition(A)

			//
			// and displace it by the offset ( this will be the look at target )
			//
			A.add(offset);

			 
			const objectLookAtGoal = A;
			const polePosition = object.getWorldPosition(B).sub( normal )

			const ghost = this.getGhost(object);
 

			 
				lookAt( ghost, objectLookAtGoal, polePosition, poleAxis);

				ghost.rotateX( Math.PI/2) 
			
			//ghost.rotateY( Math.PI/2)

			object.position.lerp(ghost.position, delta * 4)
			object.quaternion.slerp(ghost.quaternion, delta * 4) 
		}
	}

	protected getBone( rig:THREE.Object3D, name:string ){
		return rig.getObjectByName(name.replace(/[\.\:]/g,"")) ;
	}
}

// const t = {
// 	pepe:[1,2]
// }
// const d = new Tracker(t)
// d.test("pepe")

class Mark extends THREE.Mesh {
	private _worldPosition = new THREE.Vector3();
	constructor() {
		super(new THREE.SphereGeometry(0.01,3,3), new THREE.MeshStandardMaterial({ color: 0xff0000, wireframe:true }));
		this.add( new THREE.AxesHelper(0.001))
	}

	get worldPosition(){
		this.getWorldPosition(this._worldPosition);
		return this._worldPosition;
	}
}

class Ghost extends THREE.Object3D { 
	lerp( target:THREE.Object3D, delta:number, speed = 8 )
	{
		target.position.lerp(this.position, delta * speed)
		target.quaternion.slerp(this.quaternion, delta * speed) 
	}
}