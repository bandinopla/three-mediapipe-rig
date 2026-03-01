import { Object3D, Vector3 } from "three/webgpu";


/**
 * Gets the position of `object` relative to `root`.
 * @param out 
 * @param object 
 * @param root 
 * @returns 
 */
export function rootPosition( out:Vector3, object:Object3D, root:Object3D ) {

	root.worldToLocal( object.getWorldPosition(out) )

	return out;
}